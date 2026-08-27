import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import { chainToApiString } from '@/lib/chains';
import { env } from '@/lib/config/env';
import {
  getVerificationResult,
  VerificationResultNotFoundError,
} from '@/lib/services/verificationService';

/**
 * GET /api/verify/:id/result — unified verification result regardless of chain.
 * Also the endpoint the demo verifier surface polls.
 *
 * Auth: session cookie for the credential owner, OR a `DEMO_VERIFIER_KEY` header
 * for the demo verifier surface — either is sufficient.
 * Route param: { id: string } (the verification id; awaited in Phase 7).
 * Response 200: VerificationResultResponse.
 * Errors: 403, 404, 425 (too early — verification still pending, poll again).
 * Contract: docs/api-spec.md. Wiring: verificationService (Phase 7).
 *
 * Flags (docs/progress.md): (a) exact header name — the api-spec names a
 * "DEMO_VERIFIER_KEY header"; used verbatim here (HTTP header lookup is
 * case-insensitive). (b) 425 is unreachable in the synchronous MVP: a
 * verificationId only exists once its result row is written, so an unknown id is a
 * 404 (see verificationService.getVerificationResult).
 */
export interface VerificationResultResponse {
  verificationId: string;
  chain: 'soroban' | 'sepolia';
  result: boolean;
  verifiedAt: string; // ISO 8601
}

/** Constant-time string compare (length mismatch → false, no throw). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // Auth path 1: demo-verifier key header (bypasses credential ownership).
  const demoKey = request.headers.get('DEMO_VERIFIER_KEY');
  let demoAuthorized = false;
  if (demoKey) {
    try {
      demoAuthorized = safeEqual(demoKey, env.demoVerifierKey);
    } catch {
      demoAuthorized = false; // demo key not configured
    }
  }

  // Auth path 2: session cookie for the credential owner.
  const session = demoAuthorized ? null : await readSessionClaims();
  if (!demoAuthorized && !session) {
    return apiError(401, 'UNAUTHENTICATED', 'A valid session or demo verifier key is required.');
  }

  try {
    const view = await getVerificationResult(id);

    if (!demoAuthorized && session!.walletAddress !== view.ownerWallet) {
      return apiError(403, 'NOT_CREDENTIAL_OWNER', 'You do not own this verification.');
    }

    return NextResponse.json<VerificationResultResponse>({
      verificationId: view.verificationId,
      chain: chainToApiString(view.chain),
      result: view.result,
      verifiedAt: view.verifiedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof VerificationResultNotFoundError) {
      return apiError(404, 'VERIFICATION_NOT_FOUND', 'Verification result not found.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
