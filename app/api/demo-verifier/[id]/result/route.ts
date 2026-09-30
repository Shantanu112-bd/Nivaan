import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { chainToApiString } from '@/lib/chains';
import { env } from '@/lib/config/env';
import {
  getVerificationResult,
  VerificationResultNotFoundError,
} from '@/lib/services/verificationService';

/**
 * GET /api/demo-verifier/:id/result — same-origin, server-side proxy the
 * demo-verifier surface polls (docs/api-spec.md; docs/frontend-wiring-spec.md §4.6).
 *
 * Why this exists: the sibling GET /api/verify/:id/result authorizes the demo
 * verifier via a `DEMO_VERIFIER_KEY` request header. Having the browser send that
 * header would put the secret in the client bundle. Instead, the demo-verifier
 * page polls THIS keyless route; the route runs server-side, confirms
 * `DEMO_VERIFIER_KEY` is provisioned in its OWN environment, and reads the result
 * by calling verificationService.getVerificationResult DIRECTLY (no self-HTTP,
 * so no key is transmitted anywhere). The secret never reaches the browser.
 *
 * Auth: none from the client. The presence of `DEMO_VERIFIER_KEY` in server env is
 * what enables this demo-verifier capability (and is the ownership-bypass this
 * route legitimately exercises — getVerificationResult performs no per-user check).
 *
 * Route param: { id: string } — the verification id.
 * Response 200: VerificationResultResponse (identical shape to the sibling route).
 * Errors: 404 unknown id; 425 documented (too early) — unreachable in the
 * synchronous MVP, exactly as for the authenticated endpoint: a verificationId
 * only exists once its result row is written, so an unknown id is a 404.
 */
export interface DemoVerifierResultResponse {
  verificationId: string;
  chain: 'soroban' | 'sepolia';
  result: boolean;
  verifiedAt: string; // ISO 8601
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // Server-side enablement gate: this proxy operates as the demo verifier, so the
  // demo-verifier key must be provisioned here. Reading it (never a request header)
  // is what authorizes the ownership-bypass below. The value is not transmitted.
  try {
    void env.demoVerifierKey;
  } catch {
    // DEMO_VERIFIER_KEY not configured → the demo-verifier capability is disabled.
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }

  try {
    const view = await getVerificationResult(id);

    return NextResponse.json<DemoVerifierResultResponse>({
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
