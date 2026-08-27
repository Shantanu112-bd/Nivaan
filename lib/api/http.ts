import { NextResponse } from 'next/server';

/**
 * Shared HTTP helpers for the API route layer.
 *
 * Contract reference: docs/api-spec.md ("Conventions across all endpoints").
 */

/** Every error response body across the API is `{ error, code }`. */
export interface ApiError {
  error: string;
  code: string;
}

/**
 * Standard Phase 1 stub response.
 *
 * The route exists and its request/response types are declared, but no service
 * logic is wired yet (that happens in Phase 7 — docs/roadmap.md). It returns
 * `501` with the standard error envelope and an `X-Nivaan-Stub` marker header,
 * rather than a fabricated success body, so an unwired endpoint can never be
 * mistaken for a working one.
 */
export function notImplemented(): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: 'Not implemented yet (Phase 1 stub).', code: 'NOT_IMPLEMENTED' },
    { status: 501, headers: { 'X-Nivaan-Stub': 'true' } },
  );
}

/** Build a standard `{ error, code }` error response with the given status. */
export function apiError(
  status: number,
  code: string,
  error: string,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>({ error, code }, { status });
}
