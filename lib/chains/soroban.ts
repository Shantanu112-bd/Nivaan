// Soroban registry adapter — implements ChainAdapter (docs/architecture.md §8).
// Honest stub for now: it conforms to the interface so verificationService and the
// /verify route typecheck and wire cleanly, but the on-chain calls throw until
// Phase 6 installs the Stellar SDK, deploys contracts/soroban/src/lib.rs, and
// implements secp256k1 signing over the SHA-256 digest specified in
// lib/chains/attestation.ts. It never fabricates a tx hash or result.

import { ChainTarget } from '@/lib/db/prisma';

import { ChainAdapterNotWiredError } from './errors';
import type {
  AttestationFields,
  ChainAdapter,
  OnChainResult,
  SubmitAttestationResult,
} from './types';

export const sorobanAdapter: ChainAdapter = {
  chain: ChainTarget.SOROBAN,

  async submitAttestation(_fields: AttestationFields): Promise<SubmitAttestationResult> {
    throw new ChainAdapterNotWiredError('SOROBAN', 'submitAttestation');
  },

  async getResult(_credentialId: string): Promise<OnChainResult | null> {
    throw new ChainAdapterNotWiredError('SOROBAN', 'getResult');
  },
};
