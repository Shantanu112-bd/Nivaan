import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import { NotCredentialOwnerError } from '@/lib/services/credentialService';
import { ProofRequestNotFoundError } from '@/lib/services/proofService';
import { ProofNotReadyError, verifyAndAttest } from '@/lib/services/verificationService';

/**
 * POST /api/verify — submit a completed proof for cross-chain verification
 * (backend-attested — see ADR-001).
 *
 * Auth: session cookie, must own the underlying credential.
 * Response 202: SubmitVerificationResponse.
 * Validation: referenced proof must be `ready`.
 * Errors: 409 proof not ready, 500 chain adapter failure.
 * Side effects: backend verifies the proof via `midnight-js`, signs an
 * attestation, calls the relevant chain adapter (lib/chains/soroban.ts or
 * lib/chains/evm.ts) to submit it, and writes to `verification_results`.
 * Contract: docs/api-spec.md. Wiring: verificationService (Phases 6/7).
 */
export interface SubmitVerificationRequest {
  proofRequestId: string;
}

export interface SubmitVerificationResponse {
  verificationId: string;
  status: 'pending';
}

export async function POST(request: Request) {
  const session = await readSessionClaims();
  if (!session) {
    return apiError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  }

  let body: Partial<SubmitVerificationRequest>;
  try {
    body = (await request.json()) as Partial<SubmitVerificationRequest>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const { proofRequestId } = body ?? {};
  if (typeof proofRequestId !== 'string') {
    return apiError(400, 'INVALID_REQUEST', 'proofRequestId is required.');
  }

  try {
    const { verificationId, status } = await verifyAndAttest({
      proofRequestId,
      ownerWallet: session.walletAddress,
    });
    return NextResponse.json<SubmitVerificationResponse>(
      { verificationId, status },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof ProofRequestNotFoundError) {
      return apiError(404, 'PROOF_REQUEST_NOT_FOUND', 'Proof request not found.');
    }
    if (err instanceof NotCredentialOwnerError) {
      return apiError(403, 'NOT_CREDENTIAL_OWNER', 'You do not own this proof request.');
    }
    if (err instanceof ProofNotReadyError) {
      return apiError(409, 'PROOF_NOT_READY', 'Proof is not ready for verification.');
    }
    // Midnight verification / chain-adapter boundaries not wired yet
    // (docs/progress.md): surfaces as 500, never a fabricated verification.
    return apiError(500, 'VERIFICATION_FAILED', 'Verification could not be completed.');
  }
}
