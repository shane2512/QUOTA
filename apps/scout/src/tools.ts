import { QuotaExhausted } from "@quota/client";
import type { ToolCall, ToolSpec } from "./llm.ts";

/// One QUOTA-protected MCP server Scout can use.
export interface ServerConn {
  name: string; // short name the model uses
  serverId: string; // QUOTA namespace (per-server quota)
  tools: { name: string; description: string }[];
  call(tool: string, args: Record<string, unknown>, meta: Record<string, string>): Promise<{ isError: boolean; text: string }>;
}

/// Scout's staked identity: proofs, remaining quota, and raising the limit.
export interface QuotaAccount {
  limit(): bigint;
  remaining(serverId: string): bigint;
  secondsToNextEpoch(): number;
  /// `_meta` carrying an RLN proof for this call; throws QuotaExhausted instead of reusing a message id.
  proofMeta(serverId: string, tool: string, args: Record<string, unknown>): Promise<Record<string, string>>;
  stake(): Promise<{ stakeWei: bigint; unitWei: bigint }>;
  /// Add stake if needed and raise the per-epoch limit (operator approval required on-chain).
  raiseLimit(newLimit: bigint): Promise<{ limit: bigint; txs: string[] }>;
}

const mon = (wei: bigint) => (Number(wei) / 1e18).toFixed(4);

/// The four tools of PRD D1, as the model sees them.
export class ScoutTools {
  current: string;
  readonly log: { tool: string; args: unknown; result: string }[] = [];

  constructor(
    private servers: ServerConn[],
    private account: QuotaAccount,
    private o: { maxLimit?: bigint } = {},
  ) {
    if (servers.length === 0) throw new Error("no servers");
    this.current = servers[0].name;
  }

  specs(): ToolSpec[] {
    const names = this.servers.map((s) => s.name);
    return [
      {
        name: "quota_status",
        description:
          "Your anonymous rate-limit budget: per server, how many calls remain this epoch, the per-epoch limit, seconds until the epoch resets, and your stake. Free (does not use quota).",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "call_tool",
        description:
          "Call a tool on a QUOTA-protected MCP server. Each call uses one message of that server's quota for this epoch. If the server's quota is exhausted the call is refused (never resend: reusing a quota slot forfeits your stake).",
        parameters: {
          type: "object",
          properties: {
            server: { type: "string", enum: names, description: "server name; defaults to the current server" },
            tool: { type: "string", description: "tool name on that server" },
            args: { type: "object", description: "tool arguments" },
          },
          required: ["tool", "args"],
          additionalProperties: false,
        },
      },
      {
        name: "switch_server",
        description: "Make another server the default for call_tool (quotas are separate per server).",
        parameters: { type: "object", properties: { server: { type: "string", enum: names } }, required: ["server"], additionalProperties: false },
      },
      {
        name: "topup_stake",
        description:
          "Stake more MON to raise your per-epoch limit on every server to `messages_per_epoch`. Costs real stake (limit × unit) plus gas and needs the operator's passkey approval; use only if the task truly needs more calls this epoch.",
        parameters: {
          type: "object",
          properties: { messages_per_epoch: { type: "integer", minimum: 1 } },
          required: ["messages_per_epoch"],
          additionalProperties: false,
        },
      },
    ];
  }

  describeServers(): string {
    return this.servers
      .map((s) => `- ${s.name} (quota id ${s.serverId}): ${s.tools.map((t) => `${t.name} — ${t.description.split(".")[0]}`).join("; ")}`)
      .join("\n");
  }

  async execute(call: ToolCall): Promise<string> {
    let result: string;
    try {
      result = await this.#run(call);
    } catch (e) {
      result = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
    }
    this.log.push({ tool: call.name, args: call.arguments, result });
    return result;
  }

  async #run(c: ToolCall): Promise<string> {
    const a = c.arguments;
    switch (c.name) {
      case "quota_status": {
        const { stakeWei, unitWei } = await this.account.stake();
        return JSON.stringify({
          current_server: this.current,
          limit_per_epoch: Number(this.account.limit()),
          seconds_to_next_epoch: this.account.secondsToNextEpoch(),
          stake_mon: mon(stakeWei),
          stake_unit_mon_per_message: mon(unitWei),
          remaining: Object.fromEntries(this.servers.map((s) => [s.name, Number(this.account.remaining(s.serverId))])),
        });
      }
      case "switch_server": {
        const s = this.#server(String(a.server));
        this.current = s.name;
        return JSON.stringify({ current_server: s.name, remaining: Number(this.account.remaining(s.serverId)) });
      }
      case "call_tool": {
        const s = this.#server(a.server === undefined ? this.current : String(a.server));
        const tool = String(a.tool);
        if (!s.tools.some((t) => t.name === tool)) return JSON.stringify({ error: `server ${s.name} has no tool ${tool}`, tools: s.tools.map((t) => t.name) });
        const args = (a.args && typeof a.args === "object" ? a.args : {}) as Record<string, unknown>;
        let meta: Record<string, string>;
        try {
          meta = await this.account.proofMeta(s.serverId, tool, args);
        } catch (e) {
          if (e instanceof QuotaExhausted) {
            return JSON.stringify({ error: `quota exhausted on ${s.name} for this epoch`, hint: "switch_server, wait for the next epoch, or topup_stake" });
          }
          throw e;
        }
        const r = await s.call(tool, args, meta);
        return JSON.stringify({ server: s.name, ok: !r.isError, result: r.text.slice(0, 4000), remaining: Number(this.account.remaining(s.serverId)) });
      }
      case "topup_stake": {
        const want = BigInt(Math.trunc(Number(a.messages_per_epoch)));
        if (want <= this.account.limit()) return JSON.stringify({ error: `limit is already ${this.account.limit()}` });
        if (this.o.maxLimit !== undefined && want > this.o.maxLimit) return JSON.stringify({ error: `operator caps the limit at ${this.o.maxLimit}` });
        const r = await this.account.raiseLimit(want);
        return JSON.stringify({ limit_per_epoch: Number(r.limit), txs: r.txs });
      }
      default:
        return JSON.stringify({ error: `unknown tool ${c.name}` });
    }
  }

  #server(name: string): ServerConn {
    const s = this.servers.find((x) => x.name === name);
    if (!s) throw new Error(`unknown server ${name}; known: ${this.servers.map((x) => x.name).join(", ")}`);
    return s;
  }
}
