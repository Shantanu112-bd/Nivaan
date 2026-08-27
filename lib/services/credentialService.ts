// credentialService — issuance, status lookup, and the effective-status rule.
//
// Phase 3 scope (docs/roadmap.md): service logic wired to the DB, NOT yet to
// Midnight. The compliance circuit's boolean result is an input here (mocked in
// unit tests); Phase 5 replaces its source with the real Minokawa circuit. The
// underlying witness/identity data never reaches the backend (architecture.md §5).

import {
  CREDENTIAL_TIER,
  CREDENTIAL_TTL_DAYS,
  SUPPORTED_JURISDICTION,
} from '@/lib/config/policy';
import { prisma, CredentialStatus } from '@/lib/db/prisma';

export class UnsupportedJurisdictionError extends Error {}
export class CredentialCriteriaNotMetError extends Error {}
export class CredentialNotFoundError extends Error {}
export class NotCredentialOwnerError extends Error {}
/**
 * Minokawa issuance-circuit evaluation is not wired yet (Phase 5 — Midnight
 * toolchain blocked) → API 500. Distinct from CredentialCriteriaNotMetError,
 * which is a *reached* verdict (the circuit ran and criteria were not met → 422).
 */
export class MidnightUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `Midnight is not reachable yet (Phase 5 — blocked toolchain): ${operation}. ` +
        'The Minokawa circuit cannot be evaluated until midnight-js and the Proof ' +
        'Server are wired.',
    );
    this.name = 'MidnightUnavailableError';
  }
}

export interface IssueCredentialParams {
  /** Wallet-derived DID (from the authenticated session). Unique per credential. */
  did: string;
  /** Public chain address of the owner (session wallet). Not PII (data-model.md). */
  ownerWallet: string;
  /** Jurisdiction claimed by the credential — "IN" for MVP. */
  jurisdiction: string;
  /**
   * Whether the compliance circuit approved issuance (KYC tier + jurisdiction
   * boolean). In Phase 3 this is supplied/mocked; in Phase 5 it comes from the
   * Minokawa circuit's disclosed boolean.
   */
  circuitApproved: boolean;
}

/** Add whole days to a date in UTC, without mutating the input. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Effective status must be COMPUTED, never read blindly from the stored column
 * (docs/data-model.md note; docs/security-model.md): a credential stored ACTIVE
 * whose TTL has passed is EXPIRED, and a revoked credential is REVOKED regardless
 * of the stored value. `now` is a parameter so this is deterministically testable.
 */
export function deriveEffectiveStatus(
  credential: { status: CredentialStatus; expiresAt: Date },
  isRevoked: boolean,
  now: Date,
): CredentialStatus {
  if (isRevoked || credential.status === CredentialStatus.REVOKED) {
    return CredentialStatus.REVOKED;
  }
  if (credential.expiresAt.getTime() <= now.getTime()) {
    return CredentialStatus.EXPIRED;
  }
  return credential.status;
}

/**
 * Issue a credential (DB record only in Phase 3). Throws
 * UnsupportedJurisdictionError (→ API 400) for a non-MVP jurisdiction and
 * CredentialCriteriaNotMetError (→ API 422) when the circuit did not approve.
 */
export async function issueCredential(params: IssueCredentialParams) {
  const { did, ownerWallet, jurisdiction, circuitApproved } = params;

  if (jurisdiction !== SUPPORTED_JURISDICTION) {
    throw new UnsupportedJurisdictionError(
      `Unsupported jurisdiction: ${jurisdiction} (MVP supports ${SUPPORTED_JURISDICTION} only)`,
    );
  }
  if (!circuitApproved) {
    throw new CredentialCriteriaNotMetError(
      'Compliance circuit did not approve issuance',
    );
  }

  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, CREDENTIAL_TTL_DAYS);

  return prisma.credential.create({
    data: {
      did,
      ownerWallet,
      jurisdiction,
      tier: CREDENTIAL_TIER,
      status: CredentialStatus.ACTIVE,
      issuedAt,
      expiresAt,
    },
  });
}

/**
 * Evaluate the Minokawa compliance circuit over the witness output the client
 * submits at issuance, returning the disclosed boolean (KYC tier + jurisdiction).
 *
 * FLAG (docs/progress.md): this crosses the Midnight boundary (midnight-js + Proof
 * Server), which is blocked. It THROWS rather than fabricating approval — issuance
 * cannot honestly complete without a real circuit verdict. The `circuitProofInput`
 * shape is defined by the deployed Minokawa contract (confirm before wiring;
 * docs/api-spec.md POST /credentials/issue).
 */
export async function evaluateIssuanceCircuit(
  _circuitProofInput: Record<string, unknown>,
): Promise<boolean> {
  throw new MidnightUnavailableError('evaluateIssuanceCircuit');
}

/**
 * Status lookup for a credential's owner. Throws CredentialNotFoundError (→ 404)
 * and NotCredentialOwnerError (→ 403). Returns the COMPUTED effective status.
 */
export async function getCredentialStatus(credentialId: string, ownerWallet: string) {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { revocation: true },
  });
  if (!credential) {
    throw new CredentialNotFoundError(credentialId);
  }
  if (credential.ownerWallet !== ownerWallet) {
    throw new NotCredentialOwnerError(credentialId);
  }

  const status = deriveEffectiveStatus(
    credential,
    credential.revocation !== null,
    new Date(),
  );

  return { credentialId: credential.id, status, expiresAt: credential.expiresAt };
}
