# Product Spec

## What NIVAAN does

Lets a user prove they hold a valid, current KYC credential — without revealing the underlying identity data — to any verifier (an RWA issuer, DeFi protocol, or other integrator) on any chain that has a deployed NIVAAN verifier contract.

## Core flow

```
User
  → KYC Credential        (Aadhaar-derived, via Anon Aadhaar Test QR for MVP)
  → Privacy-Preserving Credential   (Minokawa circuit, sealed DID-bound ledger entry)
  → Consent                (explicit, logged, before any proof is generated)
  → ZK Proof                (generated locally via Midnight Proof Server)
  → Verification            (backend-attested, checked by Soroban + EVM testnet registries — see ADR-001)
  → Result                  (unified pass/fail regardless of chain)
```

## Actors

| Actor | Role in MVP |
|---|---|
| Individual user | Onboards, generates a credential, requests and completes a proof |
| Issuer | Single, hardcoded, operated by the developer — no onboarding flow, no multi-issuer registry |
| Verifier (demo) | One simulated RWA/DeFi consumer showing the "other side" of the flow |
| Developer | Operates issuer and backend signing keys; the only privileged actor in the system |

Not present in MVP: enterprise compliance teams, auditors/regulators, third-party developers/integrators. These are real long-term users of NIVAAN but have no dedicated surface in this MVP.

## MVP scope — build this

- India-focused, one credential type: KYC tier + jurisdiction boolean
- One issuer (hardcoded)
- Aadhaar data sourced via Anon Aadhaar's official Test QR Code Generator (see ADR-003) — not live UIDAI integration
- Midnight testnet credential issuance and proof generation
- Soroban testnet + one EVM testnet (Sepolia) verification, via backend-attested registries (ADR-001)
- TTL-based expiry (30 days default) + minimal issuer-controlled revocation list
- Single explicit consent step, logged
- Functional frontend covering onboarding through result
- Functional backend: issuance, proof orchestration, verification, revocation
- One demo verifier surface

## Explicitly out of scope — do not build

- Multiple issuers or an issuer trust registry
- Multiple credential types; DigiLocker, GST, or Account Aggregator sources
- Live UIDAI AUA/KUA integration
- Merkle-accumulator or other real-time revocation beyond a simple list
- Enterprise compliance dashboard, auditor/regulator views
- Developer SDK, sandbox, or public API documentation site
- Mainnet deployment of anything
- Native cross-chain ZK proof verification (Halo2-to-Groth16 recursion) — see ADR-001 for why this is deferred, not attempted
- CI/CD pipelines beyond what a single Vercel deploy provides by default
- Notifications, accessibility polish beyond basic semantic HTML, help/education content, multi-language UI

If a requested feature isn't in the "build this" list, treat it as out of scope and flag it rather than implementing it.

## Success definition

The MVP is done when: a user completes onboarding with test Aadhaar data, receives a real Minokawa-issued credential on Midnight testnet, generates a real ZK proof, and that proof (via backend attestation) is accepted by both the Soroban testnet and Sepolia registry contracts, with the demo verifier correctly showing pass for a valid credential and fail for an expired or revoked one — end to end, in one sitting, with no PII leaving the user's device at any point. Full checklist in `docs/roadmap.md`.
