import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import { NotCredentialOwnerError } from '@/lib/services/credentialService';
import { getProofStatus, ProofRequestNotFoundError } from '@/lib/services/proofService';

/**
 * GET /api/proofs/:id/status — status of a proof request.
 *
 * Auth: session cookie, must own the underlying credential.
 * Route param: { id: string } (the proof request id; awaited in Phase 7).
 * Response 200: ProofStatusResponse.
 * Errors: 403, 404.
 * Contract: docs/api-spec.md. Wiring: proofService (Phases 5/7).
 */
export type ProofStatus = 'pending' | 'ready' | 'failed';

export interface ProofStatusResponse {
  proofRequestId: string;
  status: ProofStatus;
  failureReason: string | null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await readSessionClaims();
  if (!session) {
    return apiError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  }

  const { id } = await context.params;

  try {
    const { proofRequestId, status, failureReason } = await getProofStatus(
      id,
      session.walletAddress,
    );
    return NextResponse.json<ProofStatusResponse>({
      proofRequestId,
      status: (status as string).toLowerCase() as ProofStatus,
      failureReason: failureReason ?? null,
    });
  } catch (err) {
    if (err instanceof ProofRequestNotFoundError) {
      return apiError(404, 'PROOF_REQUEST_NOT_FOUND', 'Proof request not found.');
    }
    if (err instanceof NotCredentialOwnerError) {
      return apiError(403, 'NOT_CREDENTIAL_OWNER', 'You do not own this proof request.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
