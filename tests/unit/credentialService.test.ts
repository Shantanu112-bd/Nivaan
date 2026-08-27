// Unit tests for credentialService (docs/roadmap.md Phase 3 acceptance:
// issuance / expiry / revocation state transitions using mock circuit output).
//
// The DB module is fully mocked, so these run on Vitest alone — no generated
// Prisma client and no database. The mock supplies the CredentialStatus enum the
// service imports as a runtime value.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    credential: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
  CredentialStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', REVOKED: 'REVOKED' },
}));

import { CredentialStatus } from '@/lib/db/prisma';
import {
  CredentialCriteriaNotMetError,
  CredentialNotFoundError,
  NotCredentialOwnerError,
  UnsupportedJurisdictionError,
  deriveEffectiveStatus,
  getCredentialStatus,
  issueCredential,
} from '@/lib/services/credentialService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveEffectiveStatus', () => {
  const future = new Date('2999-01-01T00:00:00Z');
  const past = new Date('2000-01-01T00:00:00Z');
  const now = new Date('2026-08-26T00:00:00Z');

  it('returns ACTIVE when active, unrevoked, and unexpired', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.ACTIVE, expiresAt: future }, false, now),
    ).toBe(CredentialStatus.ACTIVE);
  });

  it('returns EXPIRED once the TTL has passed', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.ACTIVE, expiresAt: past }, false, now),
    ).toBe(CredentialStatus.EXPIRED);
  });

  it('treats expiresAt == now as expired (boundary)', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.ACTIVE, expiresAt: now }, false, now),
    ).toBe(CredentialStatus.EXPIRED);
  });

  it('returns REVOKED when a revocation row exists, even if unexpired', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.ACTIVE, expiresAt: future }, true, now),
    ).toBe(CredentialStatus.REVOKED);
  });

  it('lets revocation take precedence over expiry', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.ACTIVE, expiresAt: past }, true, now),
    ).toBe(CredentialStatus.REVOKED);
  });

  it('honors a stored REVOKED status without a revocation flag', () => {
    expect(
      deriveEffectiveStatus({ status: CredentialStatus.REVOKED, expiresAt: future }, false, now),
    ).toBe(CredentialStatus.REVOKED);
  });
});

describe('issueCredential', () => {
  const base = { did: 'did:nivaan:abc', ownerWallet: '0xowner', jurisdiction: 'IN' };

  it('rejects an unsupported jurisdiction without writing', async () => {
    await expect(
      issueCredential({ ...base, jurisdiction: 'US', circuitApproved: true }),
    ).rejects.toBeInstanceOf(UnsupportedJurisdictionError);
    expect(prismaMock.credential.create).not.toHaveBeenCalled();
  });

  it('rejects when the circuit did not approve, without writing', async () => {
    await expect(
      issueCredential({ ...base, circuitApproved: false }),
    ).rejects.toBeInstanceOf(CredentialCriteriaNotMetError);
    expect(prismaMock.credential.create).not.toHaveBeenCalled();
  });

  it('creates an ACTIVE, kyc_tier_1 credential with a 30-day TTL', async () => {
    prismaMock.credential.create.mockResolvedValue({ id: 'cred_1' });

    await issueCredential({ ...base, circuitApproved: true });

    expect(prismaMock.credential.create).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.credential.create.mock.calls[0][0];
    expect(data.status).toBe(CredentialStatus.ACTIVE);
    expect(data.tier).toBe('kyc_tier_1');
    expect(data.jurisdiction).toBe('IN');
    expect(data.did).toBe('did:nivaan:abc');
    expect(data.ownerWallet).toBe('0xowner');
    // expiresAt is exactly 30 UTC days after issuedAt (UTC has no DST).
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    expect(data.expiresAt.getTime() - data.issuedAt.getTime()).toBe(THIRTY_DAYS_MS);
  });
});

describe('getCredentialStatus', () => {
  it('throws CredentialNotFoundError when the credential is missing', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(null);
    await expect(getCredentialStatus('missing', '0xowner')).rejects.toBeInstanceOf(
      CredentialNotFoundError,
    );
  });

  it('throws NotCredentialOwnerError for a different owner', async () => {
    prismaMock.credential.findUnique.mockResolvedValue({
      id: 'cred_1',
      ownerWallet: '0xowner',
      status: 'ACTIVE',
      expiresAt: new Date('2999-01-01T00:00:00Z'),
      revocation: null,
    });
    await expect(getCredentialStatus('cred_1', '0xsomeone-else')).rejects.toBeInstanceOf(
      NotCredentialOwnerError,
    );
  });

  it('returns ACTIVE for an owned, unexpired, unrevoked credential', async () => {
    prismaMock.credential.findUnique.mockResolvedValue({
      id: 'cred_1',
      ownerWallet: '0xowner',
      status: 'ACTIVE',
      expiresAt: new Date('2999-01-01T00:00:00Z'),
      revocation: null,
    });
    const res = await getCredentialStatus('cred_1', '0xowner');
    expect(res).toEqual({
      credentialId: 'cred_1',
      status: CredentialStatus.ACTIVE,
      expiresAt: new Date('2999-01-01T00:00:00Z'),
    });
  });

  it('returns REVOKED when a revocation row is present', async () => {
    prismaMock.credential.findUnique.mockResolvedValue({
      id: 'cred_1',
      ownerWallet: '0xowner',
      status: 'ACTIVE',
      expiresAt: new Date('2999-01-01T00:00:00Z'),
      revocation: { credentialId: 'cred_1' },
    });
    const res = await getCredentialStatus('cred_1', '0xowner');
    expect(res.status).toBe(CredentialStatus.REVOKED);
  });

  it('returns EXPIRED when past the TTL', async () => {
    prismaMock.credential.findUnique.mockResolvedValue({
      id: 'cred_1',
      ownerWallet: '0xowner',
      status: 'ACTIVE',
      expiresAt: new Date('2000-01-01T00:00:00Z'),
      revocation: null,
    });
    const res = await getCredentialStatus('cred_1', '0xowner');
    expect(res.status).toBe(CredentialStatus.EXPIRED);
  });
});
