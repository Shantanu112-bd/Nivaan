# Frontend Wiring Spec (handoff for Antigravity)

**Status:** Derived reference, not a source of truth. This document is generated **from** `docs/api-spec.md` (the frozen contract) plus the actual route handlers under `app/api/` and the backend config/services. Where this file and `docs/api-spec.md` ever disagree, **`docs/api-spec.md` wins** and this file is the one that's stale — say so and it gets corrected. It does not introduce any new endpoint, field, or requirement.

**Ownership (per `CLAUDE.md`):** Antigravity owns every screen described here (`app/` excluding `app/api`, and `lib/wallets`). Claude Code owns the endpoints (`app/api`, `lib/services`, `lib/chains`, `lib/config`) and will not edit the screens. This is the contract between the two halves: the screens call these endpoints exactly as specified; the endpoint shapes will not change under Antigravity without a corresponding `docs/api-spec.md` change first.

**What this gives you, per screen:** the session requirement, which UI action triggers which call, the exact request body, the exact success shape and how its fields map to the UI, the error codes and how to handle them, and a list of currently-hardcoded/invented UI elements that must change because no endpoint backs them.

---

## 1. Global conventions

- **Base path:** all endpoints are under `/api` (e.g. `POST /api/proofs/generate`). Same-origin — call them with relative URLs.
- **Auth is a cookie, and you cannot read it.** `POST /api/auth/verify` sets an **HttpOnly** session cookie. Client JavaScript cannot see it by design. So:
  - Every authenticated `fetch` just needs to be same-origin — the cookie is sent automatically. Do **not** add an `Authorization` header; there isn't one.
  - To know whether the user is logged in (for nav state, route gating), call **`GET /api/auth/session`** — `200` means a live session, `401` means none. This is the *only* way the client learns login state. Do not infer it from a hardcoded boolean (every screen currently hardcodes one — see §4).
- **Error envelope:** every non-2xx response is `{ "error": string, "code": string }`. Branch your UX on `code` (stable), show `error` only as fallback text. Exact codes per endpoint are listed per screen below.
- **Timestamps:** every timestamp field is an ISO 8601 UTC string. Parse with `new Date(...)`.
- **Rate limiting:** a shared middleware applies to all `/api/*` routes (limits in `docs/security-model.md`). A rejected request surfaces as a non-2xx with the standard envelope — handle it like any other error (a brief "try again in a moment" is enough).
- **Three endpoints return an honest `500` until their blocked backend boundaries are wired.** The *contract shapes are final and safe to build against now*, but the happy path cannot complete end-to-end yet. Build the wiring, and render these `500`s as a normal error state — they will start returning `2xx` with the documented shape once the Midnight/chain boundaries land, with no shape change:
  | Endpoint | Current code | Why |
  |---|---|---|
  | `POST /api/auth/verify` | `500 SIGNATURE_VERIFICATION_UNAVAILABLE` | wallet-signature verification not wired |
  | `POST /api/credentials/issue` | `500 MIDNIGHT_UNREACHABLE` | Minokawa issuance circuit not wired |
  | `POST /api/verify` | `500 VERIFICATION_FAILED` | Midnight proof verify + chain adapters not wired |
- **Never ship a secret to the browser.** The demo-verifier surface authenticates with a `DEMO_VERIFIER_KEY`. That key must **never** appear in client-side code or a client bundle. See §4.6 (demo-verifier) — its keyed request must originate server-side, through a same-origin proxy route.

---

## 2. Endpoint quick reference

| # | Method + path | Auth | Request body | Success | Key error codes |
|---|---|---|---|---|---|
| 1 | `GET /api/auth/nonce` | none | — | `200 { nonce, expiresAt }` | `500 NONCE_GENERATION_FAILED` |
| 2 | `POST /api/auth/verify` | none (sets cookie) | `{ walletAddress, nonce, signature }` | `200 { did, sessionExpiresAt }` | `400 INVALID_SIGNATURE`, `401 NONCE_UNKNOWN`/`NONCE_EXPIRED`, `409 NONCE_ALREADY_USED`, `500 SIGNATURE_VERIFICATION_UNAVAILABLE` |
| 3 | `GET /api/auth/session` | cookie | — | `200 { did, expiresAt }` | `401 UNAUTHENTICATED` |
| 4 | `POST /api/credentials/issue` | cookie | `{ circuitProofInput, jurisdiction }` | `201 { credentialId, did, status, issuedAt, expiresAt }` | `400 UNSUPPORTED_JURISDICTION`, `422 CRITERIA_NOT_MET`, `500 MIDNIGHT_UNREACHABLE` |
| 5 | `GET /api/credentials/:id/status` | cookie, owner | — | `200 { credentialId, status, expiresAt }` | `403 NOT_CREDENTIAL_OWNER`, `404 CREDENTIAL_NOT_FOUND` |
| 6 | `POST /api/proofs/generate` | cookie, owner | `{ credentialId, targetChain, policyId, consentHash }` | `202 { proofRequestId, status }` | `400 INVALID_CHAIN`/`INVALID_POLICY`/`UNKNOWN_CONSENT_HASH`, `403 NOT_CREDENTIAL_OWNER`, `404 CREDENTIAL_NOT_FOUND`, `409 CREDENTIAL_NOT_ACTIVE` |
| 7 | `GET /api/proofs/:id/status` | cookie, owner | — | `200 { proofRequestId, status, failureReason }` | `403 NOT_CREDENTIAL_OWNER`, `404 PROOF_REQUEST_NOT_FOUND` |
| 8 | `POST /api/verify` | cookie, owner | `{ proofRequestId }` | `202 { verificationId, status }` | `409 PROOF_NOT_READY`, `404 PROOF_REQUEST_NOT_FOUND`, `500 VERIFICATION_FAILED` |
| 9 | `GET /api/verify/:id/result` | cookie (owner) **or** `DEMO_VERIFIER_KEY` header | — | `200 { verificationId, chain, result, verifiedAt }` | `403 NOT_CREDENTIAL_OWNER`, `404 VERIFICATION_NOT_FOUND` |

All authenticated endpoints also return `401 UNAUTHENTICATED` with no valid session, and `400 INVALID_JSON`/`INVALID_REQUEST` for a malformed body. `GET /api/verify/:id/result` documents a `425` (too-early) in `docs/api-spec.md`; in the synchronous MVP it is unreachable (an unknown id is a `404`) — you do not need a `425` branch, but harmless to keep one.

---

## 3. Shared constants the frontend must send verbatim

These are fixed backend values. Sending anything else is a `400`.

| Constant | Value | Where it's sent | Backend source |
|---|---|---|---|
| Jurisdiction | `"IN"` | `jurisdiction` in `POST /credentials/issue` | `lib/config/policy.ts` `SUPPORTED_JURISDICTION` |
| Policy id | `"kyc_tier_1"` | `policyId` in `POST /proofs/generate` | `lib/config/policy.ts` `MVP_POLICY_ID` |
| Consent text (v1) | *exact string below* | displayed to the user; its hash → `consentHash` | `lib/services/consentService.ts` `CONSENT_TEXT_VERSIONS.v1` |

**Consent text v1 (must be shown and hashed byte-for-byte):**

> I consent to NIVAAN generating a zero-knowledge proof of my KYC compliance status for the selected chain. No identity documents or personal data are shared; only a pass/fail result is disclosed.

**`consentHash` computation (shared contract — must match the backend byte-for-byte):** SHA-256 over the exact UTF-8 bytes of the consent text, hex-encoded. In the browser:

```js
async function consentHash(text) {
  const bytes = new TextEncoder().encode(text);           // UTF-8
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

This matches the backend's `createHash('sha256').update(text, 'utf8').digest('hex')`. The string must be identical (spacing and punctuation included) or the backend returns `400 UNKNOWN_CONSENT_HASH`.

> ⚠️ **Provisional shared contract — needs joint sign-off.** Both the consent copy and this hashing scheme are marked PROVISIONAL in `lib/services/consentService.ts`. `docs/data-model.md` states only that the text is "static and versioned in code"; it fixes neither the copy nor the algorithm. Do not fork the wording. When the final copy is agreed, the backend constant and this document update together, and the hash changes accordingly.

---

## 4. Per-screen wiring

Legend: **Trigger** = the UI action; **Call** = endpoint; **Maps to** = which response field drives which UI element; **On error** = per-code handling.

### 4.0 Nav / login state (`app/components/Shared.tsx`)

- **Currently:** `Nav` takes an `isLoggedIn` boolean, and every page passes a **hardcoded literal** (`onboarding`/`consent`/`demo-verifier` → `false`; `wallet`/`prove`/`result` → `true`). Login state is therefore fake.
- **Change to:** derive login state from **`GET /api/auth/session`** — `200` → logged in (`{ did, expiresAt }` available for display/expiry), `401` → logged out. Drive the "Connect Wallet" vs "Credential Wallet" nav button off that result.
- **Login itself** (the "Connect Wallet" affordance) is the nonce → signature flow, which is Antigravity/`lib/wallets` territory:
  1. `GET /api/auth/nonce` → `{ nonce, expiresAt }`.
  2. Have the wallet sign the nonce.
  3. `POST /api/auth/verify` with `{ walletAddress, nonce, signature }`. On `200` the HttpOnly cookie is set; re-check `GET /api/auth/session` to flip the UI to logged-in.
  - Errors: `400 INVALID_SIGNATURE` (bad signature), `401 NONCE_UNKNOWN`/`NONCE_EXPIRED` (fetch a fresh nonce and retry), `409 NONCE_ALREADY_USED` (fetch a fresh nonce), `500 SIGNATURE_VERIFICATION_UNAVAILABLE` (backend boundary not wired yet — show a normal error).
- **Also:** the nav links to `/docs`, which has no page in the app (only `/onboarding`, `/consent`, `/wallet`, `/prove`, `/result`, `/demo-verifier` exist). Either add the page or drop the link — out of scope content-wise per `docs/product-spec.md`.

### 4.1 Onboarding (`app/onboarding/page.tsx`)

- **Purpose:** capture the Aadhaar **Test QR** (ADR-003), derive the witness input, and **issue the credential**. QR scan/upload and witness derivation are client-side (Antigravity + Anon Aadhaar / `lib/wallets`); they produce the `circuitProofInput` object issuance consumes.
- **Session:** issuance requires a live session, so the wallet-connect (§4.0) must have happened before the issue call fires. This screen currently hardcodes `isLoggedIn=false`; reconcile with real session state.
- **Trigger:** the primary CTA (currently labelled "Continue to Consent" — relabel, since consent no longer follows onboarding; see §5).
- **Call:** `POST /api/credentials/issue`
  - **Request:** `{ circuitProofInput: <object derived from the QR>, jurisdiction: "IN" }`.
  - **Success `201`:** `{ credentialId, did, status: "active", issuedAt, expiresAt }`. Persist `credentialId` (the only handle to the credential — there is no "list credentials" endpoint) and `issuedAt` (only ever returned here). On success, navigate to `/wallet`.
  - **On error:** `400 UNSUPPORTED_JURISDICTION` (only `IN` is valid), `400 INVALID_REQUEST` (missing/non-object `circuitProofInput`), `422 CRITERIA_NOT_MET` (KYC criteria failed — a legitimate "not eligible" outcome; show it as such, not as a crash), `500 MIDNIGHT_UNREACHABLE` (issuance boundary not wired yet — normal error state), `401 UNAUTHENTICATED` (route through connect first).
- **Why issuance lives here (not on `/consent`):** a credential must exist before the Wallet can display it, and before consent can be logged (`ConsentLog.credentialId` is a required FK — see §5). So issuance happens at the end of onboarding, and `/consent` moves to *after* the wallet.
- **Elements to change:** "Scan with Camera" and the upload dropzone are inert (no handler) — wire them to the QR capture. Relabel/redirect the CTA so it issues, then lands on `/wallet`.

### 4.2 Consent (`app/consent/page.tsx`) — *relocated to sit between Wallet and Prove (§5)*

- **Purpose:** capture the user's **explicit, logged consent before any proof is generated** (`docs/product-spec.md`). In the corrected flow this screen sits **after** `/wallet` and **before** `/prove`, and it arrives with the `credentialId` the proof will be about.
- **Session:** required; the credential already exists (issued at onboarding, §4.1).
- **Trigger:** the accept CTA (currently labelled "Approve & Issue" — relabel to **"Approve"** / "I Consent"; issuance already happened, this screen no longer issues).
- **Action — no API call here.** This screen does **not** call an endpoint. It:
  1. Displays the exact versioned **v1 consent text** (§3), byte-for-byte.
  2. On accept, computes `consentHash` = SHA-256(UTF-8(text)) hex per §3.
  3. Carries `{ credentialId, consentHash }` forward to `/prove`. The backend records the consent **as part of `POST /proofs/generate`** (§4.4) — that call is what writes the `ConsentLog` row, keyed to `credentialId`. There is no separate "log consent" endpoint.
- **Navigation:** Wallet → **Consent** → Prove. The accept CTA routes to `/prove` carrying `{ credentialId, consentHash }`. The "Decline" action routes back to `/wallet` (currently points at `/onboarding` — repoint it).
- **Why this screen has no call of its own:** the only logged consent in the system is the `consentHash` on `POST /proofs/generate`. Placing `/consent` immediately before `/prove` means the text the user accepts here is exactly the text hashed into the proof they authorize on the next screen. See §5 for the full rationale.
- **Elements to change:** the two data rows ("Age Verification (>18)", "Nationality Status") are static illustration; keep as copy, but they are not driven by any API field. Relabel "Approve & Issue" → "Approve"; repoint "Decline" → `/wallet`.

### 4.3 Wallet (`app/wallet/page.tsx`)

- **Purpose:** show the user's issued credential and route into proving.
- **Session:** required. Replace hardcoded `isLoggedIn=true` with real session state (§4.0); if `401`, route to connect.
- **Call (populate the card):** `GET /api/credentials/:id/status` using the `credentialId` persisted at issuance.
  - **Success `200`:** `{ credentialId, status: "active" | "expired" | "revoked", expiresAt }`.
  - **Maps to:** status badge ← `status` (drive the green "Active" pill and its expired/revoked variants off this, not a hardcoded "Active"); "Expires" ← `expiresAt`.
  - **On error:** `404 CREDENTIAL_NOT_FOUND`, `403 NOT_CREDENTIAL_OWNER`, `401 UNAUTHENTICATED`.
- **Data-availability constraints (do not display fields the API can't supply):**
  - `status` returns only `{ credentialId, status, expiresAt }` — **no** `issuedAt`, issuer name, or credential "type". "Date Issued" can only come from the `201` issue response at onboarding (§4.1), persisted client-side; there is no endpoint to re-fetch it. "Issued By" / "Credential Type" are static labels (single hardcoded issuer, single `kyc_tier_1` type per ADR-005 / product-spec) — fine as constants, but they are not API-backed.
- **Elements to remove / change:**
  - **"Revoke" button — remove (confirmed).** There is **no** user-facing revoke endpoint, by design. Revocation is issuer/developer-controlled via a dev-only admin script (ADR-005; product-spec: the developer is "the only privileged actor"). A user-clickable Revoke has nothing to call and misrepresents the model.
  - **"Add New Credential" card — remove (confirmed)** for MVP. Its "Import from issuer or scan QR" implies multi-credential / import, which is explicitly out of scope (single credential type, single issuer). No endpoint backs "add/import".
  - **Hardcoded card values** ("Verified Identity", "Midnight Network", "Oct 24, 2026", "Oct 24, 2027") must be replaced by real data per the mapping above (with the issuer/type as intentional static labels).
- **Trigger onward:** "Generate Proof" → **`/consent`** (consent now precedes prove — §5), carrying `credentialId`.

### 4.4 Prove (`app/prove/page.tsx`)

- **Purpose:** pick the target chain, generate the proof, verify it, then show the result. **Consent was already captured on the preceding `/consent` screen (§4.2)** and arrives here as `{ credentialId, consentHash }`.
- **Session:** required (owner-only endpoints). Replace hardcoded `isLoggedIn=true`.
- **Current behavior to replace:** the "Generate Proof" button runs a **fake `setInterval` progress bar** and then hard-redirects to `/result`. There are **no** API calls. Replace the simulated progress with the real sequence below (drive the progress UI off actual call/poll transitions).
- **Step 1 — generate.** Trigger: "Generate Proof".
  - **Call:** `POST /api/proofs/generate`
  - **Request:** `{ credentialId, targetChain: "soroban" | "sepolia", policyId: "kyc_tier_1", consentHash }` — `targetChain` from the Soroban/Sepolia toggle (values already lowercase, correct); `credentialId` and `consentHash` are the two values carried in from `/consent` (§4.2), where `consentHash` was computed per §3 from the exact v1 text the user accepted.
  - **Success `202`:** `{ proofRequestId, status: "pending" }`.
  - **On error:** `400 INVALID_CHAIN` / `400 INVALID_POLICY` / `400 UNKNOWN_CONSENT_HASH` (your constants don't match §3), `409 CREDENTIAL_NOT_ACTIVE` (expired/revoked — send them back to the wallet), `403 NOT_CREDENTIAL_OWNER`, `404 CREDENTIAL_NOT_FOUND`.
- **Step 2 — poll proof status.** **Call:** `GET /api/proofs/:id/status` with `proofRequestId`, polled until terminal.
  - **`200`:** `{ proofRequestId, status: "pending" | "ready" | "failed", failureReason }`. Keep the spinner while `pending`; on `failed` show `failureReason`; on `ready` go to step 3.
- **Step 3 — submit for verification.** **Call:** `POST /api/verify` with `{ proofRequestId }`.
  - **Success `202`:** `{ verificationId, status: "pending" }` — carry `verificationId` to `/result`.
  - **On error:** `409 PROOF_NOT_READY` (poll step 2 longer before submitting), `404 PROOF_REQUEST_NOT_FOUND`, `403 NOT_CREDENTIAL_OWNER`, `500 VERIFICATION_FAILED` (boundary not wired yet — normal error).
- **Navigate to `/result`** carrying `verificationId` (do not hard-redirect on a fake timer).
- **Copy note:** "This happens locally on your device" — proof generation runs against the Midnight Proof Server orchestrated by the backend, not in the browser. Adjust wording so it doesn't claim in-browser proving.
- **Consent note:** `POST /api/proofs/generate` is the call that **writes the `ConsentLog` row** (keyed to `credentialId`, storing the `consentHash`). The user accepted the versioned v1 text on the preceding `/consent` screen (§4.2); this screen simply forwards the `consentHash` it produced. Do not re-prompt for consent here. See §5.

### 4.5 Result (`app/result/page.tsx`)

- **Purpose:** show the unified pass/fail for the verification.
- **Session:** required (owner path).
- **Call:** `GET /api/verify/:id/result` with the `verificationId` from `/prove`, polled until `200`.
  - **Success `200`:** `{ verificationId, chain: "soroban" | "sepolia", result: boolean, verifiedAt }`.
  - **Maps to:** the success/fail hero ← **`result`** (the screen currently only renders success — render the `false`/fail state too); "verified on the *X* network" copy ← **`chain`** (don't hardcode "Soroban"); timestamp ← `verifiedAt`.
  - **On error:** `404 VERIFICATION_NOT_FOUND`, `403 NOT_CREDENTIAL_OWNER`, `401 UNAUTHENTICATED`. (`425` documented but unreachable in the MVP — optional poll-again branch.)
- **Elements to remove:**
  - **"Transaction Hash" (`0x8f2a...39d1b`) — remove.** Not in the result contract; the API returns no tx hash. (The backend stores the attestation signature server-side for audit per `docs/data-model.md`, but never returns it to the client.)
  - **"Verification Payload" (the `groth16`/`bn128` JSON block) — remove.** Not in the contract, and cryptographically wrong: Midnight uses Halo2 over Pluto-Eris, and verification is **backend-attested** (ADR-001) — the client never receives a proof payload. Showing a Groth16 payload misrepresents the system.
- **Trigger onward:** "View on Verifier App" → `/demo-verifier` (must carry the `verificationId` — see §4.6); "Return to Wallet" → `/wallet`.

### 4.6 Demo verifier (`app/demo-verifier/page.tsx`)

- **Purpose:** the "other side" — a simulated third-party verifier that checks a result **without** the user's session, using the `DEMO_VERIFIER_KEY` instead.
- **Call:** `GET /api/verify/:id/result` with the **`DEMO_VERIFIER_KEY` request header** (no session cookie).
  - **Success `200`:** same `{ verificationId, chain, result, verifiedAt }` shape.
  - **Maps to:** "Access Granted" vs denied ← `result`; the network line ← `chain`.
- **Two hard requirements:**
  1. **The `DEMO_VERIFIER_KEY` must never reach the browser — poll it through a same-origin server-side proxy.** This page is a client component; a keyed request from client JS would put the secret in the bundle/network (violates `CLAUDE.md` "never expose secrets" and `docs/security-model.md`). The required shape:
     - The browser polls a **same-origin backend route** (`GET /api/demo-verifier/:id/result`) sending **only** the `verificationId` — no key.
     - That route reads `DEMO_VERIFIER_KEY` from server env and calls `GET /api/verify/:id/result` **server-to-server** with the key header, then returns the `{ verificationId, chain, result, verifiedAt }` shape to the client.
     - The key therefore lives only in server env — never in client code, never in the client bundle, never in a `NEXT_PUBLIC_*` var, never in a request the browser makes.
     - **Ownership:** because that proxy route lives under `/api`, it is **Claude Code's to author**, and — per the frozen-contract rule (§1) — it was added to `docs/api-spec.md` **first**. ✅ **Now implemented** (session 5): `app/api/demo-verifier/[id]/result/route.ts`. It takes **no key from the client** — it reads `DEMO_VERIFIER_KEY` from its own server env as an enablement gate and calls the verification service directly, returning the `{ verificationId, chain, result, verifiedAt }` shape (`404` on unknown id). Antigravity can wire the client poll against `GET /api/demo-verifier/:id/result` and render its states.
  2. **The surface needs a `verificationId` to poll.** It has no session, so it can't discover one. For the demo, pass the `verificationId` to this surface out-of-band — e.g. as a query param on the "View on Verifier App" link from `/result` (`/demo-verifier?vid=<verificationId>`).
- **Elements to remove:**
  - **"Simulate Verification" button and the fake log block** ("Parsing Groth16 payload…", contract `0x8A4b…`, hash `0x8f2a…39d1b`) — remove. Replace the simulated toggle with the real poll of `GET /api/verify/:id/result`. The Groth16/payload log lines are invented and, per ADR-001, cryptographically inaccurate.
  - Keep the "Waiting for Proof…" / "Access Granted" states, but drive them off the real poll (`pending`/`404` → waiting; `200` + `result:true` → granted; `200` + `result:false` → denied).

---

## 5. Resolved — consent-screen navigation order (frontend correction, no backend change)

**Decision:** the `/consent` screen moves to sit **between `/wallet` and `/prove`**, not between onboarding and the wallet. Credential **issuance** moves to the end of **onboarding** (§4.1). This is a **navigation-order correction on the frontend only** — no endpoint, field, or backend behavior changes.

**Corrected flow:**

```
Onboarding ──issue credential──▶ Wallet ──▶ Consent ──▶ Prove ──▶ Result ──▶ Demo Verifier
           POST /credentials/issue         (accept    POST /proofs/generate   GET /verify/:id/result
                                            v1 text,   (writes ConsentLog,     (via server-side proxy
                                            hash it)    keyed to credentialId)  for the demo surface)
```

**Why this order (two reasons, both binding):**
1. **Product-spec literal flow.** `docs/product-spec.md` orders the journey as KYC credential → then consent → then proof. Consent belongs immediately before the proof it authorizes, which is the `/prove` step — so `/consent` sits directly before it.
2. **The `ConsentLog.credentialId` FK.** `docs/data-model.md` makes `credentialId` a **required** foreign key on `ConsentLog`, and the only logged consent is the `consentHash` on `POST /proofs/generate`. Consent therefore **cannot be recorded before a credential exists**. Logging consent before issuance would require a schema change — which is explicitly **out of scope**. Issuing at onboarding guarantees the credential exists before `/consent` and `/prove` run.

**Consequences for the screens (already reflected in §4):**
- **Issuance moves to onboarding (§4.1):** the onboarding CTA calls `POST /credentials/issue` and lands on `/wallet`.
- **`/consent` captures the consent hash (§4.2):** it shows the exact v1 text, computes `consentHash`, and carries `{ credentialId, consentHash }` to `/prove`. It makes **no** API call itself.
- **`/prove` forwards it (§4.4):** `POST /proofs/generate` sends the `consentHash`, and that call writes the `ConsentLog` row.

The consent copy remains **provisional** in `lib/services/consentService.ts` pending joint sign-off; when the final wording is agreed, the backend constant and §3 of this document update together and the hash changes accordingly. The backend contract does not change for this reordering.

---

## 6. Cross-cutting checklist for Antigravity

- [ ] Replace every hardcoded `isLoggedIn` with `GET /api/auth/session` (§4.0).
- [ ] Wire the connect flow: `GET /api/auth/nonce` → sign → `POST /api/auth/verify` (§4.0).
- [ ] Persist `credentialId` from the `201` issue response; it's the only handle to the credential (§4.1–4.4).
- [ ] Persist `issuedAt` from issuance if the wallet shows it — no endpoint re-serves it (§4.3).
- [ ] Remove: wallet **Revoke** button, wallet **Add New Credential** card, result **Transaction Hash**, result **Verification Payload**, demo-verifier **Simulate Verification** + fake Groth16 logs (§4.3, §4.5, §4.6).
- [ ] Replace the fake progress bar on `/prove` with the real generate → poll → verify sequence (§4.4).
- [ ] Render `/result` from `result` + `chain` (support the fail state), not hardcoded success/Soroban (§4.5).
- [ ] Poll the demo verifier through a **same-origin server-side proxy** that holds `DEMO_VERIFIER_KEY` in server env; the browser sends only `verificationId` (§4.6). *(Proxy route is a pending Claude Code deliverable — see `docs/progress.md`.)*
- [ ] Send `jurisdiction:"IN"` and `policyId:"kyc_tier_1"` verbatim; compute `consentHash` per §3.
- [ ] Handle the three honest `500`s (auth/verify, credentials/issue, verify) as normal error states — they'll return `2xx` once wired, same shapes (§1).
- [ ] Reorder the flow: **Onboarding → Wallet → Consent → Prove** — issuance fires at onboarding, consent is captured immediately before prove (§5).
