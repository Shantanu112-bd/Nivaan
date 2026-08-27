import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import {
  CredentialNotFoundError,
  getCredentialStatus,
  NotCredentialOwnerError,
} from '@/lib/services/credentialService';

/**
 * GET /api/credentials/:id/status — status of a credential for its owner.
 *
 * Auth: session cookie, must own the credential.
 * Route param: { id: string } (the credential id; awaited in Phase 7).
 * Response 200: CredentialStatusResponse.
 * Errors: 403 not the owner, 404 unknown id.
 * Contract: docs/api-spec.md. Wiring: credentialService (Phases 3/7).
 */
export type CredentialStatus = 'active' | 'expired' | 'revoked';

export interface CredentialStatusResponse {
  credentialId: string;
  status: CredentialStatus;
  expiresAt: string; // ISO 8601
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
    const { credentialId, status, expiresAt } = await getCredentialStatus(
      id,
      session.walletAddress,
    );
    return NextResponse.json<CredentialStatusResponse>({
      credentialId,
      status: (status as string).toLowerCase() as CredentialStatus,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof CredentialNotFoundError) {
      return apiError(404, 'CREDENTIAL_NOT_FOUND', 'Credential not found.');
    }
    if (err instanceof NotCredentialOwnerError) {
      return apiError(403, 'NOT_CREDENTIAL_OWNER', 'You do not own this credential.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
