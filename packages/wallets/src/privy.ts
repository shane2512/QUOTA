import { PrivyClient } from "@privy-io/node";
import { toHex, type Address, type Hex, type TransactionSerializable } from "viem";
import type { WalletAdapter } from "@quota/slasher";
import { SECRET_MESSAGE } from "@quota/client";

/// PRD W1/W2/W4: the agent's wallet is a Privy server wallet owned by the operator's Privy user. Our runtime
/// holds an authorization key that is an *additional signer* restricted by an override policy (registry calls on
/// one chain under a value cap, and signing the RLN-secret message). Sign-only: broadcasting is ours.
export class PrivyAgentWallet implements WalletAdapter {
  constructor(
    private privy: PrivyClient,
    readonly walletId: string,
    readonly address: Address,
    private authorizationKey: string, // PRIVY_AUTH_PRIVATE_KEY ("wallet-auth:..." accepted); never logged
  ) {}

  static async load(privy: PrivyClient, walletId: string, authorizationKey: string): Promise<PrivyAgentWallet> {
    const w = await privy.wallets().get(walletId);
    return new PrivyAgentWallet(privy, walletId, w.address as Address, authorizationKey);
  }

  async signTransaction(tx: TransactionSerializable): Promise<Hex> {
    const q = (v: bigint | number | undefined) => (v === undefined ? undefined : toHex(v));
    const t = tx as TransactionSerializable & { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint };
    const r = await this.privy.wallets().ethereum().signTransaction(this.walletId, {
      params: {
        transaction: {
          type: t.type === "legacy" ? 0 : 2,
          chain_id: q(t.chainId),
          nonce: q(t.nonce),
          to: t.to ?? undefined,
          data: t.data,
          value: q(t.value ?? 0n),
          gas_limit: q(t.gas),
          max_fee_per_gas: q(t.maxFeePerGas),
          max_priority_fee_per_gas: q(t.maxPriorityFeePerGas),
          gas_price: q(t.gasPrice),
        },
      },
      authorization_context: { authorization_private_keys: [this.authorizationKey] },
    });
    return r.signed_transaction as Hex;
  }

  async signMessage(message: string): Promise<Hex> {
    const r = await this.privy.wallets().ethereum().signMessage(this.walletId, {
      message,
      authorization_context: { authorization_private_keys: [this.authorizationKey] },
    });
    return r.signature as Hex;
  }

  toJSON(): unknown {
    return { walletId: this.walletId, address: this.address };
  }
}

/// The override policy for our runtime key. Everything not matched is denied (Privy policies are default-deny).
export function agentPolicyRules(o: { registry: Address; chainId: number; valueCapWei: bigint }) {
  return [
    {
      name: "registry only, one chain, value cap",
      method: "eth_signTransaction" as const,
      action: "ALLOW" as const,
      conditions: [
        { field_source: "ethereum_transaction" as const, field: "to" as const, operator: "eq" as const, value: o.registry.toLowerCase() },
        { field_source: "ethereum_transaction" as const, field: "chain_id" as const, operator: "eq" as const, value: String(o.chainId) },
        { field_source: "ethereum_transaction" as const, field: "value" as const, operator: "lte" as const, value: o.valueCapWei.toString() },
      ],
    },
    {
      name: "RLN secret message only",
      method: "personal_sign" as const,
      action: "ALLOW" as const,
      // identity n signs SECRET_MESSAGE or SECRET_MESSAGE + "/n" (secretMessage in @quota/client)
      conditions: [{ field_source: "message" as const, field: "content" as const, operator: "starts_with" as const, value: SECRET_MESSAGE }],
    },
  ];
}

/// Replace an existing agent policy's rules with the current agentPolicyRules (no owner set on our policies).
export async function updateAgentPolicy(privy: PrivyClient, policyId: string, o: { registry: Address; chainId: number; valueCapWei: bigint }) {
  return privy.policies().update(policyId, { rules: agentPolicyRules(o) } as never);
}

export interface AgentWalletSetup {
  userId: string;
  policyId: string;
  walletId: string;
  address: Address;
}

/// Create (1) the operator's Privy user, (2) the override policy, (3) the agent wallet owned by that user with our
/// key quorum as an additional signer bound to the policy. The operator keeps full control through their user.
export async function createAgentWallet(
  privy: PrivyClient,
  o: { operatorEmail: string; signerQuorumId: string; registry: Address; chainId: number; valueCapWei: bigint; label: string },
): Promise<AgentWalletSetup> {
  // Reuse the operator user if a previous run created it.
  const user = await privy
    .users()
    .getByEmailAddress({ address: o.operatorEmail })
    .catch(() => privy.users().create({ linked_accounts: [{ type: "email", address: o.operatorEmail }] } as never));
  const policy = await privy.policies().create({
    version: "1.0",
    name: `${o.label} agent policy`.slice(0, 50),
    chain_type: "ethereum",
    rules: agentPolicyRules(o),
  } as never);
  const wallet = await privy.wallets().create({
    chain_type: "ethereum",
    display_name: `${o.label} agent`,
    owner: { user_id: user.id },
    additional_signers: [{ signer_id: o.signerQuorumId, override_policy_ids: [policy.id] }],
  } as never);
  return { userId: user.id, policyId: policy.id, walletId: wallet.id, address: wallet.address as Address };
}
