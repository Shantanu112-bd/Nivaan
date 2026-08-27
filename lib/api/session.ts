// Session helper for API route handlers: read + verify the session cookie set by
// POST /auth/verify (docs/architecture.md §10; ADR-004). Server-only.

import { cookies } from 'next/headers';

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionClaims,
} from '@/lib/services/authService';

/**
 * Read and verify the session cookie. Returns the claims, or null when there is no
 * cookie / it is malformed / expired / has a bad signature (verifySessionToken
 * never throws on bad input).
 */
export async function readSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
