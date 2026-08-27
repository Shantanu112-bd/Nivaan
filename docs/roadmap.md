# Roadmap

Follow this order. Do not start a phase while the previous one has a critical (not cosmetic) failure — per the iterative loop below.

## Iterative development loop (applies to every phase)

```
Analyze → Implement → Test → Validate → Fix → Re-test → Update docs if reality diverged from plan → Continue
```

If a phase reveals that a decision in `docs/decisions.md` was wrong, don't silently work around it — update the ADR and flag the change per `CLAUDE.md`'s change-control rules before continuing.

---

## Phase 0 — Setup

- **Files/modules:** repo scaffold per `docs/architecture.md`'s repository structure, `.env.example`, all four toolchains installed (`midnight-js`/Minokawa/Proof Server; Stellar CLI/Soroban SDK/Freighter; Hardhat or Foundry/Sepolia access; Next.js/TypeScript/Prisma)
- **Dependencies:** none
- **Deliverables:** a "hello world" deploy succeeding on all four toolchains independently
- **Acceptance criteria:** you can deploy a trivial Minokawa contract to Midnight testnet, a trivial contract to Soroban testnet, a trivial contract to Sepolia, and run `next dev` locally, all in the same sitting
- **Complexity:** Low
- **Blocking:** everything

## Phase 1 — Core backend scaffold

- **Files/modules:** `lib/config/env.ts`, `lib/db/prisma.ts`, base Next.js API route structure (empty handlers matching `docs/api-spec.md`'s paths)
- **Dependencies:** Phase 0
- **Deliverables:** every endpoint in `docs/api-spec.md` exists and returns a typed stub response
- **Acceptance criteria:** `docs/api-spec.md`'s endpoint list and the actual route file tree match exactly
- **Complexity:** Low
- **Blocking:** Phases 3–7

## Phase 2 — Database

- **Files/modules:** `lib/db/schema.prisma` per `docs/data-model.md`, migrations run against Supabase/Neon
- **Dependencies:** Phase 0
- **Deliverables:** all six tables created, Prisma client generated
- **Acceptance criteria:** a manual insert/query against each table succeeds; schema matches `docs/data-model.md` exactly, no extra PII-shaped columns
- **Complexity:** Low
- **Blocking:** Phase 3+

## Phase 3 — Credential system

- **Files/modules:** `lib/services/credentialService.ts`, `lib/services/consentService.ts`, `lib/services/revocationService.ts`
- **Dependencies:** Phases 1–2
- **Deliverables:** service logic for issuance, status lookup, consent logging, revocation, wired to the DB (not yet to Midnight)
- **Acceptance criteria:** unit tests pass for issuance/expiry/revocation state transitions using mock circuit output
- **Complexity:** Medium
- **Blocking:** Phase 5

## Phase 4 — ZK / privacy layer research validation

- **Files/modules:** none yet — this is the ADR-001 validation, already decided, but confirm the exact `midnight-js` verification API you'll call in Phase 5
- **Dependencies:** Phase 0
- **Deliverables:** a short spike confirming which `midnight-js` function verifies a proof server-side
- **Acceptance criteria:** you can verify a sample proof from the CLI before wiring it into a service
- **Complexity:** Low (this used to be the highest-risk item before ADR-001 removed the recursion research — now it's just an API-familiarization step)
- **Blocking:** Phase 5

## Phase 5 — Midnight integration

- **Files/modules:** `contracts/midnight/nivaan.compact` (witness + circuits + sealed ledger entry per `docs/architecture.md` Section 7), `lib/services/proofService.ts`
- **Dependencies:** Phases 3–4
- **Deliverables:** deployed Minokawa contract on Midnight testnet; `proofService` can call `issueCredential()` and generate a proof via the Proof Server
- **Acceptance criteria:** a Test QR input (ADR-003) produces a real, deployed credential and a real generated proof
- **Complexity:** Medium–High — this is the core IP, budget the most focused time here
- **Blocking:** Phase 6

## Phase 6 — Blockchain verifiers (Soroban + EVM)

- **Files/modules:** `contracts/soroban/src/lib.rs`, `contracts/evm/contracts/Registry.sol`, `lib/chains/soroban.ts`, `lib/chains/evm.ts`
- **Dependencies:** Phase 5
- **Deliverables:** both registry contracts deployed to their respective testnets; both chain adapters can submit and query an attestation
- **Acceptance criteria:** a manually-constructed attestation (signed with the backend key) is accepted by both contracts; a badly-signed one is rejected by both — this is the negative test that proves the access control actually works, not just the happy path
- **Complexity:** Medium
- **Blocking:** Phase 7

## Phase 7 — APIs (full wiring)

- **Files/modules:** complete `lib/services/verificationService.ts`, `lib/services/authService.ts`; wire all stub routes from Phase 1 to real service logic
- **Dependencies:** Phases 3, 5, 6
- **Deliverables:** every endpoint in `docs/api-spec.md` fully functional against the real DB, Midnight, and both chains
- **Acceptance criteria:** a full request/response cycle for every endpoint, tested via a REST client, matches the documented contract exactly
- **Complexity:** Medium
- **Blocking:** Phase 8

## Phase 8 — Frontend

- **Files/modules:** every page under `app/` per `docs/architecture.md`'s repo structure; wallet adapters under `lib/wallets/`
- **Dependencies:** Phase 7 (API contract must be frozen and functional first)
- **Deliverables:** onboarding through result screens, plus the demo verifier surface
- **Acceptance criteria:** every screen successfully calls its mapped endpoint and handles loading/error/success states
- **Complexity:** Medium
- **Blocking:** Phase 9

## Phase 9 — Integration

- **Files/modules:** none new — this is wiring verification, not new code
- **Dependencies:** Phase 8
- **Deliverables:** the full flow (onboarding → credential → consent → proof → verification → result) runs without manual intervention between steps
- **Acceptance criteria:** one uninterrupted run, start to finish, in a browser
- **Complexity:** Medium (integration bugs are usually here, not in any single component)
- **Blocking:** Phase 10

## Phase 10 — Testing

- **Files/modules:** `tests/unit/`, `tests/integration/`, `tests/e2e/`
- **Dependencies:** Phase 9
- **Deliverables:** unit tests per service, integration tests per API endpoint, one Playwright E2E test covering the full flow
- **Acceptance criteria:** all tests pass; the negative tests from Phases 6 and 3 (bad signature rejected, expired credential rejected) are included, not just happy-path coverage
- **Complexity:** Medium
- **Blocking:** Phase 11

## Phase 11 — Testnet deployment

- **Files/modules:** final deployment configuration, `.env` for the hosted environment
- **Dependencies:** Phase 10
- **Deliverables:** app live on Vercel, DB on Supabase/Neon, both contracts confirmed live on their testnets, Proof Server reachable from the deployed app
- **Acceptance criteria:** the full flow from Phase 9 runs successfully against the deployed environment, not just locally
- **Complexity:** Low–Medium
- **Blocking:** Phase 12

## Phase 12 — Final MVP validation

- **Files/modules:** none — validation only
- **Dependencies:** Phase 11
- **Deliverables:** a rehearsed, repeatable demo run
- **Acceptance criteria:** the full MVP acceptance checklist below, every item checked
- **Complexity:** Low
- **Blocking:** nothing — this is the finish line

---

## Environment variables & external services

**Required for MVP:**
`MIDNIGHT_TESTNET_RPC`, `MIDNIGHT_WALLET_SEED`, `PROOF_SERVER_URL`, `ANON_AADHAAR_TEST_KEY`, `SOROBAN_RPC_URL`, `SOROBAN_TESTNET_SECRET`, `SEPOLIA_RPC_URL`, `SEPOLIA_DEPLOYER_KEY`, `BACKEND_ATTESTATION_SIGNING_KEY`, `ISSUER_ADMIN_KEY`, `DEMO_VERIFIER_KEY`, `DATABASE_URL`, `SESSION_SECRET`

**Optional:**
A custom domain for the deployed demo; a hosted (rather than local) Proof Server instance if demoing without a local Docker setup.

**Post-MVP (do not provision now):**
Live UIDAI AUA/KUA credentials, DigiLocker API access, Account Aggregator integration credentials, any mainnet RPC or funded key, a paid monitoring/observability service.

**External services and accounts needed:** Vercel, Supabase or Neon, Alchemy or Infura (Sepolia RPC), a GitHub repo (for Vercel's git-based deploy). All have functional free tiers sufficient for this MVP.

---

## MVP boundary

**Build now:** everything in Phases 0–12 above.

**Postpone until funding:** multiple issuers, multiple credential types, DigiLocker/GST/Account Aggregator sources, enterprise dashboards, auditor/regulator views, developer SDK, mainnet deployment, Merkle-accumulator revocation, Halo2-to-Groth16 recursive proof wrapping (removing the ADR-001 trust assumption), CI/CD beyond Vercel's default, notifications, accessibility polish beyond semantic HTML, multi-language support. Full list and reasoning in `docs/product-spec.md`.

---

## MVP acceptance checklist

- [ ] Test QR → real Minokawa-issued credential on Midnight testnet
- [ ] Credential correctly expires per TTL and can be manually revoked
- [ ] Proof generated locally, verified by backend via `midnight-js`
- [ ] Backend attestation accepted by both the Soroban testnet and Sepolia registry contracts, from the same underlying credential
- [ ] Demo verifier surface correctly shows pass for a valid credential, fail for an expired/revoked one
- [ ] Full run — onboarding to final result — completes in one sitting, rehearsed at least twice
- [ ] Network trace confirms no PII transmission at any step
- [ ] README states the ADR-001 trust trade-off plainly
- [ ] All negative tests (bad signature, expired credential, revoked credential) pass, not just happy-path tests

## Testnet deployment checklist

- [ ] Minokawa contract live on Midnight testnet, address recorded
- [ ] Soroban registry contract live on Soroban testnet, address recorded
- [ ] EVM registry contract live on Sepolia, address recorded
- [ ] App deployed on Vercel, environment variables set (never committed)
- [ ] Database live on Supabase/Neon, migrations applied
- [ ] Proof Server reachable from the deployed app
- [ ] A full end-to-end run succeeds against the deployed environment, witnessed at least once before demo day
