import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import {
  CredentialCriteriaNotMetError,
  evaluateIssuanceCircuit,
  issueCredential,
  MidnightUnavailableError,
  UnsupportedJurisdictionError,
} from '@/lib/services/credentialService';

/**
 * POST /api/credentials/issue — submit witness-derived proof input and issue a
 * credential.
 *
 * Auth: session cookie.
 * Response 201: IssueCredentialResponse.
 * Validation: circuit proof input well-formed per the Minokawa contract's
 * expected witness shape; jurisdiction a supported value (India only for MVP).
 * Errors: 400 malformed input, 422 circuit evaluation failed (criteria not met),
 * 500 Midnight testnet unreachable.
 * Side effects: writes to `credentials`; calls Minokawa `issueCredential()` on
 * Midnight testnet.
 * Contract: docs/api-spec.md. Wiring: credentialService (Phases 3/5/7).
 *
 * NOTE (docs/progress.md flag): deriving `circuitApproved` requires evaluating the
 * Minokawa circuit on Midnight (blocked toolchain). `evaluateIssuanceCircuit`
 * throws until that boundary is wired, so this endpoint returns 500
 * (MIDNIGHT_UNREACHABLE) rather than fabricating approval. Session-auth and input
 * validation still execute and are exercisable now.
 */
export interface IssueCredentialRequest {
  // The exact witness output shape is defined by the Minokawa circuit interface,
  // not invented here — confirm against the deployed contract before Phase 5.
  circuitProofInput: Record<string, unknown>;
  jurisdiction: string;
}

export interface IssueCredentialResponse {
  credentialId: string;
  did: string;
  status: 'active';
  issuedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
}

export async function POST(request: Request) {
  const session = await readSessionClaims();
  if (!session) {
    return apiError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  }

  let body: Partial<IssueCredentialRequest>;
  try {
    body = (await request.json()) as Partial<IssueCredentialRequest>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const { circuitProofInput, jurisdiction } = body ?? {};
  if (
    typeof jurisdiction !== 'string' ||
    typeof circuitProofInput !== 'object' ||
    circuitProofInput === null ||
    Array.isArray(circuitProofInput)
  ) {
    return apiError(
      400,
      'INVALID_REQUEST',
      'circuitProofInput (object) and jurisdiction (string) are required.',
    );
  }

  try {
    const circuitApproved = await evaluateIssuanceCircuit(circuitProofInput);
    const credential = await issueCredential({
      did: session.did,
      ownerWallet: session.walletAddress,
      jurisdiction,
      circuitApproved,
    });
    return NextResponse.json<IssueCredentialResponse>(
      {
        credentialId: credential.id,
        did: credential.did,
        status: 'active',
        issuedAt: credential.issuedAt.toISOString(),
        expiresAt: credential.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnsupportedJurisdictionError) {
      return apiError(400, 'UNSUPPORTED_JURISDICTION', 'Unsupported jurisdiction.');
    }
    if (err instanceof CredentialCriteriaNotMetError) {
      return apiError(422, 'CRITERIA_NOT_MET', 'Compliance criteria not met.');
    }
    if (err instanceof MidnightUnavailableError) {
      return apiError(500, 'MIDNIGHT_UNREACHABLE', 'Midnight testnet is unreachable.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
