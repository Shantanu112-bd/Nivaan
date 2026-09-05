# NIVAAN

Chain-agnostic zero-knowledge KYC compliance credential layer built on Midnight.

Prove KYC eligibility once — using India Stack-rooted data (Aadhaar, via the Anon Aadhaar
Test QR for this MVP) — and verify that proof on any chain with a deployed verifier
(Soroban and an EVM testnet for the MVP), without re-sharing identity documents per
integration.

> **MVP status: testnet-only.** Single credential type, single issuer, solo-developer
> scope. See [`docs/product-spec.md`](docs/product-spec.md) for exact scope boundaries and
> [`docs/roadmap.md`](docs/roadmap.md) for the phased build sequence.

## Trust model — read this first (ADR-001)

NIVAAN does **not** perform native cross-chain zero-knowledge proof verification, and it is
important to be clear about that up front.

Midnight compiles its circuits to Halo2 proofs over Pluto-Eris curves. A Soroban or EVM
verifier contract cannot check such a proof directly — bridging that gap natively would
require either recursive proof wrapping (a Groth16 proof attesting to the Halo2 proof) or a
per-chain Halo2 verifier. Both are real cryptographic engineering, out of scope for a
solo-developer MVP.

Instead, NIVAAN uses **backend-attested verification** ("Path C"):

1. A user generates a Midnight proof **locally**, on their own device, via the Proof Server.
   Raw identity data never leaves the device.
2. The **backend** verifies that proof off-chain using Midnight's own tooling (`midnight-js`).
3. The backend signs a compact attestation — `{ credentialId, chain, result, timestamp }` —
   with a dedicated signing key (`BACKEND_ATTESTATION_SIGNING_KEY`).
4. The registry contracts on Soroban and Sepolia check **only that signature** against a
   known public key. They do **not** re-verify the underlying ZK proof.

**The consequence, stated plainly:** the backend's signing key — not the zero-knowledge
proof — is the root of trust for cross-chain verification. This is a trusted-relayer
assumption. If that key is compromised, an attacker can forge "verified" results on both
registries. It is a legitimate, **disclosed** MVP trade-off, not a hidden shortcut.

The path to removing this assumption (recursive Groth16 wrapping, or native Halo2 verifiers
per chain) is recorded in [`docs/decisions.md`](docs/decisions.md) (ADR-001) and is
explicitly deferred until funded.

Additionally, per **ADR-003**, the MVP runs against Anon Aadhaar **Test QR** data (validly
signed against a test key pair), not a live UIDAI integration. The demo does not claim to
prove live UIDAI onboarding.

## Documentation

| File | Contents |
|---|---|
| [`docs/product-spec.md`](docs/product-spec.md) | Core flow, actors, MVP scope in/out |
| [`docs/architecture.md`](docs/architecture.md) | System, backend, ZK, chain, auth, deployment architecture; tech stack |
| [`docs/api-spec.md`](docs/api-spec.md) | The frozen API contract — every endpoint |
| [`docs/data-model.md`](docs/data-model.md) | Exact database schema |
| [`docs/security-model.md`](docs/security-model.md) | Threat model, secrets handling, accepted findings |
| [`docs/decisions.md`](docs/decisions.md) | Architecture decision records (ADR-001…006) |
| [`docs/roadmap.md`](docs/roadmap.md) | Phase 0–12 build sequence + acceptance checklists |
| [`docs/deployment.md`](docs/deployment.md) | Registry-contract deployment runbook |

## Development

```bash
npm install
npm run dev        # Next.js dev server (app + API routes)
npm test           # Vitest unit suite
```

Copy `.env.example` to `.env.local` and fill in values — **never commit real values**. All
keys are testnet-only for the MVP.

Contract packages live under `contracts/` and build with their own toolchains (Hardhat for
the EVM registry, the Stellar CLI for Soroban, the Compact compiler for the Midnight
circuit) — see [`docs/deployment.md`](docs/deployment.md).
