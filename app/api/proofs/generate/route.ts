import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api/http';
import { readSessionClaims } from '@/lib/api/session';
import { parseChainTarget } from '@/lib/chains';
import {
  CredentialNotFoundError,
  NotCredentialOwnerError,
} from '@/lib/services/credentialService';
import { UnknownConsentHashError } from '@/lib/services/consentService';
import {
  CredentialNotActiveError,
  createProofRequest,
  InvalidPolicyError,
} from '@/lib/services/proofService';

/**
 * POST /api/proofs/generate — initiate ZK proof generation for a credential
 * against a target policy and chain.
 *
 * Auth: session cookie, must own the credential.
 * Response 202: GenerateProofResponse.
 * Validation: credential must be `active` (not expired/revoked); `targetChain`
 * one of the two supported values; `policyId` must equal the single supported
 * MVP policy id (a constant in lib/config, mapping to the `kyc_tier_1` check);
 * `consentHash` must match a known versioned consent-text hash.
 * Errors: 400 invalid chain/policy/consent, 409 credential not active.
 * Side effects: writes a `consent_logs` entry, writes to `proof_requests`,
 * triggers the local Proof Server call.
 * Contract: docs/api-spec.md (blockers B2 + B4).
 * Wiring: consentService + proofService (Phases 3/5/7).
 */
export interface GenerateProofRequest {
  credentialId: string;
  targetChain: 'soroban' | 'sepolia';
  policyId: string;
  consentHash: string;
}

export interface GenerateProofResponse {
  proofRequestId: string;
  status: 'pending';
}

export async function POST(request: Request) {
  const session = await readSessionClaims();
  if (!session) {
    return apiError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  }

  let body: Partial<GenerateProofRequest>;
  try {
    body = (await request.json()) as Partial<GenerateProofRequest>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const { credentialId, targetChain, policyId, consentHash } = body ?? {};
  if (
    typeof credentialId !== 'string' ||
    typeof targetChain !== 'string' ||
    typeof policyId !== 'string' ||
    typeof consentHash !== 'string'
  ) {
    return apiError(
      400,
      'INVALID_REQUEST',
      'credentialId, targetChain, policyId, and consentHash are required.',
    );
  }

  const chain = parseChainTarget(targetChain);
  if (chain === null) {
    return apiError(400, 'INVALID_CHAIN', 'Unsupported targetChain.');
  }

  try {
    const { proofRequestId, status } = await createProofRequest({
      credentialId,
      ownerWallet: session.walletAddress,
      targetChain: chain,
      policyId,
      consentHash,
    });
    return NextResponse.json<GenerateProofResponse>(
      { proofRequestId, status },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof CredentialNotFoundError) {
      return apiError(404, 'CREDENTIAL_NOT_FOUND', 'Credential not found.');
    }
    if (err instanceof NotCredentialOwnerError) {
      return apiError(403, 'NOT_CREDENTIAL_OWNER', 'You do not own this credential.');
    }
    if (err instanceof InvalidPolicyError) {
      return apiError(400, 'INVALID_POLICY', 'Unsupported policyId.');
    }
    if (err instanceof UnknownConsentHashError) {
      return apiError(400, 'UNKNOWN_CONSENT_HASH', 'Unknown consent hash.');
    }
    if (err instanceof CredentialNotActiveError) {
      return apiError(409, 'CREDENTIAL_NOT_ACTIVE', 'Credential is not active.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}
