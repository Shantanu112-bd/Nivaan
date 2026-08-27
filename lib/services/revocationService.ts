// revocationService — issuer-controlled revocation.
//
// Revocation is a DEV-ONLY issuer operation authorized by ISSUER_ADMIN_KEY, never
// exposed through a frontend API route (ADR-005; architecture.md §5). The caller
// is an admin script; the backend is authoritative and re-verifies the key here.

import { env } from '@/lib/config/env';
import { prisma, CredentialStatus } from '@/lib/db/prisma';

export class UnauthorizedRevocationError extends Error {}

export interface RevokeCredentialParams {
  credentialId: string;
  /** Must equal ISSUER_ADMIN_KEY. Never logged. */
  adminKey: string;
  reason?: string;
}

/**
 * Revoke a credential: record a RevokedCredential row and flip the stored status
 * to REVOKED, in one transaction. Throws UnauthorizedRevocationError if the admin
 * key does not match. (Effective-status checks still treat a credential with a
 * RevokedCredential row as revoked even if the stored column lagged — see
 * credentialService.deriveEffectiveStatus.)
 */
export async function revokeCredential(params: RevokeCredentialParams) {
  const { credentialId, adminKey, reason } = params;

  // Static dev key comparison is acceptable at MVP scale (docs/security-model.md);
  // there is no remote timing oracle for a CLI-invoked admin script. Never log the key.
  if (adminKey !== env.issuerAdminKey) {
    throw new UnauthorizedRevocationError('Invalid issuer admin key');
  }

  return prisma.$transaction([
    prisma.revokedCredential.create({
      data: { credentialId, reason: reason ?? null },
    }),
    prisma.credential.update({
      where: { id: credentialId },
      data: { status: CredentialStatus.REVOKED },
    }),
  ]);
}

/** True if the credential has a revocation record. Used by verification. */
export async function isRevoked(credentialId: string): Promise<boolean> {
  const count = await prisma.revokedCredential.count({ where: { credentialId } });
  return count > 0;
}
