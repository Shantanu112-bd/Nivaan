# NIVAAN — Claude Code Project Context

## What this is

NIVAAN is a chain-agnostic zero-knowledge compliance credential layer built on Midnight. A user proves KYC eligibility once, using India Stack-rooted data (Aadhaar for the MVP), and that proof verifies on any chain with a deployed verifier — Soroban and an EVM testnet for the MVP — without re-sharing identity documents per integration.

This MVP is scoped for **one solo developer, minimal cost, testnet-only, single credential type, single issuer**. See `docs/product-spec.md` for exact scope boundaries — do not build past them without explicit direction.

## Core principle

One product. One source of truth. Two development environments.

- **Claude Code** owns backend, database, blockchain integration, smart contracts, security, testing, deployment configuration.
- **Antigravity** owns UI/UX, pages/components, client-side state, frontend API integration, responsive design, frontend testing.

Both build against the same specs below. Neither invents requirements, APIs, or architecture not documented here.

## Source-of-truth documents

| File | Contents |
|---|---|
| `docs/product-spec.md` | Core flow, actors, MVP scope in/out, success definition |
| `docs/architecture.md` | System, frontend, backend, database, credential, ZK, Midnight, Soroban, EVM, auth, deployment architecture; tech stack; repo structure |
| `docs/api-spec.md` | Every API endpoint: request, response, auth, validation, errors, side effects |
| `docs/data-model.md` | Exact database schema |
| `docs/security-model.md` | Threat model, security requirements, secrets handling |
| `docs/decisions.md` | Architecture decision records — read this before questioning why something was built a specific way |
| `docs/roadmap.md` | Phase 0–12 build sequence, environment/resources, MVP boundary, acceptance checklists |

## Engineering rules (full detail in the master development context already provided)

- Inspect existing code before modifying it. Understand → Plan → Implement → Test → Review → Validate.
- Smallest correct change. Reuse existing patterns. No unrelated refactoring, no unnecessary dependencies.
- Backend logic is authoritative — never rely on frontend validation for security.
- Never hardcode or expose secrets. Never disable or bypass tests to hide failures.
- Do not claim a feature works without running the validation in `docs/roadmap.md`'s acceptance criteria for that phase.
- Preserve MVP scope (`docs/product-spec.md`) unless explicitly redirected.
- Ask before major changes to: core architecture, database technology, auth model, security assumptions, blockchain architecture, production infra. Everything else, proceed.

## Current phase

Blueprint complete. Implementation has not started. Begin at `docs/roadmap.md` Phase 0 only after this full doc set has been reviewed.
