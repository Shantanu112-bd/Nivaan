// verificationService — Phase 7 orchestration for POST /verify and
// GET /verify/:id/result (docs/api-spec.md §Verification; docs/architecture.md §6).
//
// Flow (backend-attested cross-chain verification, ADR-001):
//   1. Load the ProofRequest; it must be READY (else 409).
//   2. Verify the Midnight proof via midnight-js  → boolean result.
//   3. Sign `{credentialId, chain, result, timestamp}` with the backend key and
//      submit to the target chain's registry — both done inside the ChainAdapter,
//      which returns the tx hash + the signature it submitted.
//   4. Persist a VerificationResult (storing the signature for audit).
//
// Steps 2 and 3 cross external boundaries that are not wired yet (the Midnight
// toolchain and the deployed registries — both flagged in docs/progress.md). They
// are injected dependencies so this orchestration is fully unit-testable with
// mocks, and so an unwired boundary throws loudly rather than fabricating a result.

import { getChainAdapter } from '@/lib/chains';
import { nowUnixSeconds } from '@/lib/chains/attestation';
import type { ChainAdapter } from '@/lib/chains/types';
import { ChainTarget, prisma, ProofStatus } from '@/lib/db/prisma';

import { NotCredentialOwnerError } from './credentialService';
import { ProofRequestNotFoundError, verifyProof as defaultVerifyProof } from './proofService';

/** Referenced proof exists but is not READY → API 409 (docs/api-spec.md). */
export class ProofNotReadyError extends Error {}
/** No VerificationResult with the given id → API 404. */
export class VerificationResultNotFoundError extends Error {}

/**
 * External boundaries, injected for testability. Defaults wire the real
 * proofService verifier and the real chain-adapter registry.
 */
export interface VerifyDeps {
  /** Verify the generated Midnight proof for a proof request → pass/fail. */
  verifyProof: (proofRequestId: string) => Promise<boolean>;
  /** Resolve the registry adapter for a target chain. */
  resolveAdapter: (chain: ChainTarget) => ChainAdapter;
}

const defaultDeps: VerifyDeps = {
  verifyProof: defaultVerifyProof,
  resolveAdapter: getChainAdapter,
};

export interface VerifyAndAttestResult {
  verificationId: string;
  /** Contract shape from docs/api-spec.md (202). The row is written synchronously
   *  (architecture.md §3 — no queue); the result is readable immediately via
   *  getVerificationResult. */
  status: 'pending';
}

/**
 * Verify a READY proof and submit a backend attestation to its target chain.
 * Idempotent on proofRequestId: the VerificationResult row is unique per proof
 * request (docs/data-model.md), so a repeat call returns the existing result
 * instead of re-submitting.
 *
 * `ownerWallet` is the authenticated caller; the underlying credential must belong
 * to it (docs/api-spec.md POST /verify: "must own the underlying credential").
 * Ownership is enforced here so authorization stays backend-authoritative.
 *
 * Throws: ProofRequestNotFoundError (→404), NotCredentialOwnerError (→403),
 * ProofNotReadyError (→409). Propagates verifier / adapter failures (→500).
 */
export async function verifyAndAttest(
  params: { proofRequestId: string; ownerWallet: string },
  deps: VerifyDeps = defaultDeps,
): Promise<VerifyAndAttestResult> {
  const { proofRequestId, ownerWallet } = params;

  const proofRequest = await prisma.proofRequest.findUnique({
    where: { id: proofRequestId },
    include: { verificationResult: true, credential: true },
  });
  if (!proofRequest) {
    throw new ProofRequestNotFoundError(proofRequestId);
  }

  // Backend-authoritative authorization: the caller must own the credential the
  // proof was generated for. Checked before any result is disclosed or written.
  if (proofRequest.credential.ownerWallet !== ownerWallet) {
    throw new NotCredentialOwnerError(proofRequest.credentialId);
  }

  // Idempotency: already verified — return the existing result, do not re-submit.
  if (proofRequest.verificationResult) {
    return { verificationId: proofRequest.verificationResult.id, status: 'pending' };
  }

  if (proofRequest.status !== ProofStatus.READY) {
    throw new ProofNotReadyError(proofRequestId);
  }

  const result = await deps.verifyProof(proofRequestId);

  const adapter = deps.resolveAdapter(proofRequest.targetChain);
  const submission = await adapter.submitAttestation({
    credentialId: proofRequest.credentialId,
    chain: proofRequest.targetChain,
    result,
    timestamp: nowUnixSeconds(),
  });

  const created = await prisma.verificationResult.create({
    data: {
      proofRequestId,
      chain: proofRequest.targetChain,
      result,
      attestationSig: submission.signature,
    },
  });

  return { verificationId: created.id, status: 'pending' };
}

export interface VerificationResultView {
  verificationId: string;
  chain: ChainTarget;
  result: boolean;
  verifiedAt: Date;
  /** Owner of the underlying credential — the route uses this to authorize a
   *  session caller (the demo-verifier key path bypasses ownership). */
  ownerWallet: string;
}

/**
 * Read a verification result for GET /verify/:id/result. Throws
 * VerificationResultNotFoundError (→404). Authorization (session owner vs.
 * DEMO_VERIFIER_KEY) is enforced at the route using the returned `ownerWallet`.
 *
 * Note: the api-spec's 425 ("too early") is unreachable in the synchronous MVP —
 * a verificationId only exists once the row (with its result) is written — so an
 * unknown id is a 404, not a 425.
 */
export async function getVerificationResult(
  verificationId: string,
): Promise<VerificationResultView> {
  const vr = await prisma.verificationResult.findUnique({
    where: { id: verificationId },
    include: { proofRequest: { include: { credential: true } } },
  });
  if (!vr) {
    throw new VerificationResultNotFoundError(verificationId);
  }

  return {
    verificationId: vr.id,
    chain: vr.chain,
    result: vr.result,
    verifiedAt: vr.verifiedAt,
    ownerWallet: vr.proofRequest.credential.ownerWallet,
  };
}
