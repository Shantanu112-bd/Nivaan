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

## Known and accepted findings

Security findings that have been reviewed and **consciously accepted** for the MVP, with the rationale and the condition under which each must be revisited. Accepting a finding here is a decision, not an oversight — every entry states why the risk is tolerable at MVP scale and what would force a re-evaluation.

### AF-1 — `deepmerge-ts` advisory in the Prisma CLI dependency chain (accepted 2026-08-27)

- **Finding.** `npm audit` reports 3 high-severity advisories, all tracing to a single transitive package: `deepmerge-ts@7.1.5` (GHSA-ggr8-5vv4-36mx — uncontrolled recursion / stack exhaustion when merging maliciously deep or self-referential object graphs). It is pulled in via `@prisma/config` → `prisma`, i.e. Prisma 7's CLI/build-time configuration layer. It is **not** introduced by the runtime libraries added for the chain adapters — `@noble/curves`, `viem`, and `@stellar/stellar-sdk` audit clean.
- **Reachability.** `deepmerge-ts` is exercised only when the Prisma CLI merges configuration (fed by our own `prisma.config.ts`) at `generate` / `migrate` / build time. It is **not on any request-handling path**, and the object it merges is our own static config — never attacker-controlled request input. The exploit requires feeding the merge a hostile object graph, which nothing in this system does.
- **Decision — accept as-is, no dependency change.** There is no non-breaking fix: the latest Prisma 7 (`@prisma/config@7.10.0`) still pins `deepmerge-ts@7.1.5`; `npm audit fix --force` downgrades to `prisma@6.12.0` (backward-breaking), and the only forward path is the unstable `prisma@8.0.0-rc`. A major-version downgrade — or an RC bump — of the core database tooling is not justified to patch a build-time config-merge path with no request-input reachability, for an MVP with no production traffic (testnet-only, no real users). Per `CLAUDE.md`, changing database technology requires operator sign-off; the operator reviewed this and chose to accept it rather than change Prisma.
- **Re-evaluation trigger (do not skip).** Before **any** real / mainnet / production deployment — and no later than when Prisma 8 stabilizes — re-run `npm audit` and upgrade Prisma to a line that no longer pins the vulnerable `deepmerge-ts`. This finding is accepted for the testnet MVP **only**; it must not be silently carried into a production build. Ties into the MVP-floor requirement that all deployed contracts and funded accounts are testnet-only — the same pre-mainnet gate is where this gets cleared.
