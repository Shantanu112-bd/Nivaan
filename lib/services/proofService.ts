// proofService — proof-request lifecycle (Phase 5 DB work) + the Midnight proof
// verifier seam consumed by verificationService (docs/api-spec.md §Proofs;
// docs/architecture.md §6).
//
// Implemented here (DB + validation, unit-testable): creating a proof request
// (POST /proofs/generate) and reading its status (GET /proofs/:id/status).
//
// Flagged / NOT wired (blocked on the Midnight toolchain + Proof Server — see
// docs/progress.md): actually triggering proof generation on the Proof Server, and
// verifying the resulting proof via midnight-js. Both throw rather than fake a
// result, so nothing can read as "verified" without the real toolchain.

import { MVP_POLICY_ID } from '@/lib/config/policy';
import type { ChainTarget } from '@/lib/db/prisma';
import { CredentialStatus, prisma, ProofStatus } from '@/lib/db/prisma';

import { isKnownConsentHash, logConsent, UnknownConsentHashError } from './consentService';
import { getCredentialStatus, NotCredentialOwnerError } from './credentialService';

/** policyId is not the single supported MVP policy → API 400 (docs/api-spec.md). */
export class InvalidPolicyError extends Error {}
/** Credential is not ACTIVE (expired/revoked) → API 409 (docs/api-spec.md). */
export class CredentialNotActiveError extends Error {}
/** No ProofRequest with the given id → API 404. */
export class ProofRequestNotFoundError extends Error {}
/**
 * midnight-js proof verification is not wired yet (Phase 4/5 blocked). Surfaces as
 * an API 500 — never a fabricated pass/fail.
 */
export class MidnightVerificationUnavailableError extends Error {}

export interface CreateProofRequestParams {
  credentialId: string;
  /** Authenticated session wallet — must own the credential. */
  ownerWallet: string;
  targetChain: ChainTarget;
  policyId: string;
  /** Hash of the exact versioned consent text shown to the user. */
  consentHash: string;
}

export interface CreateProofRequestResult {
  proofRequestId: string;
  status: 'pending';
}

/**
 * Validate + create a proof request, logging consent first (product-spec.md core
 * flow: consent is recorded before any proof is generated).
 *
 * Order of checks maps to the api-spec error codes: ownership/existence
 * (404/403, via getCredentialStatus) → policy + consent inputs (400) → credential
 * state (409). Consent is only persisted once all validation passes, so an
 * invalid/ inactive request writes nothing.
 *
 * Throws: CredentialNotFoundError (→404), NotCredentialOwnerError (→403),
 * InvalidPolicyError / UnknownConsentHashError (→400), CredentialNotActiveError
 * (→409).
 */
export async function createProofRequest(
  params: CreateProofRequestParams,
): Promise<CreateProofRequestResult> {
  const { credentialId, ownerWallet, targetChain, policyId, consentHash } = params;

  // Existence + ownership (throws 404 / 403) and the computed effective status.
  const { status } = await getCredentialStatus(credentialId, ownerWallet);

  if (policyId !== MVP_POLICY_ID) {
    throw new InvalidPolicyError(
      `Unsupported policyId: ${policyId} (MVP supports ${MVP_POLICY_ID} only)`,
    );
  }
  // Guard the consent hash before any write (logConsent re-validates on persist).
  if (!isKnownConsentHash(consentHash)) {
    throw new UnknownConsentHashError(consentHash);
  }
  if (status !== CredentialStatus.ACTIVE) {
    throw new CredentialNotActiveError(
      `Credential ${credentialId} is ${status}, not ACTIVE`,
    );
  }

  await logConsent({ credentialId, consentHash });

  const proofRequest = await prisma.proofRequest.create({
    data: { credentialId, targetChain, policyId, status: ProofStatus.PENDING },
  });

  // Proof generation on the Midnight Proof Server is triggered here in Phase 5.
  // It is intentionally NOT invoked yet (Docker/Proof Server down — see
  // docs/progress.md): the request stays PENDING until real proof generation flips
  // it to READY/FAILED. We never fake READY.

  return { proofRequestId: proofRequest.id, status: 'pending' };
}

export interface ProofStatusView {
  proofRequestId: string;
  status: ProofStatus;
  failureReason: string | null;
}

/**
 * Status lookup for a proof request's owner (GET /proofs/:id/status). Throws
 * ProofRequestNotFoundError (→404) and NotCredentialOwnerError (→403).
 */
export async function getProofStatus(
  proofRequestId: string,
  ownerWallet: string,
): Promise<ProofStatusView> {
  const proofRequest = await prisma.proofRequest.findUnique({
    where: { id: proofRequestId },
    include: { credential: true },
  });
  if (!proofRequest) {
    throw new ProofRequestNotFoundError(proofRequestId);
  }
  if (proofRequest.credential.ownerWallet !== ownerWallet) {
    throw new NotCredentialOwnerError(proofRequestId);
  }

  return {
    proofRequestId: proofRequest.id,
    status: proofRequest.status,
    failureReason: proofRequest.failureReason,
  };
}

/**
 * Verify the generated Midnight proof for a proof request (docs/architecture.md §6
 * step 2). NOT wired — throws MidnightVerificationUnavailableError until the
 * Midnight toolchain + Proof Server are operational. verificationService injects
 * this; unit tests replace it with a mock returning the boolean under test.
 */
export async function verifyProof(proofRequestId: string): Promise<boolean> {
  throw new MidnightVerificationUnavailableError(
    `Cannot verify proof ${proofRequestId}: midnight-js verification is not wired ` +
      `yet (Phase 4/5 blocked on the Midnight toolchain / Proof Server).`,
  );
}
