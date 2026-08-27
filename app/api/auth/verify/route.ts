import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import {
  InvalidSignatureError,
  NonceAlreadyUsedError,
  NonceExpiredError,
  NonceUnknownError,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifyAndCreateSession,
  WalletSignatureVerificationUnavailableError,
} from '@/lib/services/authService';

/**
 * POST /api/auth/verify — verify a signed nonce and establish a session.
 *
 * Auth: none (this establishes it). On success sets an HttpOnly, Secure,
 * SameSite=Strict session cookie.
 * Response 200: VerifyResponse.
 * Validation: nonce must exist, be unexpired and unused; signature must verify
 * against `walletAddress`.
 * Errors: 400 invalid signature, 401 nonce expired/unknown, 409 nonce already used.
 * Side effects: marks nonce used, creates session.
 * Contract: docs/api-spec.md. Wiring: authService (Phase 7).
 */
export interface VerifyRequest {
  walletAddress: string;
  nonce: string;
  signature: string;
}

export interface VerifyResponse {
  did: string;
  sessionExpiresAt: string; // ISO 8601
}

export async function POST(request: Request) {
  let body: Partial<VerifyRequest>;
  try {
    body = (await request.json()) as Partial<VerifyRequest>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const { walletAddress, nonce, signature } = body ?? {};
  if (
    typeof walletAddress !== 'string' ||
    typeof nonce !== 'string' ||
    typeof signature !== 'string'
  ) {
    return apiError(
      400,
      'INVALID_REQUEST',
      'walletAddress, nonce, and signature are required.',
    );
  }

  try {
    const { did, sessionExpiresAt, sessionToken } = await verifyAndCreateSession({
      walletAddress,
      nonce,
      signature,
    });

    const response = NextResponse.json<VerifyResponse>({
      did,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    });
    // Session cookie: HttpOnly + Secure + SameSite=Strict, ~24h (security-model.md).
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return apiError(400, 'INVALID_SIGNATURE', 'Signature does not verify for walletAddress.');
    }
    if (err instanceof NonceUnknownError) {
      return apiError(401, 'NONCE_UNKNOWN', 'Unknown nonce.');
    }
    if (err instanceof NonceExpiredError) {
      return apiError(401, 'NONCE_EXPIRED', 'Nonce has expired.');
    }
    if (err instanceof NonceAlreadyUsedError) {
      return apiError(409, 'NONCE_ALREADY_USED', 'Nonce has already been used.');
    }
    if (err instanceof WalletSignatureVerificationUnavailableError) {
      // Flag 2 (docs/progress.md): Midnight wallet-signature verification not wired.
      return apiError(
        500,
        'SIGNATURE_VERIFICATION_UNAVAILABLE',
        'Wallet signature verification is not available yet.',
      );
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
