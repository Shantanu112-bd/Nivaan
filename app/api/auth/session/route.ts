import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';

/**
 * GET /api/auth/session — return the current session's identity, or 401 if there
 * is no valid session.
 *
 * Auth: session cookie. Request: none.
 * Lets the frontend reflect real login state across page loads without reading the
 * HttpOnly session cookie directly (client JS cannot). readSessionClaims verifies
 * the cookie and never throws on a missing / malformed / expired / bad-signature
 * cookie — any of those is simply "no session" → 401.
 * Response 200: SessionResponse. Errors: 401 no valid session.
 * Side effects: none.
 * Contract: docs/api-spec.md §Auth. Wiring: authService.verifySessionToken.
 */
export interface SessionResponse {
  did: string;
  expiresAt: string; // ISO 8601
}

export async function GET() {
  try {
    const claims = await readSessionClaims();
    if (!claims) {
      return apiError(401, 'UNAUTHENTICATED', 'A valid session is required.');
    }
    return NextResponse.json<SessionResponse>({
      did: claims.did,
      expiresAt: claims.expiresAt.toISOString(),
    });
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
