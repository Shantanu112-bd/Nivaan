# Security Model

## The one trust assumption to never lose track of

Per ADR-001, cross-chain verification is backend-attested, not natively ZK-verified on-chain. **The `BACKEND_ATTESTATION_SIGNING_KEY` is the actual root of trust for every verification result in this system.** Every other security control in this document matters less than protecting that key. If it leaks, an attacker can forge arbitrary "verified" results on both registry contracts. Treat its handling as the highest-priority security item in the MVP, above anything else in this file.

## Threat model (MVP-scoped — not the full production model)

| Threat | Relevant at MVP scale? | Mitigation |
|---|---|---|
| Backend attestation signing key compromise | **Yes — highest priority** | Env var only, never committed; rotate immediately if exposed; testnet-only key so blast radius is bounded to demo integrity, not funds |
| Replay of a valid attestation | Yes | Attestation includes `credentialId` + `timestamp`; registry contracts should reject duplicate `credentialId` submissions or stale timestamps beyond a short window |
| Credential forgery (fake witness data producing a valid credential) | Yes, but bounded by circuit correctness | Circuit logic (`proveComplianceTier`) is the actual control here — test it directly with both valid and invalid witness inputs |
| Session hijacking (wallet auth) | Yes | Short-lived, `HttpOnly`, `Secure`, `SameSite=Strict` cookies; nonce single-use and time-limited |
| API abuse / brute force on auth endpoints | Yes | Shared rate-limit middleware on all `/api/*` routes |
| Fake issuer | **No** — single hardcoded issuer, no registry to attack (ADR-005) |
| Multi-issuer trust exploitation | **No** — not present in MVP |
| Sybil attacks across many credentials | Low priority — single issuer, single credential type bounds this naturally for MVP |
| Compromised third-party integrator / malicious verifier | Low priority — only one demo verifier exists, controlled by the developer |
| Smart contract exploits beyond signature-check logic | Low complexity surface — both registry contracts are ~2 functions each, review by hand is sufficient at this scale; still write the negative tests in `docs/roadmap.md` Phase 6 |
| Insider threat | N/A — solo developer |

Full threat model (fake issuers at scale, compromised third-party integrators, key rotation policy, formal contract audit) is postponed per `docs/product-spec.md` — this table is the MVP floor, not the long-term security program.

## Concrete requirements — MVP floor

- [ ] `BACKEND_ATTESTATION_SIGNING_KEY`, `ISSUER_ADMIN_KEY`, `DEMO_VERIFIER_KEY`, and all wallet secrets live only in environment variables / Vercel's encrypted env storage — never in source, never logged
- [ ] No PII in any database table or log line — verify against `docs/data-model.md` on every migration
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`, short expiry (24h is reasonable for a demo)
- [ ] Auth nonces are single-use and expire quickly (5 minutes is reasonable)
- [ ] Rate limiting on all `/api/*` routes — a single middleware is sufficient, no need for per-route tuning at MVP scale
- [ ] Registry contracts reject attestations with a `credentialId` already recorded, and reject timestamps outside a reasonable window (replay protection)
- [ ] All deployed contracts and all funded accounts are testnet-only — before demo day, grep the repo and env config for anything resembling a mainnet RPC URL or a funded mainnet key
- [ ] Circuit tests cover both a valid witness input (produces a credential) and at least one invalid input (correctly rejected) — not just the happy path
- [ ] The Path C trust assumption (this file's opening section) is stated in the README, not just in this doc

## What's explicitly not required for MVP

Formal smart contract audit, key rotation automation, intrusion detection/monitoring, incident response runbook, multi-issuer trust verification, rate-limit tuning per endpoint, penetration testing. All reasonable for a funded production system — none of it changes whether the MVP demo works or is honest about its trade-offs.
