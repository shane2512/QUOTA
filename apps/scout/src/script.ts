import type { PlannerStep } from "./llm.ts";

/// TEST TOOLING: a fixed plan that exercises every Scout tool against live servers, for use before a model key
/// exists. It is not "Scout deciding"; the real planner is the LLM (OpenAICompatPlanner).
export function demoScript(servers: string[], topupTo?: number): PlannerStep[] {
  const [a, b] = [servers[0], servers[1] ?? servers[0]];
  let n = 0;
  const call = (name: string, args: Record<string, unknown>) => ({ id: `s${++n}`, name, arguments: args });
  return [
    { content: "check budget", toolCalls: [call("quota_status", {})] },
    { content: "find candidate pages", toolCalls: [call("call_tool", { server: a, tool: "web_search", args: { query: "Merkle tree", limit: 3 } })] },
    { content: "switch to the summary server for details", toolCalls: [call("switch_server", { server: b })] },
    { content: null, toolCalls: [call("call_tool", { tool: "page_summary", args: { title: "Merkle tree" } })] },
    { content: null, toolCalls: [call("call_tool", { tool: "page_summary", args: { title: "Rate limiting" } })] },
    { content: "budget check", toolCalls: [call("quota_status", {})] },
    ...(topupTo ? [{ content: "raise the limit", toolCalls: [call("topup_stake", { messages_per_epoch: topupTo })] }, { content: null, toolCalls: [call("quota_status", {})] }] : []),
    { content: "(scripted plan finished; no model involved)", toolCalls: [] },
  ];
}
