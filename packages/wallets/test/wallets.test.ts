import { test } from "node:test";
import assert from "node:assert/strict";
import { SECRET_MESSAGE, secretMessage } from "@quota/client";
import { DynamicServiceWallet, PrivyAgentWallet, agentPolicyRules } from "../src/index.ts";

const REG = "0xd89BFd2f093015193d42EA51170D64d9242a40C6" as const;

test("agent policy: registry-only signTransaction on one chain under a cap; RLN-secret messages only", () => {
  const [tx, msg] = agentPolicyRules({ registry: REG, chainId: 10143, valueCapWei: 10n ** 17n });
  assert.equal(tx.method, "eth_signTransaction");
  assert.deepEqual(
    tx.conditions.map((c) => [c.field, c.operator, c.value]),
    [["to", "eq", REG.toLowerCase()], ["chain_id", "eq", "10143"], ["value", "lte", "100000000000000000"]],
  );
  assert.equal(msg.method, "personal_sign");
  assert.deepEqual([msg.conditions[0].operator, msg.conditions[0].value], ["starts_with", SECRET_MESSAGE]);
  assert.ok(secretMessage(3).startsWith(SECRET_MESSAGE)); // rotated identities stay inside the policy
  for (const r of [tx, msg]) assert.ok(r.name.length < 50, "Privy rejects rule names of 50+ characters");
});

test("PrivyAgentWallet maps a viem transaction to Privy's eth_signTransaction params and passes our key", async () => {
  const calls: unknown[] = [];
  const fake = {
    wallets: () => ({
      ethereum: () => ({
        signTransaction: async (id: string, input: unknown) => (calls.push([id, input]), { signed_transaction: "0x02abc" }),
        signMessage: async (id: string, input: unknown) => (calls.push([id, input]), { signature: "0xsig" }),
      }),
    }),
  };
  const w = new PrivyAgentWallet(fake as never, "wallet-1", "0x0000000000000000000000000000000000000001", "wallet-auth:KEY");
  const signed = await w.signTransaction({ type: "eip1559", chainId: 10143, nonce: 7, to: REG, data: "0x1234", value: 30n, gas: 21000n, maxFeePerGas: 120n, maxPriorityFeePerGas: 1n });
  assert.equal(signed, "0x02abc");
  const [id, input] = calls[0] as [string, { params: { transaction: Record<string, unknown> }; authorization_context: unknown }];
  assert.equal(id, "wallet-1");
  assert.deepEqual(input.params.transaction, {
    type: 2, chain_id: "0x279f", nonce: "0x7", to: REG, data: "0x1234", value: "0x1e", gas_limit: "0x5208",
    max_fee_per_gas: "0x78", max_priority_fee_per_gas: "0x1", gas_price: undefined,
  });
  assert.deepEqual(input.authorization_context, { authorization_private_keys: ["wallet-auth:KEY"] });
  assert.equal(await w.signMessage("QUOTA/rln-secret/v1"), "0xsig");
  assert.equal(JSON.stringify(w).includes("KEY"), false, "authorization key never serialized");
});

test("DynamicServiceWallet retries a failed MPC signature, then gives up after the attempt budget", async () => {
  let n = 0;
  const flaky = { signTransaction: async () => (++n < 3 ? Promise.reject(new Error("Message signing timed out")) : "0x02ok") };
  const retries: number[] = [];
  const w = DynamicServiceWallet.fromClient(flaky as never, { accountAddress: "0x0000000000000000000000000000000000000002" }, "pw");
  w.onRetry = (i) => void retries.push(i);
  assert.equal(await w.signTransaction({ type: "eip1559", chainId: 1, nonce: 0, to: REG, gas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }), "0x02ok");
  assert.deepEqual(retries, [1, 2]);
  const down = DynamicServiceWallet.fromClient({ signTransaction: async () => Promise.reject(new Error("down")) } as never, { accountAddress: "0x0000000000000000000000000000000000000002" }, "pw");
  await assert.rejects(down.signTransaction({ type: "eip1559", chainId: 1, nonce: 0, to: REG, gas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }), /down/);
  assert.equal(JSON.stringify(w).includes("pw"), false, "password never serialized");
});
