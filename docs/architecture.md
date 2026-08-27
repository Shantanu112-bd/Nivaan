# Architecture

## 1. Overall system architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Antigravity-owned)                                     │
│  Next.js frontend                                                 │
│  - Anon Aadhaar Test QR scan/upload                               │
│  - Witness function runs HERE — data never leaves the device      │
│  - Wallet connectors (Midnight, Freighter, MetaMask)               │
└───────────────┬─────────────────────────────────────────────────┘
                │ credential/proof requests only — never raw identity data
┌───────────────▼─────────────────────────────────────────────────┐
│  Next.js API routes (Cloud Code-owned, same repo, "the backend")  │
│  - /credentials/issue, /credentials/:id/status                    │
│  - /proofs/generate, /proofs/:id/status                            │
│  - /verify, /verify/:id/result                                     │
│  - /auth/nonce, /auth/verify                                       │
└───────┬──────────────────┬──────────────────┬────────────────────┘
        │                  │                  │
┌───────▼──────┐  ┌────────▼────────┐  ┌──────▼──────────────────┐
│ Postgres      │  │ Midnight testnet │  │ Registry contracts       │
│ (Supabase/    │  │ + local Proof    │  │ - Soroban testnet         │
│  Neon)        │  │   Server         │  │ - Sepolia (EVM)            │
│ 6 tables,     │  │ Minokawa circuit │  │ Check backend attestation  │
│ no PII        │  │ issues credential│  │ signature, record result   │
└───────────────┘  └──────────────────┘  └───────────────────────────┘
```

One repository. One deployable web application. Contract code lives in the same repo under its own package, deployed separately via CLI tooling.

## 2. Frontend architecture (Antigravity-owned)

- Next.js App Router, TypeScript, TailwindCSS.
- Client state: local component state + React Query (or SWR) for server data — no global state library needed at this scale.
- Wallet connectors: Midnight wallet connector (for credential/DID operations), Freighter API (Soroban), a minimal EVM connector (wagmi/viem, MetaMask) — each isolated behind a `lib/wallets/` adapter so the UI doesn't branch on chain logic directly.
- All witness/proof-generation calls happen client-side against the local (or hosted-for-demo) Proof Server — the frontend never sends raw Aadhaar data to the backend.
- Pages map 1:1 to the flows in `docs/product-spec.md` — full screen list in Section 7 below.

## 3. Backend architecture (Cloud Code-owned)

- Next.js API routes as thin controllers. Each route calls a service module under `lib/services/`; no business logic lives in route handlers directly.
- No separate microservices, no message queue, no background worker process for MVP — synchronous request/response is sufficient at this scale. If proof generation needs to be async (it may, depending on Proof Server latency), use a simple polling pattern (`/proofs/:id/status`) backed by a status column, not a queue.
- Services: `credentialService`, `proofService`, `verificationService`, `revocationService`, `consentService`, `authService`. One file each under `lib/services/`.
- Chain adapters isolated under `lib/chains/soroban.ts` and `lib/chains/evm.ts`, both implementing the same `ChainAdapter` interface (`submitAttestation`, `getResult`) so `verificationService` doesn't branch on chain type.

## 4. Database architecture

Postgres (Supabase or Neon free tier for hosted; SQLite acceptable for pure local dev). Prisma as ORM. Six tables total — see `docs/data-model.md` for exact schema. No PII in any table, enforced by code review and by the schema itself containing no free-text identity fields.

## 5. Credential architecture

```
Witness (client-side, in-browser)
  reads Anon Aadhaar Test QR data
  → Minokawa circuit: proveComplianceTier(threshold)
  → Minokawa circuit: issueCredential()
      writes a `sealed` ledger entry, DID-bound
      only a boolean (KYC tier + jurisdiction) is disclose()'d
      TTL set via Midnight's Counter construct (not raw Uint — see security-model.md)
  → credential reference (id, DID, expiry) returned to backend for tracking only
      (backend stores the reference, never the underlying witness data)
```

Revocation: a simple `revoked_credentials` table entry, checked by `checkNotRevoked()` in the verification circuit and independently by the backend before attesting. Revocation is triggered by a dev-only admin script authorized by `ISSUER_ADMIN_KEY`, not a frontend-exposed API route (issuer operations are never exposed to the frontend — see ADR-005). Full accumulator-based revocation is out of scope (see product-spec.md).

## 6. ZK / proof architecture

Midnight uses Halo2 over Pluto-Eris curves — not natively compatible with Soroban's or standard EVM Groth16/UltraHonk verifiers. **See ADR-001 in `docs/decisions.md` for the full reasoning.** MVP architecture:

1. Proof generated locally via the Midnight Proof Server (Docker, `localhost:6300` in dev; a single hosted demo instance for deployed use — see ADR-001 for the trust trade-off this implies).
2. Backend verifies the proof using Midnight's own SDK/verification tooling (`midnight-js`).
3. Backend signs an attestation: `{ credentialId, chain, result, timestamp }`, signed with `BACKEND_ATTESTATION_SIGNING_KEY`.
4. Attestation submitted to the relevant chain's registry contract, which checks the signature against a known public key — it does not independently re-verify the ZK proof.

This is the single most important architectural fact in the system. Every component touching proof generation or verification must be built consistent with this, not with an assumed "native cross-chain ZK verification" model.

## 7. Midnight architecture

- Minokawa contract, one file, three logical parts:
  - **Witness context:** `getAadhaarTestProof()` — wraps `@anon-aadhaar/core`, reads Test QR data, extracts age/jurisdiction attributes.
  - **Circuit context:** `proveComplianceTier(threshold)`, `issueCredential()`, `checkNotRevoked()`.
  - **Ledger context:** `sealed` credential entry, `disclose()`-wrapped boolean output, TTL via `Counter`.
- Deployed to Midnight testnet via `midnight-js` CLI tooling.
- Proof Server run as a single Docker container; for a hosted demo, one small VM or container instance is sufficient — no autoscaling, no orchestration.

## 8. Soroban verifier architecture

- One contract, Rust/Soroban SDK.
- **Purpose:** record verification results based on a backend-signed attestation (Path C — not a native ZK proof verifier).
- **Functions:** `submit_attestation(credential_id, result, signature, timestamp)`, `get_result(credential_id) -> VerificationResult`.
- **State:** a map of `credential_id -> VerificationResult { result: bool, timestamp: u64 }`.
- **Access control:** `submit_attestation` only accepts signatures matching the configured backend public key — reject otherwise.
- **Events:** emit on each successful `submit_attestation` call for indexing/demo purposes.
- Deployed to Soroban testnet, funded via friendbot.

## 9. EVM verifier architecture

- Mirrors the Soroban contract exactly, in Solidity, deployed to Sepolia.
- `submitAttestation(bytes32 credentialId, bool result, bytes signature, uint256 timestamp)`, `getResult(bytes32 credentialId) view returns (bool, uint256)`.
- Same signature-based access control, same event-emission pattern.
- Use OpenZeppelin's `ECDSA` library for signature verification rather than writing it by hand.

## 10. Authentication and authorization

- **Individual users:** wallet-signature session. Backend issues a nonce (`GET /auth/nonce`), user signs it with their Midnight wallet, backend verifies the signature and issues a short-lived, HTTP-only session cookie (`POST /auth/verify`). No username/password, no separate user database beyond the wallet-derived DID already used for credentials.
- **Issuer operations:** gated by a single static admin key (`ISSUER_ADMIN_KEY` env var), used only by the developer, never exposed to the frontend.
- **Demo verifier:** authenticated via a single static API key (`DEMO_VERIFIER_KEY`), simulating what a real integrator's credential would look like without building a full API-key management system.

## 11. API architecture

REST, JSON, via Next.js route handlers. Full contract in `docs/api-spec.md` — do not add or change an endpoint shape without updating that file first, since Antigravity builds directly against it.

## 12. Deployment architecture

- Single Vercel project serves both frontend and API routes.
- Database: Supabase or Neon (Postgres), free tier.
- Proof Server: one small hosted instance (any low-cost VM or container host) for deployed demo use; local Docker for development. Not behind a load balancer, not autoscaled.
- Contracts: deployed once to Soroban testnet and Sepolia via CLI, addresses stored in environment variables — no redeploy automation needed for MVP.
- No staging/production environment separation for MVP — one environment, clearly marked testnet-only throughout.

---

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js (App Router) + TypeScript | Single deployable with API routes, matches existing stack preference |
| Styling | TailwindCSS | Fast, no design-system overhead needed at MVP scale |
| Frontend data | React Query or SWR | Simple server-state caching, no global store needed |
| Backend | Next.js API routes | Collapses backend into the same deployable — see ADR-002 |
| Database | Postgres via Supabase or Neon | Free tier, no infra to manage, real relational guarantees over SQLite for a hosted demo |
| ORM | Prisma | Type-safe schema, matches TypeScript stack throughout |
| Auth | Wallet-signature session (custom, minimal) | No password infra needed; DID is already the natural identity anchor |
| Credential handling | `@anon-aadhaar/core`, `@anon-aadhaar/react` | Official SDK, includes the Test QR Generator path |
| ZK / proof layer | `midnight-js`, Minokawa compiler, Midnight Proof Server (Docker) | Official Midnight tooling |
| Midnight | Midnight testnet, Lace-compatible or Midnight testnet wallet | Official testnet + faucet |
| Stellar/Soroban | Stellar CLI, Soroban SDK (Rust), Freighter | Official tooling |
| EVM | Hardhat or Foundry, Solidity, Sepolia via Alchemy/Infura free tier | Standard, either toolchain is fine for a two-function contract |
| Testing | Vitest/Jest (unit), Playwright (E2E) | Standard, well-supported in the Next.js ecosystem |
| Dev tooling | ESLint, Prettier, TypeScript strict mode | Baseline hygiene, no additional process needed at this scale |
| Deployment | Vercel (app), Supabase/Neon (DB) | Zero-ops for a solo developer |

---

## Repository structure

```
nivaan/
├── CLAUDE.md
├── docs/
│   ├── product-spec.md
│   ├── architecture.md
│   ├── api-spec.md
│   ├── data-model.md
│   ├── security-model.md
│   ├── decisions.md
│   └── roadmap.md
├── app/                          # Next.js App Router — Antigravity-owned
│   ├── page.tsx                  # Landing
│   ├── onboarding/                # KYC/Aadhaar Test QR flow
│   ├── wallet/                    # Credential wallet — status, expiry, revocation
│   ├── consent/                   # Consent screen
│   ├── prove/                     # Prove-eligibility flow, network selector, proof progress
│   ├── result/                    # Unified verification result
│   ├── demo-verifier/             # Simulated RWA/DeFi verifier surface
│   └── api/                       # Route handlers — Cloud Code-owned even though nested here
│       ├── auth/
│       │   ├── nonce/route.ts
│       │   └── verify/route.ts
│       ├── credentials/
│       │   ├── issue/route.ts
│       │   └── [id]/status/route.ts
│       ├── proofs/
│       │   ├── generate/route.ts
│       │   └── [id]/status/route.ts
│       └── verify/
│           ├── route.ts
│           └── [id]/result/route.ts
├── lib/                           # Cloud Code-owned
│   ├── services/
│   │   ├── credentialService.ts
│   │   ├── proofService.ts
│   │   ├── verificationService.ts
│   │   ├── revocationService.ts
│   │   ├── consentService.ts
│   │   └── authService.ts
│   ├── chains/
│   │   ├── soroban.ts             # implements ChainAdapter
│   │   └── evm.ts                 # implements ChainAdapter
│   ├── wallets/                   # frontend-facing wallet adapters — Antigravity-owned, lives here for shared typing
│   │   ├── midnightWallet.ts
│   │   ├── freighter.ts
│   │   └── evmWallet.ts
│   ├── db/
│   │   ├── prisma.ts
│   │   └── schema.prisma
│   └── config/
│       └── env.ts                 # typed env var access, single source
├── contracts/                     # Cloud Code-owned
│   ├── midnight/
│   │   └── nivaan.compact         # Minokawa contract
│   ├── soroban/
│   │   └── src/lib.rs             # registry contract
│   └── evm/
│       └── contracts/Registry.sol
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
└── package.json
```

Ownership at a glance: everything under `app/` (excluding `app/api/`) and `lib/wallets/` is Antigravity's; everything under `app/api/`, `lib/services/`, `lib/chains/`, `lib/db/`, `lib/config/`, and `contracts/` is Cloud Code's. Both consume `docs/api-spec.md` as the shared contract.
