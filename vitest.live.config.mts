// Vitest config for LIVE testnet acceptance tests (Phase 6 — docs/deployment.md §3.3,
// docs/roadmap.md Phase 6 acceptance).
//
// Deliberately SEPARATE from vitest.config.mts so these never run under `npm test`:
// the default config includes only `tests/**/*.test.ts`, whereas live specs are named
// `*.live.ts`, hit the DEPLOYED registries, and require funded keys from `.env.local`.
// Run explicitly:
//
//   npx vitest run --config vitest.live.config.mts
//
// The `@` alias mirrors tsconfig's `@/* -> ./*` (same as the unit config) so the real
// adapters resolve `@/lib/...` identically.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.ts'],
    // Testnet round-trips: EVM simulate+write+waitForReceipt (~1 Sepolia block) and
    // Soroban prepare+send+poll. Generous per-test / per-hook ceilings.
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
  resolve: {
    // `npx vitest` runs from the project root, so cwd is the alias base (matches the
    // unit config's rationale — avoids ESM/CJS __dirname ambiguity).
    alias: { '@': process.cwd() },
  },
});
