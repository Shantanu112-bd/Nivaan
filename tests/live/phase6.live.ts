// Phase 6 LIVE acceptance (docs/roadmap.md Phase 6; docs/deployment.md §3, step 3).
//
// Runs the REAL chain adapters against the DEPLOYED testnet registries, signing with
// the REAL backend key from `.env.local`. This is the end-to-end confirmation the
// runbook calls for on top of the contracts' own local suites (`hardhat test`,
// `cargo test`):
//
//   POSITIVE — a backend-signed attestation is ACCEPTED by both registries:
//              submitAttestation lands on-chain and getResult reads back result=true
//              for a fresh, unique credentialId.
//   NEGATIVE — a WRONG-key signature is REJECTED by both registries (the contract's
//              baked-in trust root recovers a different signer -> InvalidSignature),
//              proving the signature check, not just the happy path.
//
// The negative path drives the *real* adapter but stubs BACKEND_ATTESTATION_SIGNING_KEY
// to a valid-but-different key (the contracts' own 0x11..x32 test key), so signing
// still succeeds while RPC / registry / deployer stay real — the rejection can only
// come from the on-chain signature verification.
//
// NOT part of `npm test` (default include is tests/**/*.test.ts; this is *.live.ts).
// Run: npx vitest run --config vitest.live.config.mts
//
// Never prints a secret — only public artifacts (tx hashes, on-chain results).

import path from 'node:path';
import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mirror the unit suite: mock the DB module so importing the chains layer does not
// instantiate a Prisma client (the chains code imports ChainTarget from here as a
// value). This keeps the malformed placeholder DATABASE_URL out of the picture — the
// live test needs no database.
vi.mock('@/lib/db/prisma', () => ({
  ChainTarget: { SOROBAN: 'SOROBAN', SEPOLIA: 'SEPOLIA' },
}));

import { ChainTarget } from '@/lib/db/prisma';
import { getChainAdapter, type AttestationFields } from '@/lib/chains';
import { nowUnixSeconds } from '@/lib/chains/attestation';
import {
  ChainAdapterNotConfiguredError,
  InvalidSigningKeyError,
  StaleAttestationError,
} from '@/lib/chains/errors';

// A valid secp256k1 key that is NOT the backend trust root (the same 0x11..x32 key the
// contracts' unit tests use). Signing succeeds; on-chain recovery yields a different
// address/pubkey than the one baked into each registry -> InvalidSignature.
const WRONG_KEY = `0x${'11'.repeat(32)}`;

const CHAINS = [ChainTarget.SEPOLIA, ChainTarget.SOROBAN] as const;

beforeAll(() => {
  // Load the deployed registry addresses + real keys. env.ts getters read process.env
  // fresh on each access (no caching), and the adapters read them lazily at call time,
  // so populating process.env here is sufficient.
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A fresh, unique attestation so runs never collide with an AlreadyRecorded id. */
function freshFields(chain: ChainTarget): AttestationFields {
  return {
    credentialId: `phase6-live-${chain}-${randomUUID()}`,
    chain,
    result: true,
    timestamp: nowUnixSeconds(),
  };
}

describe('Phase 6 LIVE — positive: backend-signed attestation accepted on both registries', () => {
  for (const chain of CHAINS) {
    it(`${chain}: submitAttestation lands and getResult reads back result=true`, async () => {
      const adapter = getChainAdapter(chain);
      const fields = freshFields(chain);

      const { txHash, signature } = await adapter.submitAttestation(fields);
      expect(typeof txHash).toBe('string');
      expect(txHash.length).toBeGreaterThan(0);
      expect(signature).toMatch(/^0x[0-9a-f]{130}$/i);
      // eslint-disable-next-line no-console
      console.log(`[${chain}] submitted: tx=${txHash}`);

      const res = await adapter.getResult(fields.credentialId);
      expect(res, 'getResult should find the just-submitted attestation').not.toBeNull();
      expect(res!.result).toBe(true);
      expect(Number(res!.timestamp)).toBe(fields.timestamp);
      // eslint-disable-next-line no-console
      console.log(`[${chain}] getResult -> result=${res!.result} timestamp=${res!.timestamp}`);
    });
  }
});

describe('Phase 6 LIVE — negative: wrong-key signature rejected on both registries', () => {
  for (const chain of CHAINS) {
    it(`${chain}: a wrong-key signature is rejected on-chain (not a pre-broadcast gate)`, async () => {
      vi.stubEnv('BACKEND_ATTESTATION_SIGNING_KEY', WRONG_KEY);
      const adapter = getChainAdapter(chain);
      // Fresh id so the rejection is the signature check, never AlreadyRecorded.
      const fields = freshFields(chain);

      let err: unknown;
      try {
        await adapter.submitAttestation(fields);
      } catch (e) {
        err = e;
      }

      expect(err, 'expected submitAttestation to reject a wrong-key signature').toBeDefined();
      // Must be an ON-CHAIN rejection. The honest-gate errors below all fire BEFORE the
      // contract sees the signature; excluding them (with every real var set, a fresh
      // timestamp, and a valid signing key) proves the reject came from the contract's
      // signature verification itself.
      expect(err).not.toBeInstanceOf(ChainAdapterNotConfiguredError);
      expect(err).not.toBeInstanceOf(InvalidSigningKeyError);
      expect(err).not.toBeInstanceOf(StaleAttestationError);
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.log(`[${chain}] rejected as expected: ${msg.slice(0, 300)}`);

      // Restore the real key and confirm nothing was recorded under the fresh id.
      vi.unstubAllEnvs();
      const res = await adapter.getResult(fields.credentialId);
      expect(res, 'a rejected attestation must not be recorded').toBeNull();
    });
  }
});
