/// Planner = the model that decides Scout's next step. Provider-agnostic: any OpenAI-compatible chat-completions
/// endpoint with tool calling (Qwen Cloud's compatible mode, OpenRouter, vLLM, ...). Swapping models is env-only.

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface PlannerStep {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface Planner {
  readonly label: string;
  next(messages: Message[], tools: ToolSpec[]): Promise<PlannerStep>;
}

/// OpenAI-compatible POST {baseUrl}/chat/completions with `tools`. Used with QWEN_BASE_URL / QWEN_MODEL / QWEN_API_KEY.
export class OpenAICompatPlanner implements Planner {
  readonly label: string;
  constructor(
    private o: { baseUrl: string; apiKey: string; model: string; temperature?: number },
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.label = `${o.model} @ ${new URL(o.baseUrl).host}`;
  }

  async next(messages: Message[], tools: ToolSpec[]): Promise<PlannerStep> {
    const r = await this.fetchImpl(`${this.o.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.o.apiKey}` },
      body: JSON.stringify({
        model: this.o.model,
        temperature: this.o.temperature ?? 0.2,
        messages,
        tools: tools.map((t) => ({ type: "function", function: t })),
        tool_choice: "auto",
      }),
    });
    if (!r.ok) throw new Error(`planner HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = (await r.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const m = d.choices[0]?.message;
    if (!m) throw new Error("planner returned no choices");
    return {
      content: m.content,
      toolCalls: (m.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    };
  }
}

function parseArgs(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return { _unparsed: s };
  }
}

/// TEST TOOLING: replays a fixed list of steps (no model). Used by tests and to exercise the tools on testnet before
/// a model key is available. Never presented as Scout's intelligence.
export class ScriptedPlanner implements Planner {
  readonly label = "scripted (no LLM)";
  #i = 0;
  constructor(private steps: PlannerStep[]) {}
  async next(): Promise<PlannerStep> {
    return this.steps[this.#i++] ?? { content: "done (script exhausted)", toolCalls: [] };
  }
}
