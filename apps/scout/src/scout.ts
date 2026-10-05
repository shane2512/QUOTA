import type { Message, Planner } from "./llm.ts";
import type { ScoutTools } from "./tools.ts";

export interface ScoutResult {
  answer: string | null;
  steps: number;
  messages: Message[];
}

export function systemPrompt(tools: ScoutTools): string {
  return [
    "You are Scout, a research agent. You reach tools only through MCP servers protected by QUOTA: anonymous,",
    "stake-backed rate limits. Each call_tool spends one message of that server's per-epoch quota. Servers cannot",
    "see who you are, but if you ever exceed a quota your stake is slashed, so the client refuses instead.",
    "Rules: check quota_status before planning; plan the fewest calls that answer the question; spread work across",
    "servers when one runs low; only topup_stake if the task cannot be finished otherwise and say why.",
    "When you have enough, answer concisely with sources (URLs) and stop calling tools.",
    "",
    "Servers:",
    tools.describeServers(),
  ].join("\n");
}

/// The agent loop: the planner proposes tool calls, Scout executes them, until the planner answers or maxSteps.
export async function runScout(o: {
  planner: Planner;
  tools: ScoutTools;
  goal: string;
  maxSteps?: number;
  onEvent?: (e: { kind: "tool" | "answer" | "thought"; text: string }) => void;
}): Promise<ScoutResult> {
  const messages: Message[] = [
    { role: "system", content: systemPrompt(o.tools) },
    { role: "user", content: o.goal },
  ];
  const max = o.maxSteps ?? 12;
  for (let step = 1; step <= max; step++) {
    const r = await o.planner.next(messages, o.tools.specs());
    if (r.toolCalls.length === 0) {
      o.onEvent?.({ kind: "answer", text: r.content ?? "" });
      messages.push({ role: "assistant", content: r.content });
      return { answer: r.content, steps: step, messages };
    }
    if (r.content) o.onEvent?.({ kind: "thought", text: r.content });
    messages.push({
      role: "assistant",
      content: r.content,
      tool_calls: r.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.arguments) } })),
    });
    for (const c of r.toolCalls) {
      const out = await o.tools.execute(c);
      o.onEvent?.({ kind: "tool", text: `${c.name}(${JSON.stringify(c.arguments)}) → ${out.slice(0, 300)}` });
      messages.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
  return { answer: null, steps: max, messages };
}
