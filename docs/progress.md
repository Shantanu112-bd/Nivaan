# NIVAAN — Execution Progress Log

## Current Status
- Current phase: **Phase 7 (API layer) wired + typechecked + unit-tested + builds — live acceptance BLOCKED. Phases 1 & 3 complete + verified; Phase 2 schema/client done (live migration still blocked — DATABASE_URL empty); Phase 4 spike delivered; Phase 5 (Midnight) seams-in-place-but-blocked; Phase 6 adapter layer + signing spec authored, contracts + live deploy pending.** Frontend / Phase 8 is Antigravity's, not started here.
- Last updated: 2026-08-26
- Overall status: all code-level work through Phase 7 is complete and green — `tsc --noEmit` clean; **54 unit tests** passing on Vitest 4.1.11; `next build` compiles all 8 `/api/*` routes as dynamic handlers. Every boundary that crosses Midnight or a live chain (proof verify, wallet-signature verify, issuance-circuit eval, both chain adapters) is a seam that **THROWS a clear "not wired" error — never a fabricated success**. Live/deploy acceptance steps remain externally blocked (empty creds + down toolchain) and are flagged, never faked.
- **STOP point reached (per standing directive): Phase 7 code done → reporting status. Phase 8 (frontend) is Antigravity's and is NOT started here.**

## Verification snapshot (2026-08-26)
Single batched run, all exit 0:
- `npx prisma generate` → Prisma Client 7.9.1 emitted to `lib/db/generated/prisma` (gitignored). dotenv loaded **13 vars** from `.env.local` via `prisma.config.ts`.
- `npm test` (Vitest 4.1.11) → **3 files / 24 tests passed** (Phase 3 issuance/expiry/revocation/consent transitions).
- `npx tsc --noEmit` → clean: `lib/db/prisma.ts` compiles against the generated client + pg adapter; all 8 route stubs, 4 services, config, and tests typecheck.
- Installed this run: `@prisma/adapter-pg ^7.10.0`, `dotenv ^17.4.2`, `vitest ^4.1.11` (dev).

## Verification snapshot — Phase 5–7 API wiring (2026-08-26, session 2)
All three gates green with NO live services required (DB mocked, external boundaries injected/stubbed):
- `npx tsc --noEmit` → **clean** (all 8 route handlers, 6 services, the `lib/chains` adapter layer, and all tests typecheck).
- `npm test` (Vitest 4.1.11) → **6 files / 54 tests passed** (+30 this session: authService 12, proofService 10, verificationService 8).
- `npx next build` → **compiled successfully**; all 8 `/api/*` routes emitted as dynamic (ƒ) handlers, `/` + `/_not-found` static.
- No packages installed this session — Midnight (`@midnight-ntwrk/*`) and chain-client libs (viem / Stellar SDK) are intentionally deferred to Phases 5/6, where the API is actually wired.
- Env reality (key names + populated status only, values never read): **4 of 13** keys set — the four Phase-0 backend secrets (`BACKEND_ATTESTATION_SIGNING_KEY`, `ISSUER_ADMIN_KEY`, `DEMO_VERIFIER_KEY`, `SESSION_SECRET`). The other **9 are EMPTY**: `DATABASE_URL`, `MIDNIGHT_TESTNET_RPC`, `MIDNIGHT_WALLET_SEED`, `PROOF_SERVER_URL`, `ANON_AADHAAR_TEST_KEY`, `SOROBAN_RPC_URL`, `SOROBAN_TESTNET_SECRET`, `SEPOLIA_RPC_URL`, `SEPOLIA_DEPLOYER_KEY`.

## Phase History

_Blueprint (7 source-of-truth docs + CLAUDE.md) is on disk and passed a cross-doc consistency read (blockers B1–B4, now resolved). Nothing committed to git yet._

### Phase 0 — Setup
- Status: **code/local work complete; acceptance deploys blocked on human/external setup.**
- Scaffold (2026-08-23): `create-next-app` (TS, Tailwind, App Router, ESLint) at repo root; docs/CLAUDE.md/.env.example/.gitignore preserved. Next 16.3.1, React 19.2.8. Directory tree per `architecture.md`.
- Toolchain inventory (read-only, 2026-08-19): Node v22.23.1 / npm 10.9.8 / pnpm 11.13.0 ✓; Rust 1.93.1 + cargo ✓; Stellar CLI 25.1.0 ✓; Hardhat 3.0.10 ✓; Compact compiler 0.5.1 ✓; Docker 29.5.3 installed but daemon NOT running; git 2.51.0 ✓.
- Secrets: four backend-generated secrets (`BACKEND_ATTESTATION_SIGNING_KEY`, `SESSION_SECRET`, `ISSUER_ADMIN_KEY`, `DEMO_VERIFIER_KEY`) generated into `.env.local` (mode 600, gitignored), values never printed.
- Acceptance (trivial deploys on all three testnets + `next dev`, same sitting): **BLOCKED** on Docker + funded keys + external accounts (human/external setup).

### Phase 1 — Core backend scaffold — **COMPLETE ✅**
- `lib/config/env.ts` — typed single-source env accessor; lazy getters (import never throws on a missing var), name-only errors (never logs values); `REQUIRED_ENV_VARS`, `presentEnvVars()`, `assertRequiredEnv()`.
- `lib/api/http.ts` — shared `ApiError` + `notImplemented()` (`501` + `{error,code}` + `X-Nivaan-Stub`). Stubs return NO fabricated success bodies, so an unwired endpoint can't read as working.
- **8** API route stubs, matching `api-spec.md` exactly, each with inline request/response types.
- `lib/db/prisma.ts` — **DONE + verified.** Prisma 7 pg driver-adapter (`PrismaPg`) singleton; imports the generated client from `./generated/prisma/client`; `globalThis` cache in dev; re-exports generated model types + enums so services import them from `@/lib/db/prisma`.
- `prisma.config.ts` — loads `.env.local` via dotenv; `datasource.url = process.env.DATABASE_URL` (undefined-safe: `generate`/`validate` succeed even before a DB is reachable). `schema.prisma` generator switched to the v7 default `prisma-client` (output `./generated/prisma`, gitignored).
- Acceptance ("endpoint list and route file tree match exactly" + typed stub responses): **MET** (tsc clean; tree ↔ api-spec one-to-one).

### Phase 2 — Database — **schema/client done; live insert/query pending**
- `lib/db/schema.prisma`: all six models (AuthNonce, Credential, RevokedCredential, ConsentLog, ProofRequest, VerificationResult) + three enums (CredentialStatus, ChainTarget, ProofStatus), transcribed exactly from `data-model.md` — no extra or PII-shaped columns. `prisma validate` + `prisma generate` both pass.
- Acceptance: schema-match + no-PII + client-generation portions **MET**. "Manual insert/query against each table succeeds" is **BLOCKED** — a names-only `.env.local` check (2026-08-26, session 2) confirms `DATABASE_URL` is EMPTY, so `prisma migrate` + a per-table insert/query cannot run yet. Unblocks the moment `DATABASE_URL` is populated and the DB is reachable.

### Phase 3 — Credential system — **COMPLETE ✅**
- `lib/config/policy.ts` — B4 constants: `CREDENTIAL_TIER='kyc_tier_1'`, `SUPPORTED_JURISDICTION='IN'`, `CREDENTIAL_TTL_DAYS=30`, `MVP_POLICY_ID='kyc_tier_1'`.
- `lib/services/credentialService.ts`:
  - `deriveEffectiveStatus(credential, isRevoked, now)` — pure; revocation > expiry precedence; `expiresAt <= now` ⇒ EXPIRED; never trusts a stale stored ACTIVE (per `data-model.md`/`security-model.md`).
  - `issueCredential()` — jurisdiction guard (→ `UnsupportedJurisdictionError`), circuit-approval guard (→ `CredentialCriteriaNotMetError`), writes ACTIVE / `kyc_tier_1` / 30-day TTL. DB-only (not Midnight) per roadmap Phase 3.
  - `getCredentialStatus()` — 404 (`CredentialNotFoundError`) / 403 (`NotCredentialOwnerError`); returns COMPUTED status.
- `lib/services/revocationService.ts` — `revokeCredential()` re-checks `ISSUER_ADMIN_KEY` (backend-authoritative; never logged), records `RevokedCredential` + flips status in one `$transaction`; `isRevoked()`. Dev-only issuer op, no frontend route (ADR-005).
- `lib/services/consentService.ts` — SHA-256-hex hashing mechanism + known-hash gating + `logConsent()`. ⚠️ see Consent flag.
- Tests: `tests/unit/{credentialService,revocationService,consentService}.test.ts` — **24 tests, all pass.** Mock `@/lib/db/prisma` (and `@/lib/config/env`) via `vi.hoisted`/`vi.mock`, so they need neither the generated client nor a live DB.
- Acceptance ("unit tests pass for issuance/expiry/revocation state transitions using mock circuit output"): **MET.**

### Phase 4 — ZK / privacy-layer research validation — **spike delivered; acceptance BLOCKED**
- Deliverable (spike: which `midnight-js` function verifies a proof server-side) — delivered, but **low confidence**: the research agent's network access was blocked for its whole window, so most findings are `[INFERENCE]`/`[UNCONFIRMED]`. Treated as leads to confirm against real `.d.ts`, not ground truth.
- Verified (npm registry): scope is `@midnight-ntwrk/*` (not "midnight-js"/"Minokawa" as npm names); `@midnight-ntwrk/midnight-js-*` family at **4.1.1**; `@midnight-ntwrk/ledger` latest 4.0.0 with parallel `ledger-vN`; compiler is `compactc` (Compact 0.5.1 installed locally per Phase 0).
- Leads (unconfirmed): verifier-key handling in Node via `@midnight-ntwrk/midnight-js-node-zk-config-provider` (`NodeZkConfigProvider.getVerifierKey`); the actual verify likely a `@midnight-ntwrk/ledger` WASM transaction well-formedness check (offline, no Proof Server needed), NOT a bare `verifyProof()`. Verifier key emitted by `compactc` into a `managed/<contract>/keys/*.verifier` layout. Must set `setNetworkId(TestNet)` before using ledger/runtime. No confirmed dedicated CLI verify command — budget for a small Node script.
- **Acceptance ("verify a sample proof from the CLI") — BLOCKED:** needs the Midnight toolchain operational — no `@midnight-ntwrk/*` installed yet, Docker/Proof Server down, and no compiled circuit ⇒ no verifier key and no sample proof to verify. Confirmation steps recorded for a Bash+network-up re-run (fetch `docs.midnight.network/llms.txt`, read `/api-reference` typedoc, `npm pack @midnight-ntwrk/ledger` and grep the `.d.ts`). Midnight packages are intentionally NOT installed yet; install lands with Phase 5 (where the API is actually wired).

(append new phase entries chronologically, newest at the bottom)

### Phase 5 — Midnight integration — **honest seams in place; acceptance BLOCKED on toolchain**
- The three Midnight-crossing boundaries are implemented as honest seams that **THROW rather than fabricate**, so Phases 3/7 wire, typecheck, unit-test, and build end-to-end while every unwired path stays loud:
  - `proofService.verifyProof()` → `MidnightVerificationUnavailableError` (proof verification).
  - `credentialService.evaluateIssuanceCircuit()` → `MidnightUnavailableError` (issuance-circuit verdict; NEW this session — distinct from the *reached* verdict `CredentialCriteriaNotMetError`/422).
  - `authService` default wallet-signature verifier → `WalletSignatureVerificationUnavailableError` (ADR-004 wallet/Anon-Aadhaar check). Injected dep — real impl throws; tests inject a mock.
- `contracts/midnight/nivaan.compact` remains a Phase-0 header stub (witness + circuits named, body implemented in Phase 5).
- Acceptance ("verify a sample proof"; issue against Midnight testnet): **BLOCKED** — no `@midnight-ntwrk/*` installed, Docker/Proof Server down, no compiled circuit, and `MIDNIGHT_*`/`PROOF_SERVER_URL`/`ANON_AADHAAR_TEST_KEY` all EMPTY. Unchanged from Phase 4.

### Phase 6 — Cross-chain registries + adapters — **adapter layer + signing spec authored; contracts + live deploy PENDING/UNVERIFIED**
- `lib/chains/` authored and typechecked:
  - `attestation.ts` — the authoritative signing scheme + canonical field layout: secp256k1 on BOTH chains from the single `BACKEND_ATTESTATION_SIGNING_KEY` (ADR-001 root of trust); per-chain digest (EVM keccak256 + eth-signed-message prefix, Soroban SHA-256); fixed-width ordered fields `{credentialId32, chainTag("SOROBAN"|"SEPOLIA"), resultByte, timestamp}`; `ATTESTATION_MAX_AGE_SECONDS=300` replay/staleness window; `credentialIdToBytes32`, `isTimestampFresh`, `nowUnixSeconds`.
  - `types.ts` — one `ChainAdapter` interface (`submitAttestation`/`getResult`) so verificationService stays chain-agnostic; `AttestationFields`, `SubmitAttestationResult` (returns the submitted signature for the `VerificationResult.attestationSig` audit trail).
  - `index.ts` — `getChainAdapter` registry (exhaustive `never`-checked switch) + `parseChainTarget`/`chainToApiString` api-spec wire mapping.
  - `evm.ts` + `soroban.ts` — honest stubs implementing ChainAdapter; every on-chain call throws `ChainAdapterNotWiredError` (never a fake tx hash/result).
- **NOT done — UNVERIFIED (no compile toolchain this session; Bash intermittently down):** `Registry.sol` (3-line header) + `soroban/src/lib.rs` (2-line header) have **no contract bodies** (ecrecover/`secp256k1_recover`, result storage, signer==configured-backend-key check, duplicate-`credentialId` + stale-timestamp replay rejection), **no Hardhat/Cargo project scaffold**, and **the mandatory bad-signature negative test is NOT written**. Adapter bodies (viem / Stellar SDK + signing) also pending.
- Acceptance (deploy to Soroban + Sepolia testnets; accept good / reject bad signature on-chain): **BLOCKED** on funded testnet keys (`SOROBAN_*`/`SEPOLIA_*` all EMPTY) + a compile toolchain + authored contract bodies.

### Phase 7 — API layer — **CODE COMPLETE + green; live acceptance BLOCKED**
- All **8** route handlers wired from stubs to their services, matching docs/api-spec.md contracts (status codes, `{error,code}` envelope, documented side effects). Verified by re-reading every route file this session:
  - `GET /api/auth/nonce` → `issueNonce` → 200; 500 `NONCE_GENERATION_FAILED`.
  - `POST /api/auth/verify` → `verifyAndCreateSession`; on success sets **HttpOnly + Secure + SameSite=Strict** session cookie (maxAge `SESSION_TTL_SECONDS`). 200; 400 `INVALID_SIGNATURE`/`INVALID_JSON`/`INVALID_REQUEST`, 401 `NONCE_UNKNOWN`/`NONCE_EXPIRED`, 409 `NONCE_ALREADY_USED`, 500 `SIGNATURE_VERIFICATION_UNAVAILABLE`.
  - `POST /api/credentials/issue` → session-gated; `evaluateIssuanceCircuit` → `issueCredential`. 201; 400 `UNSUPPORTED_JURISDICTION`/`INVALID_REQUEST`, 422 `CRITERIA_NOT_MET`, **500 `MIDNIGHT_UNREACHABLE` at runtime today** (issuance-circuit seam throws — honest, never fabricates approval).
  - `GET /api/credentials/:id/status` → `getCredentialStatus` (async route param awaited); 200 (status lowercased to api wire value); 403 `NOT_CREDENTIAL_OWNER`, 404 `CREDENTIAL_NOT_FOUND`.
  - `POST /api/proofs/generate` → consent-gated `createProofRequest`; 202; 400 `INVALID_CHAIN`/`INVALID_POLICY`/`UNKNOWN_CONSENT_HASH`/`INVALID_REQUEST`, 403/404, 409 `CREDENTIAL_NOT_ACTIVE`.
  - `GET /api/proofs/:id/status` → `getProofStatus`; 200; 403/404.
  - `POST /api/verify` → `verifyAndAttest`; 202; 403/404, 409 `PROOF_NOT_READY`, 500 `VERIFICATION_FAILED` (covers the unwired Midnight-verify + chain-adapter boundaries honestly).
  - `GET /api/verify/:id/result` → **dual auth** (session credential-owner OR constant-time `DEMO_VERIFIER_KEY` header via `timingSafeEqual`) → `getVerificationResult`; 200; 401 unauth, 403 not-owner, 404 `VERIFICATION_NOT_FOUND`.
- Backend-authoritative authorization: ownership is enforced INSIDE the services, never trusting route/client input. `verifyAndAttest` now loads the credential and checks `credential.ownerWallet` **before** disclosing or writing anything (added this session). Unknown errors → generic 500 `INTERNAL_ERROR` with **no raw-error logging** (avoids leaking secrets embedded in Prisma/connection errors).
- Tests: `tests/unit/{authService,proofService,verificationService}.test.ts` — **30 new tests**; DB mocked via `vi.hoisted`/`vi.mock`, external boundaries injected, `node:crypto` real. Assert validation ordering, idempotency (existing `VerificationResult` returned without re-submitting), the attestation write (persisted `attestationSig`), the session-token round-trip/tamper/expiry, and that every unwired boundary THROWS (never a faked pass).
- Acceptance ("a full request/response cycle for every endpoint, tested via a REST client, matches the documented contract exactly" against "the real DB, Midnight, and both chains"): **BLOCKED** — requires Phase 2 live DB (`DATABASE_URL` EMPTY), Phase 5 Midnight (toolchain down), and Phase 6 deployed registries (not authored/deployed). The CODE is complete, typechecked, unit-tested, and builds; **Phase 7 is NOT marked complete** against its live-acceptance criterion.

## Testing infrastructure
- Runner: **Vitest 4.1.11** (chosen within `architecture.md`'s "Vitest/Jest" latitude — ESM-native, matches Prisma 7 + Next 16; first-class module mocking). Scripts: `npm test` (`vitest run`), `npm run test:watch`.
- `vitest.config.mts`: node env, `include: tests/**/*.test.ts`, `@` alias → `process.cwd()` (mirrors tsconfig `@/* → ./*`).
- ✅ Resolved (session 2): the config is now `vitest.config.mts` (renamed from `.ts`), so the earlier ESM-in-CJS warning is gone; `npm test` runs clean.

## Resolved Decisions (pre-build blockers B1–B4)
- [x] **B1 — Table count.** Six tables (Prisma schema authoritative); stale "five" corrected across docs.
- [x] **B2 — Consent capture.** On `POST /proofs/generate`; `consentHash` in body + validation + `400 …/consent` + `consent_logs` write.
- [x] **B3 — Revocation invocation.** Dev-only admin script authorized by `ISSUER_ADMIN_KEY`, not a frontend API (ADR-005).
- [x] **B4 — policyId semantics.** Single hardcoded MVP policy id in `lib/config` (`policy.ts`) mapping to the `kyc_tier_1` check.

## Open flags & blockers (per master-prompt Section 5)
- **⚠️ Consent text/hash contract (Phase 3, needs Antigravity coordination).** The consent TEXT shown to the user and the canonicalization deriving `consentHash` are a shared frontend↔backend contract; `data-model.md` says the text is "static and versioned in code" but specifies neither copy nor algorithm. Provisional backend decision: SHA-256 over exact UTF-8 text bytes, hex; `CONSENT_TEXT_VERSIONS.v1` is PLACEHOLDER copy. Frontend must compute the hash identically. Tests pin the mechanism, not the copy, so finalizing the text won't require rewriting them.
- **⚠️ Attestation signing scheme (Phase 6 — NOW AUTHORED as documented default).** Implemented in `lib/chains/attestation.ts`: secp256k1 on both chains from the single backend key; EVM keccak256 + eth-signed-message prefix, Soroban SHA-256; fixed-width field layout `{credentialId32, chainTag, resultByte, timestamp}`; 300s replay/staleness window. This is a documented default under ADR-001, NOT an independently specified requirement — `architecture.md §9` only pins the EVM `ECDSA` side; the Soroban curve + the shared message encoding were unspecified. If overridden before live deploy, change it in exactly three places: `attestation.ts`, `Registry.sol`, `lib.rs`. The two registry contracts + adapter crypto that must MIRROR this are not yet written (Phase 6 pending).
- **⚠️ authService seams + defaults (Phase 5/7).** Three Section-5 decisions, referenced by `Flag 1`/`Flag 2` comments in code: (1) **Nonces are issued UNBOUND** (`walletAddress=''`) and bound to the wallet at verify time (`update … {used:true, walletAddress}`) — api-spec's `GET /auth/nonce` takes no wallet, so binding-at-verify is the documented default. (2) **Wallet-signature verification is an unwired injected seam** — the default impl throws `WalletSignatureVerificationUnavailableError` (→500), never fakes a pass; ADR-004's real check lands with the Midnight/wallet libs. (3) **DID default `did:nivaan:<walletAddress>`** — `data-model.md` requires a wallet-derived unique DID but doesn't pin the format; this is the documented default.
- **⚠️ Issuance-circuit seam (Phase 5/7).** `credentials/issue` runs session-auth + input validation, then `evaluateIssuanceCircuit` — which throws `MidnightUnavailableError` until Midnight is wired, so the endpoint returns **500 `MIDNIGHT_UNREACHABLE` at runtime today**. Honest by design: issuance cannot complete without a real circuit verdict, and approval is never fabricated.
- **⚠️ Demo-verifier header name + 425 deviation (Phase 7).** `GET /verify/:id/result` reads the `DEMO_VERIFIER_KEY` header verbatim from api-spec's wording (HTTP header lookup is case-insensitive) and compares it constant-time. The api-spec's **425 ("too early") is unreachable** in the synchronous MVP — a `verificationId` only exists once its result row is written — so an unknown id is a 404, not a 425. Confirm the exact header name with the api-spec/Antigravity before demo.
- **⚠️ Resume-directive credential claim did NOT match reality (Section 5).** The standing directive listed `DATABASE_URL`, `MIDNIGHT_WALLET_SEED`, `MIDNIGHT_TESTNET_RPC`, `SEPOLIA_RPC_URL`, `SEPOLIA_DEPLOYER_KEY` as "now available" — a `.env.local` check (names + populated status only) shows **all five are EMPTY**. Only the 4 Phase-0 backend-generated secrets are set. No new creds were provisioned; every live step below stays blocked. Populate these (values never printed by me) to unblock.
- **Credential inventory (RESOLVED 2026-08-26).** `.env.local` has 13 key lines; a names-only, values-never-printed check confirms **only 4 are populated** — the Phase-0 backend-generated secrets (`BACKEND_ATTESTATION_SIGNING_KEY`, `ISSUER_ADMIN_KEY`, `DEMO_VERIFIER_KEY`, `SESSION_SECRET`). All 9 live-integration creds (`DATABASE_URL`, `MIDNIGHT_TESTNET_RPC`, `MIDNIGHT_WALLET_SEED`, `PROOF_SERVER_URL`, `ANON_AADHAAR_TEST_KEY`, `SOROBAN_RPC_URL`, `SOROBAN_TESTNET_SECRET`, `SEPOLIA_RPC_URL`, `SEPOLIA_DEPLOYER_KEY`) are EMPTY — so Phase 2 live migrate, Phase 5 Midnight, and Phase 6 deploy remain blocked on operator-provided values.
- **Docker daemon down + Proof Server unreachable** → blocks Phase 4 live CLI verify and Phase 5 deploy + proof generation.
- **Soroban/Sepolia deploy** → blocked until funded keys confirmed; contract source + local build + adapter unit tests (incl. the bad-signature negative test) are still authorable/runnable locally.
- **No external accounts yet** (Vercel, Supabase/Neon, Alchemy/Infura, GitHub) → blocks Phases 11–12.

## Next Bash-gated actions (resumable checklist)
_Items 1 and 3 are DONE. Everything else is blocked on operator-provided credentials and/or a working compile toolchain (Bash was intermittently unavailable this session)._
1. ✅ **DONE** — `.env.local` checked (names + populated status only, no values): `DATABASE_URL` and all 8 other live creds are EMPTY (see Credential inventory above).
2. **BLOCKED on `DATABASE_URL`.** Once populated + DB reachable → `prisma migrate dev --name init` + a per-table insert/query → closes **Phase 2** live acceptance.
3. ✅ **DONE** — `vitest.config.ts` → `vitest.config.mts`; `npm test` runs clean (CJS/ESM warning gone).
4. **Phase 6 contract authoring** — authorable/locally testable even WITHOUT funded keys: implement `Registry.sol` + `soroban/src/lib.rs` bodies mirroring `lib/chains/attestation.ts` (recover signer, require signer == configured backend key, store result, reject duplicate `credentialId` + stale timestamp), scaffold Hardhat + Cargo, fill in the `evm.ts`/`soroban.ts` adapter bodies (viem / Stellar SDK), and write the **mandatory bad-signature negative test**. Needs a working Bash/compile toolchain. Live deploy additionally blocked on `SOROBAN_*`/`SEPOLIA_*`.
5. **Phase 5 Midnight (BLOCKED):** install `@midnight-ntwrk/*`, bring up Docker/Proof Server, compile `nivaan.compact`, then replace the `verifyProof` / `evaluateIssuanceCircuit` / wallet-signature seams with real impls. Needs `MIDNIGHT_*` / `PROOF_SERVER_URL` / `ANON_AADHAAR_TEST_KEY`.
6. **Phase 7 live acceptance (BLOCKED on 2 + 5 + 6):** REST-client full request/response cycle for all 8 endpoints against the real DB + Midnight + both chains.

## In-flight research
- (resolved) Prisma 7.9 connection pattern — implemented + verified.
- (resolved) midnight-js verify API spike — delivered as leads (low confidence; see Phase 4). Re-confirm against installed `.d.ts` when Phase 5 installs the packages.
