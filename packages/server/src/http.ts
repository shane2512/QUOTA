import { MCP_META_KEY, PROOF_HEADER, httpPayloadHash, toolPayloadHash } from "@quota/core";
import type { QuotaVerifier, VerifyResult } from "./index.ts";

type Failure = Extract<VerifyResult, { ok: false }>["reason"] | "missing";

/// HTTP status for a rejected request: 409 replay, 429 violation (over quota; the agent is being slashed), else 401.
export function statusFor(reason: Failure): number {
  if (reason === "replay") return 409;
  if (reason === "violation") return 429;
  return 401;
}

const errorBody = (reason: Failure) => ({ error: "quota", reason });

// ---------------------------------------------------------------- Express (structural types: no express import)

interface ExpressReq {
  method: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  quota?: { nullifier: bigint; epoch: bigint };
}
interface ExpressRes {
  status(code: number): ExpressRes;
  json(body: unknown): unknown;
}

/// Express middleware (PRD S2). Mount after express.json() so JSON bodies are hashed canonically.
export function quotaExpress(verifier: QuotaVerifier) {
  return async (req: ExpressReq, res: ExpressRes, next: (err?: unknown) => void) => {
    try {
      const h = req.headers[PROOF_HEADER];
      const header = Array.isArray(h) ? h[0] : h;
      if (!header) return void res.status(401).json(errorBody("missing"));
      const body = req.body as string | object | undefined;
      const r = await verifier.verifyHeader(header, httpPayloadHash(req.method, req.originalUrl ?? req.url, body));
      if (!r.ok) return void res.status(statusFor(r.reason)).json(errorBody(r.reason));
      req.quota = { nullifier: r.nullifier, epoch: r.epoch };
      next();
    } catch (e) {
      next(e);
    }
  };
}

// ---------------------------------------------------------------- Hono (structural types: no hono import)

interface HonoCtx {
  req: { method: string; url: string; header(name: string): string | undefined; text(): Promise<string> };
  json(body: unknown, status?: number): Response;
}

/// Hono middleware (PRD S2). Reads the body as text (Hono caches it, so handlers can still call c.req.json()).
export function quotaHono(verifier: QuotaVerifier) {
  return async (c: HonoCtx, next: () => Promise<void>): Promise<Response | void> => {
    const header = c.req.header(PROOF_HEADER);
    if (!header) return c.json(errorBody("missing"), 401);
    const url = new URL(c.req.url);
    const body = c.req.method === "GET" || c.req.method === "HEAD" ? "" : await c.req.text();
    const r = await verifier.verifyHeader(header, httpPayloadHash(c.req.method, url.pathname + url.search, body));
    if (!r.ok) return c.json(errorBody(r.reason), statusFor(r.reason));
    await next();
  };
}

// ---------------------------------------------------------------- MCP tools (structural: no SDK import)

interface ToolExtra {
  _meta?: Record<string, unknown>;
}
interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [k: string]: unknown;
}

/// Wrap an MCP tool handler (McpServer.registerTool callback). The proof travels in params._meta["quota/proof"]
/// and is bound to (tool name, arguments). Rejections come back as tool errors, not transport errors.
export function quotaTool<A extends Record<string, unknown>, E extends ToolExtra, R extends ToolResult>(
  verifier: QuotaVerifier,
  tool: string,
  handler: (args: A, extra: E) => R | Promise<R>,
) {
  return async (args: A, extra: E): Promise<R | ToolResult> => {
    const header = extra?._meta?.[MCP_META_KEY];
    if (typeof header !== "string") return toolError("missing");
    const r = await verifier.verifyHeader(header, toolPayloadHash(tool, args));
    if (!r.ok) return toolError(r.reason);
    return handler(args, extra);
  };
}

function toolError(reason: Failure): ToolResult {
  return { isError: true, content: [{ type: "text", text: `quota: request rejected (${reason}, HTTP-equivalent ${statusFor(reason)})` }] };
}
