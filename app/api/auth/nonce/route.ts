import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { issueNonce } from '@/lib/services/authService';

/**
 * GET /api/auth/nonce — issue a one-time nonce for wallet-signature login.
 *
 * Auth: none. Request: none.
 * Response 200: NonceResponse. Errors: 500 on nonce-generation failure.
 * Side effects: writes a row to `auth_nonces`.
 * Contract: docs/api-spec.md. Wiring: authService (Phase 7).
 */
export interface NonceResponse {
  nonce: string;
  expiresAt: string; // ISO 8601
}

export async function GET() {
  try {
    const { nonce, expiresAt } = await issueNonce();
    return NextResponse.json<NonceResponse>({
      nonce,
      expiresAt: expiresAt.toISOString(),
    });
  } catch {
    return apiError(500, 'NONCE_GENERATION_FAILED', 'Failed to generate a login nonce.');
  }
}
