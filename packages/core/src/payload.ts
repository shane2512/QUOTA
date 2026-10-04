import { keccak256, toBytes, type Hex } from "viem";

/// Request binding: the proof's x = hashToField(payloadHash), so a proof is only valid for the request it was made
/// for. Client and server must compute payloadHash identically; these helpers are the single definition.

/// JSON with object keys sorted recursively; arrays keep their order. undefined object values are dropped.
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "bigint") return JSON.stringify(v.toString());
    return JSON.stringify(v) ?? "null";
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/// Body as hashed: "" when empty, canonical JSON when it parses as JSON, otherwise the raw text.
export function bodyForHash(body: string | object | undefined | null): string {
  if (body === undefined || body === null || body === "") return "";
  if (typeof body === "object") return canonicalJson(body);
  try {
    return canonicalJson(JSON.parse(body));
  } catch {
    return body;
  }
}

/// HTTP: keccak256("QUOTA/http/v1\n" + METHOD + "\n" + path?query + "\n" + body).
export function httpPayloadHash(method: string, pathAndQuery: string, body?: string | object | null): Hex {
  return keccak256(toBytes(`QUOTA/http/v1\n${method.toUpperCase()}\n${pathAndQuery}\n${bodyForHash(body)}`));
}

/// MCP tools/call: keccak256("QUOTA/mcp-tool/v1\n" + tool + "\n" + canonicalJson(arguments)).
export function toolPayloadHash(tool: string, args: Record<string, unknown> | undefined): Hex {
  return keccak256(toBytes(`QUOTA/mcp-tool/v1\n${tool}\n${canonicalJson(args ?? {})}`));
}

/// Key under which an MCP request carries the proof in params._meta.
export const MCP_META_KEY = "quota/proof";
