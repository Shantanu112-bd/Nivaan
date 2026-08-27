// Sepolia (EVM) registry adapter — implements ChainAdapter (docs/architecture.md
// §9). Honest stub for now: it conforms to the interface so verificationService
// and the /verify route typecheck and wire cleanly, but the on-chain calls throw
// until Phase 6 installs viem, deploys contracts/evm/contracts/Registry.sol, and
// implements OpenZeppelin-ECDSA signing over the keccak256 digest specified in
// lib/chains/attestation.ts. It never fabricates a tx hash or result.

import { ChainTarget } from '@/lib/db/prisma';

import { ChainAdapterNotWiredError } from './errors';
import type {
  AttestationFields,
  ChainAdapter,
  OnChainResult,
  SubmitAttestationResult,
} from './types';

export const evmAdapter: ChainAdapter = {
  chain: ChainTarget.SEPOLIA,

  async submitAttestation(_fields: AttestationFields): Promise<SubmitAttestationResult> {
    throw new ChainAdapterNotWiredError('SEPOLIA', 'submitAttestation');
  },

  async getResult(_credentialId: string): Promise<OnChainResult | null> {
    throw new ChainAdapterNotWiredError('SEPOLIA', 'getResult');
  },
};
