import { test } from "node:test";
import assert from "node:assert/strict";
import { QuotaExhausted } from "@quota/client";
import { OpenAICompatPlanner, ScriptedPlanner } from "../src/llm.ts";
import { runScout, systemPrompt } from "../src/scout.ts";
import { ScoutTools, type QuotaAccount, type ServerConn } from "../src/tools.ts";

function fakeAccount(limit = 2n) {
  const used = new Map<string, bigint>();
  let lim = limit;
  const raised: bigint[] = [];
  const acct: QuotaAccount = {
    limit: () => lim,
    remaining: (s) => lim - (used.get(s) ?? 0n),
    secondsToNextEpoch: () => 1200,
    proofMeta: async (s) => {
      const u = used.get(s) ?? 0n;
      if (u >= lim) throw new QuotaExhausted(s, 1n);
      used.set(s, u + 1n);
      return { "quota/proof": `proof-${s}-${u}` };
    },
    stake: async () => ({ stakeWei: lim * 10n ** 17n, unitWei: 10n ** 17n }),
    raiseLimit: async (n) => (raised.push(n), (lim = n), { limit: n, txs: ["0xtx"] }),
  };
  return { acct, raised, used };
}

function fakeServer(name: string, serverId: string, tool: string, calls: unknown[]): ServerConn {
  return {
    name,
    serverId,
    tools: [{ name: tool, description: `${tool}. Rate-limited.` }],
    call: async (t, args, meta) => (calls.push({ t, args, meta }), { isError: false, text: `${t}:${JSON.stringify(args)}` }),
  };
}

test("tools: call_tool attaches a proof per call, refuses when a server is exhausted, servers have separate quotas", async () => {
  const { acct } = fakeAccount(1n);
  const calls: unknown[] = [];
  const t = new ScoutTools([fakeServer("search", "s.q", "web_search", calls), fakeServer("summary", "m.q", "page_summary", calls)], acct);
  const ok = JSON.parse(await t.execute({ id: "1", name: "call_tool", arguments: { tool: "web_search", args: { query: "x" } } }));
  assert.equal(ok.ok, true);
  assert.equal(ok.remaining, 0);
  assert.deepEqual((calls[0] as { meta: unknown }).meta, { "quota/proof": "proof-s.q-0" });
  const refused = JSON.parse(await t.execute({ id: "2", name: "call_tool", arguments: { tool: "web_search", args: { query: "y" } } }));
  assert.match(refused.error, /quota exhausted on search/);
  assert.equal(calls.length, 1, "no request sent without a fresh message id");
  await t.execute({ id: "3", name: "switch_server", arguments: { server: "summary" } });
  const other = JSON.parse(await t.execute({ id: "4", name: "call_tool", arguments: { tool: "page_summary", args: { title: "T" } } }));
  assert.equal(other.server, "summary");
  assert.equal(other.ok, true);
  const wrong = JSON.parse(await t.execute({ id: "5", name: "call_tool", arguments: { server: "summary", tool: "web_search", args: {} } }));
  assert.match(wrong.error, /has no tool/);
});

test("tools: quota_status reports per-server remaining; topup_stake raises the limit within the operator cap", async () => {
  const { acct, raised } = fakeAccount(2n);
  const t = new ScoutTools([fakeServer("search", "s.q", "web_search", [])], acct, { maxLimit: 5n });
  const st = JSON.parse(await t.execute({ id: "1", name: "quota_status", arguments: {} }));
  assert.deepEqual(st.remaining, { search: 2 });
  assert.equal(st.limit_per_epoch, 2);
  assert.match(JSON.parse(await t.execute({ id: "2", name: "topup_stake", arguments: { messages_per_epoch: 9 } })).error, /caps the limit at 5/);
  assert.match(JSON.parse(await t.execute({ id: "3", name: "topup_stake", arguments: { messages_per_epoch: 2 } })).error, /already 2/);
  assert.equal(JSON.parse(await t.execute({ id: "4", name: "topup_stake", arguments: { messages_per_epoch: 4 } })).limit_per_epoch, 4);
  assert.deepEqual(raised, [4n]);
});

test("loop: planner tool calls are executed and fed back; the final answer ends the run", async () => {
  const { acct } = fakeAccount(3n);
  const calls: unknown[] = [];
  const tools = new ScoutTools([fakeServer("search", "s.q", "web_search", calls)], acct);
  const planner = new ScriptedPlanner([
    { content: null, toolCalls: [{ id: "a", name: "quota_status", arguments: {} }] },
    { content: "search", toolCalls: [{ id: "b", name: "call_tool", arguments: { tool: "web_search", args: { query: "RLN" } } }] },
    { content: "RLN uses a Merkle tree. https://en.wikipedia.org/wiki/Merkle_tree", toolCalls: [] },
  ]);
  const r = await runScout({ planner, tools, goal: "explain RLN" });
  assert.equal(r.steps, 3);
  assert.match(r.answer ?? "", /Merkle/);
  const toolMsgs = r.messages.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 2);
  assert.match(systemPrompt(tools), /search \(quota id s\.q\): web_search/);
});

test("OpenAI-compatible planner: request shape and tool-call parsing", async () => {
  let body: Record<string, unknown> = {};
  let url = "";
  let auth = "";
  const fakeFetch = (async (u: string, init: RequestInit) => {
    url = u;
    auth = (init.headers as Record<string, string>).authorization;
    body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "quota_status", arguments: "{}" } }] } }] }),
    );
  }) as unknown as typeof fetch;
  const p = new OpenAICompatPlanner({ baseUrl: "https://llm.example/v1/", apiKey: "KEY", model: "qwen-test" }, fakeFetch);
  const step = await p.next([{ role: "user", content: "hi" }], [{ name: "quota_status", description: "d", parameters: { type: "object" } }]);
  assert.equal(url, "https://llm.example/v1/chat/completions");
  assert.equal(auth, "Bearer KEY");
  assert.equal(body.model, "qwen-test");
  assert.deepEqual((body.tools as unknown[])[0], { type: "function", function: { name: "quota_status", description: "d", parameters: { type: "object" } } });
  assert.deepEqual(step.toolCalls, [{ id: "c1", name: "quota_status", arguments: {} }]);
  assert.equal(p.label.includes("KEY"), false);
});
