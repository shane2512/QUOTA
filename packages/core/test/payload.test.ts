import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyForHash, canonicalJson, httpPayloadHash, toolPayloadHash } from "../src/index.ts";

test("canonicalJson sorts keys recursively and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1], c: null } }), '{"a":{"c":null,"d":[3,1]},"b":1}');
  assert.equal(canonicalJson({ a: undefined, b: "x" }), '{"b":"x"}');
  assert.equal(canonicalJson("s"), '"s"');
});

test("JSON bodies hash the same regardless of key order or whitespace; raw text is kept", () => {
  assert.equal(bodyForHash('{ "q": "m", "n": 1 }'), bodyForHash({ n: 1, q: "m" }));
  assert.equal(bodyForHash("not json"), "not json");
  assert.equal(bodyForHash(undefined), "");
  assert.equal(httpPayloadHash("post", "/a?x=1", '{"b":2,"a":1}'), httpPayloadHash("POST", "/a?x=1", { a: 1, b: 2 }));
});

test("payload hash changes with method, path, query, body, tool and arguments", () => {
  const base = httpPayloadHash("POST", "/a", "{}");
  for (const h of [httpPayloadHash("GET", "/a", "{}"), httpPayloadHash("POST", "/b", "{}"), httpPayloadHash("POST", "/a?x", "{}"), httpPayloadHash("POST", "/a", '{"k":1}')]) {
    assert.notEqual(h, base);
  }
  assert.notEqual(toolPayloadHash("t", { a: 1 }), toolPayloadHash("u", { a: 1 }));
  assert.notEqual(toolPayloadHash("t", { a: 1 }), toolPayloadHash("t", { a: 2 }));
  assert.equal(toolPayloadHash("t", { a: 1, b: 2 }), toolPayloadHash("t", { b: 2, a: 1 }));
  assert.notEqual(toolPayloadHash("t", {}), httpPayloadHash("t", "", "{}")); // domain-separated
});
