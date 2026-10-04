import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { SNARK_FIELD } from "@quota/core";
import { SECRET_MESSAGE, deriveSecret } from "../src/index.ts";

test("deriveSecret is deterministic per wallet, differs across wallets, and is a field element", async () => {
  const a = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const b = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const s1 = await deriveSecret((m) => a.signMessage({ message: m }));
  const s2 = await deriveSecret((m) => a.signMessage({ message: m }));
  const s3 = await deriveSecret((m) => b.signMessage({ message: m }));
  assert.equal(s1 === s2, true);
  assert.equal(s1 === s3, false);
  assert.ok(s1 > 0n && s1 < SNARK_FIELD);
  assert.equal(SECRET_MESSAGE, "QUOTA/rln-secret/v1");
});

test("FileUsageStore: a restarted agent continues its message-id count instead of reusing ids", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { FileUsageStore } = await import("../src/index.ts");
  const dir = mkdtempSync(join(tmpdir(), "quota-usage-"));
  try {
    const path = join(dir, "usage.json");
    const a = new FileUsageStore(path);
    assert.equal(a.get("s|1"), undefined);
    a.set("s|1", 3n);
    const b = new FileUsageStore(path); // "restart"
    assert.equal(b.get("s|1"), 3n);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
