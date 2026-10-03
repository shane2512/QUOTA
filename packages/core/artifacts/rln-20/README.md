# RLN-v2 circuit artifacts (depth 20)

Vendored, unmodified output of the PSE RLN trusted-setup ceremony (p0tion). We did not compile the circuit or run a setup (PRD Z1).

| File | Source URL |
|---|---|
| `rln.wasm` | `https://rln-trusted-setup-ceremony-pse-p0tion-production.s3.eu-central-1.amazonaws.com/circuits/rln-20/RLN-20.wasm` |
| `rln_final.zkey` | `.../circuits/rln-20/contributions/rln-20_final.zkey` |
| `verification_key.json` | `.../circuits/rln-20/rln-20_vkey.json` |

These are the URLs `rlnjs` 3.x (`src/resources.ts`) uses as its default depth-20 parameters. Circuit: `circom-rln` `circuits/rln.circom`, `RLN(20, 16)`. Groth16 / bn128, 5 public signals in this order: `y, root, nullifier, x, externalNullifier`.

Constraints that follow from the circuit:
- Tree depth is fixed at 20, zero leaf 0, node hash `Poseidon(left, right)`.
- Leaf = `Poseidon(Poseidon(a0), limit)`.
- `RangeCheck(16)`: `messageId < limit` and both must be below 2^16, so `limit` ≤ 65535.

`SHA256SUMS` pins the files; `loadArtifacts()` refuses to load files that do not match.
