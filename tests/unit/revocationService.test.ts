// Unit tests for revocationService (docs/roadmap.md Phase 3: revocation state
// transition). The DB module and the env module are mocked so no generated Prisma
// client, live DB, or real ISSUER_ADMIN_KEY is required.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    revokedCredential: { create: vi.fn(), count: vi.fn() },
    credential: { update: vi.fn() },
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
  CredentialStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', REVOKED: 'REVOKED' },
}));

vi.mock('@/lib/config/env', () => ({
  env: { issuerAdminKey: 'correct-admin-key' },
}));

import {
  UnauthorizedRevocationError,
  isRevoked,
  revokeCredential,
} from '@/lib/services/revocationService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('revokeCredential', () => {
  it('rejects an invalid admin key without touching the DB', async () => {
    await expect(
      revokeCredential({ credentialId: 'cred_1', adminKey: 'wrong-key' }),
    ).rejects.toBeInstanceOf(UnauthorizedRevocationError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('records revocation and flips status in one transaction with the correct key', async () => {
    prismaMock.revokedCredential.create.mockReturnValue('CREATE_OP');
    prismaMock.credential.update.mockReturnValue('UPDATE_OP');
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    await revokeCredential({ credentialId: 'cred_1', adminKey: 'correct-admin-key', reason: 'test' });

    expect(prismaMock.revokedCredential.create).toHaveBeenCalledWith({
      data: { credentialId: 'cred_1', reason: 'test' },
    });
    expect(prismaMock.credential.update).toHaveBeenCalledWith({
      where: { id: 'cred_1' },
      data: { status: 'REVOKED' },
    });
    // Both operations are handed to a single $transaction call as an array.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(['CREATE_OP', 'UPDATE_OP']);
  });

  it('defaults a missing reason to null', async () => {
    prismaMock.$transaction.mockResolvedValue([{}, {}]);
    await revokeCredential({ credentialId: 'cred_1', adminKey: 'correct-admin-key' });
    expect(prismaMock.revokedCredential.create).toHaveBeenCalledWith({
      data: { credentialId: 'cred_1', reason: null },
    });
  });
});

describe('isRevoked', () => {
  it('returns true when a revocation row exists', async () => {
    prismaMock.revokedCredential.count.mockResolvedValue(1);
    expect(await isRevoked('cred_1')).toBe(true);
  });

  it('returns false when no revocation row exists', async () => {
    prismaMock.revokedCredential.count.mockResolvedValue(0);
    expect(await isRevoked('cred_1')).toBe(false);
  });
});
