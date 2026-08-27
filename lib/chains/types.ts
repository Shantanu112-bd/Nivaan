// Shared types for the chain-adapter layer (docs/architecture.md §3): both
// registry adapters implement one ChainAdapter interface so verificationService
// submits + queries attestations without branching on chain type.

import type { ChainTarget } from '@/lib/db/prisma';

/**
 * Logical attestation fields the backend signs (docs/architecture.md §6 step 3:
 * `{ credentialId, chain, result, timestamp }`). `timestamp` is unix SECONDS.
 * `credentialId` is the DB cuid; it is hashed to a 32-byte on-chain id by
 * `credentialIdToBytes32` in attestation.ts.
 */
export interface AttestationFields {
  credentialId: string;
  chain: ChainTarget;
  result: boolean;
  timestamp: number;
}

/**
 * Outcome of submitting an attestation to a registry contract. The signature is
 * returned (not just the tx hash) because the backend produces it inside the
 * adapter — signing is chain-specific (keccak256 for EVM vs SHA-256 for Soroban,
 * see attestation.ts) — and verificationService persists it as
 * `VerificationResult.attestationSig` for audit (docs/data-model.md).
 */
export interface SubmitAttestationResult {
  txHash: string;
  /** Hex-encoded (0x-prefixed) backend signature actually submitted on-chain. */
  signature: string;
}

/** A verification result read back from a registry contract. */
export interface OnChainResult {
  result: boolean;
  /** Unix seconds, as recorded on-chain. */
  timestamp: number;
}

/**
 * Uniform interface over both registry contracts. `verificationService` depends
 * only on this, never on Soroban/EVM specifics.
 *
 * `submitAttestation` takes the logical fields and, internally, signs them with
 * BACKEND_ATTESTATION_SIGNING_KEY using the chain's digest convention, then
 * submits — so the one place that touches chain crypto is the adapter, and the
 * caller stays chain-agnostic.
 */
export interface ChainAdapter {
  readonly chain: ChainTarget;
  submitAttestation(fields: AttestationFields): Promise<SubmitAttestationResult>;
  /** Returns null when no attestation is recorded for `credentialId`. */
  getResult(credentialId: string): Promise<OnChainResult | null>;
}
