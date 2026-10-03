// snarkjs ships no types; only the two calls we use.
declare module "snarkjs" {
  export const groth16: {
    fullProve(input: Record<string, unknown>, wasm: Uint8Array | string, zkey: Uint8Array | string): Promise<{ proof: any; publicSignals: string[] }>;
    verify(vkey: Record<string, unknown>, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}
