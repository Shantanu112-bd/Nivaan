# Architecture Decision Records

Read this before questioning why something is built a specific way. Each ADR is a closed decision for MVP scope — reopen only via the change-control process in `CLAUDE.md`.

---

## ADR-001: Backend-attested cross-chain verification instead of native proof portability

**Status:** Decided.

**Context:** Midnight compiles Minokawa contracts to Halo2 proofs over Pluto-Eris curves — IPA-based, no trusted setup. Soroban's native ZK host functions and Confidential Tokens target BN254/Groth16/UltraHonk; standard EVM verifiers expect Groth16 or PLONK on a pairing-friendly curve. A Midnight-native proof cannot be handed directly to a Soroban or EVM Groth16 verifier contract. Closing this gap properly requires recursive proof wrapping (generate the Halo2 proof, then a second Groth16 proof attesting to its validity) or a native Halo2 verifier per target chain — both are real cryptographic engineering, not integration work, and not realistic inside a solo-developer MVP timeline.

**Decision:** The backend verifies the Midnight proof directly using `midnight-js`'s own verification tooling, then signs an attestation (`credentialId`, `chain`, `result`, `timestamp`) with a dedicated signing key. Registry contracts on Soroban and Sepolia check that signature — they do not independently re-verify the underlying ZK proof.

**Consequences:** This introduces a trusted-relayer assumption: the backend's signing key is the actual root of trust for cross-chain verification, not the ZK proof itself. This must be stated plainly in the README and in any demo or submission material — it is a legitimate, disclosed MVP trade-off, not a hidden shortcut. The path to removing it later is either recursive Groth16 wrapping or native Halo2 verifiers per chain — both explicitly out of scope until funded.

---

## ADR-002: Single Next.js repository instead of separate frontend/backend services

**Status:** Decided.

**Context:** Solo developer, minimal infrastructure budget, no need for independent scaling of frontend vs. backend at MVP traffic levels.

**Decision:** Frontend and backend live in one Next.js repository. API routes serve as the backend. One Vercel deployment serves both.

**Consequences:** Simpler operations, faster iteration, nothing extra to deploy or monitor. Revisit only if a real scaling need for independent backend infrastructure emerges post-MVP.

---

## ADR-003: Anon Aadhaar Test QR Generator instead of live UIDAI integration

**Status:** Decided.

**Context:** Live UIDAI AUA/KUA licensing is a restrictive, slow process not realistic for an early-stage solo project. Anon Aadhaar ships an official Test QR Code Generator producing validly-signed test data against a test key pair — a supported development path, not a workaround.

**Decision:** Build and demo against Test QR data. The witness function (`getAadhaarTestProof()`) is written data-source-agnostic so that swapping in real Aadhaar Offline e-KYC data later (the SDK's `REAL_DATA` flag) is a configuration change, not a rewrite.

**Consequences:** The MVP demo does not prove live UIDAI integration — this must be disclosed, not implied. Sets up cleanly for a V2 real-data swap with no architectural rework.

---

## ADR-004: Wallet-signature session auth instead of username/password

**Status:** Decided.

**Context:** The user's DID is already the natural identity anchor for credentials in this system. A separate password-based account system would duplicate that anchor and add unnecessary surface area (password storage, reset flows, hashing).

**Decision:** Session established via nonce challenge + wallet signature (`GET /auth/nonce`, `POST /auth/verify`), issuing a short-lived, HTTP-only session cookie.

**Consequences:** No password infrastructure to build or secure. User identity is tied directly to their wallet, consistent with the credential model. Session expiry and cookie security still need standard handling — see `docs/security-model.md`.

---

## ADR-005: Single hardcoded issuer, no trust registry, for MVP

**Status:** Decided.

**Context:** MVP scope explicitly excludes multi-issuer support (`docs/product-spec.md`).

**Decision:** One issuer key, configured via `ISSUER_ADMIN_KEY`, no onboarding UI, no issuer trust registry contract or table.

**Consequences:** Significantly simplifies credential architecture — no issuer verification logic needed anywhere in the system. Must be revisited before any second real issuer is integrated; that work is explicitly V2.

---

## ADR-006: Postgres (Supabase/Neon) instead of SQLite for the deployed demo

**Status:** Decided.

**Context:** The deployed demo needs a database reachable from a Vercel deployment; SQLite is fine for local development but not for a hosted, publicly-reachable instance.

**Decision:** Prisma ORM against Postgres, hosted on Supabase or Neon's free tier. SQLite remains acceptable for local-only development.

**Consequences:** Minimal added complexity (both offer a connection string and zero server management), real relational integrity for the six-table schema, no infrastructure to operate directly.

---

## ADR-007: Circuit seals on any issuance attempt for MVP

**Status:** Decided.

**Context:** The Minokawa circuit must seal the DID to prevent double issuance. However, if an ineligible user attempts to get a credential (e.g. under the required age), the circuit currently seals the DID on that attempt as well, preventing them from retrying even if they later become eligible.

**Decision:** Accept this behavior for the MVP. The circuit seals on any issuance attempt.

**Consequences:** A user who fails the eligibility check cannot retry with the same DID. "Insert only when eligible" (which would allow retry-after-18) is a known one-line circuit change but is deferred past the MVP.

---

## ADR-008: Default to Midnight Preview network instead of Preprod

**Status:** Decided.

**Context:** The app needs to connect to a Midnight testnet for credential issuance and proof generation. The Preprod testnet endpoints were returning 404 for UTXO lookups, indicating either a breaking change or instability. The Preview testnet provides a more stable, active environment with a funded Dust wallet available for MVP development.

**Decision:** Connect to the Midnight **Preview** testnet by default. `MIDNIGHT_NETWORK_ID` and the corresponding RPC/Indexer URLs in `.env.local` are set to `preview`. `setNetworkId('preview')` is used for address derivation.

**Consequences:** All credential issuances and proof generations will occur on the Preview network. If the Preview network becomes unstable, the application can be re-pointed to Preprod by updating `.env.local` and `MIDNIGHT_NETWORK_ID` (Preprod serves as the fallback).
