# API Spec

All endpoints are Next.js route handlers under `app/api/`, JSON in/out. This is the frozen contract — Antigravity builds against this file, not against assumptions. Any change here requires updating this file first (per `CLAUDE.md` change-control rules).

Base path: `/api`

---

## Auth

### `GET /auth/nonce`

Issues a one-time nonce for wallet-signature login.

- **Auth required:** none
- **Request:** none
- **Response `200`:** `{ "nonce": string, "expiresAt": string (ISO 8601) }`
- **Errors:** `500` on nonce-generation failure
- **Side effects:** writes a row to `auth_nonces`

### `POST /auth/verify`

Verifies a signed nonce and establishes a session.

- **Auth required:** none (this establishes it)
- **Request:** `{ "walletAddress": string, "nonce": string, "signature": string }`
- **Response `200`:** `{ "did": string, "sessionExpiresAt": string }`, sets `HttpOnly`, `Secure`, `SameSite=Strict` session cookie
- **Validation:** nonce must exist, be unexpired, and unused; signature must verify against `walletAddress`
- **Errors:** `400` invalid signature, `401` nonce expired/unknown, `409` nonce already used
- **Side effects:** marks nonce used, creates session

---

## Credentials

### `POST /credentials/issue`

Submits witness-derived proof input and issues a credential.

- **Auth required:** session cookie
- **Request:** `{ "circuitProofInput": object, "jurisdiction": string }` — the actual witness output shape is defined by the Minokawa circuit interface, not invented ad hoc here; confirm exact shape against the deployed contract before implementing
- **Response `201`:** `{ "credentialId": string, "did": string, "status": "active", "issuedAt": string, "expiresAt": string }`
- **Validation:** circuit proof input must be well-formed per the Minokawa contract's expected witness shape; jurisdiction must be a supported value (India only for MVP)
- **Errors:** `400` malformed input, `422` circuit evaluation failed (credential criteria not met), `500` Midnight testnet unreachable
- **Side effects:** writes to `credentials`; calls Minokawa `issueCredential()` on Midnight testnet

### `GET /credentials/:id/status`

- **Auth required:** session cookie, must own the credential
- **Request:** none
- **Response `200`:** `{ "credentialId": string, "status": "active" | "expired" | "revoked", "expiresAt": string }`
- **Errors:** `403` not the owner, `404` unknown id

---

## Proofs

### `POST /proofs/generate`

Initiates ZK proof generation for a given credential against a target policy and chain.

- **Auth required:** session cookie, must own the credential
- **Request:** `{ "credentialId": string, "targetChain": "soroban" | "sepolia", "policyId": string, "consentHash": string }` — `consentHash` is the hash of the exact versioned consent text shown to the user (see `docs/data-model.md` `ConsentLog.consentHash`); consent is captured on this call because it must be logged before any proof is generated (`docs/product-spec.md` core flow)
- **Response `202`:** `{ "proofRequestId": string, "status": "pending" }`
- **Validation:** credential must be `active` (not expired/revoked); `targetChain` must be one of the two supported values; `policyId` must equal the single supported MVP policy id (a constant in the backend config under `lib/config`, mapping to the `kyc_tier_1` compliance check); `consentHash` must match a known versioned consent-text hash
- **Errors:** `400` invalid chain/policy/consent, `409` credential not active
- **Side effects:** writes a `consent_logs` entry for the credential, writes to `proof_requests`, triggers local Proof Server call

### `GET /proofs/:id/status`

- **Auth required:** session cookie, must own the underlying credential
- **Request:** none
- **Response `200`:** `{ "proofRequestId": string, "status": "pending" | "ready" | "failed", "failureReason": string | null }`
- **Errors:** `403`, `404`

---

## Verification

### `POST /verify`

Submits a completed proof for cross-chain verification (backend-attested — see ADR-001).

- **Auth required:** session cookie, must own the underlying credential
- **Request:** `{ "proofRequestId": string }`
- **Response `202`:** `{ "verificationId": string, "status": "pending" }`
- **Validation:** referenced proof must be `ready`
- **Errors:** `409` proof not ready, `500` chain adapter failure
- **Side effects:** backend verifies proof via `midnight-js`, signs attestation, calls the relevant chain adapter (`lib/chains/soroban.ts` or `lib/chains/evm.ts`) to submit it; writes to `verification_results`

### `GET /verify/:id/result`

Unified result regardless of chain. Also the endpoint the demo verifier surface polls.

- **Auth required:** session cookie for the credential owner; `DEMO_VERIFIER_KEY` header for the demo verifier surface — either is sufficient
- **Request:** none
- **Response `200`:** `{ "verificationId": string, "chain": "soroban" | "sepolia", "result": boolean, "verifiedAt": string }`
- **Errors:** `403`, `404`, `425` (too early — verification still pending, poll again)

---

## Conventions across all endpoints

- All timestamps ISO 8601, UTC.
- All errors return `{ "error": string, "code": string }`.
- Rate limiting: a single shared middleware, applied to all `/api/*` routes — see `docs/security-model.md` for the exact limits.
- No endpoint ever accepts or returns raw identity data (name, DOB, Aadhaar number) in any request or response body — this is a hard constraint, not a style preference.
