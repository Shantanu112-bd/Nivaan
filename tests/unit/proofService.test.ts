// Unit tests for proofService (docs/roadmap.md Phase 5/7: proof-request lifecycle
// + the Midnight verify seam). The DB module is mocked; the sibling services
// (credentialService.getCredentialStatus, consentService.logConsent) run for real
// against the same prisma mock, and node:crypto is real — so validation ordering
// and consent gating are exercised as they run in production. The Midnight verify
// boundary is asserted to THROW, never to fabricate a pass/fail.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    credential: { findUnique: vi.fn() },
    consentLog: { create: vi.fn() },
    proofRequest: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
  CredentialStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', REVOKED: 'REVOKED' },
  ChainTarget: { SOROBAN: 'SOROBAN', SEPOLIA: 'SEPOLIA' },
  ProofStatus: { PENDING: 'PENDING', READY: 'READY', FAILED: 'FAILED' },
}));

import { MVP_POLICY_ID } from '@/lib/config/policy';
import { ChainTarget, ProofStatus } from '@/lib/db/prisma';
import { CONSENT_TEXT_VERSIONS, hashConsentText, UnknownConsentHashError } from '@/lib/services/consentService';
import { CredentialNotFoundError, NotCredentialOwnerError } from '@/lib/services/credentialService';
import {
  CredentialNotActiveError,
  createProofRequest,
  getProofStatus,
  InvalidPolicyError,
  MidnightVerificationUnavailableError,
  ProofRequestNotFoundError,
  verifyProof,
} from '@/lib/services/proofService';

const KNOWN_HASH = hashConsentText(CONSENT_TEXT_VERSIONS.v1);
const FUTURE = new Date('2999-01-01T00:00:00Z');
const PAST = new Date('2000-01-01T00:00:00Z');

/** Mock an owned, ACTIVE, unexpired, unrevoked credential for findUnique. */
function activeCredential() {
  return {
    id: 'cred_1',
    ownerWallet: '0xowner',
    status: 'ACTIVE',
    expiresAt: FUTURE,
    revocation: null,
  };
}

const baseParams = {
  credentialId: 'cred_1',
  ownerWallet: '0xowner',
  targetChain: ChainTarget.SEPOLIA,
  policyId: MVP_POLICY_ID,
  consentHash: KNOWN_HASH,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProofRequest', () => {
  it('creates a PENDING proof request (logging consent first) on the happy path', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(activeCredential());
    prismaMock.consentLog.create.mockResolvedValue({ id: 'consent_1' });
    prismaMock.proofRequest.create.mockResolvedValue({ id: 'pr_1' });

    const res = await createProofRequest(baseParams);

    expect(res).toEqual({ proofRequestId: 'pr_1', status: 'pending' });
    // Consent is persisted before the proof request is written.
    expect(prismaMock.consentLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.proofRequest.create).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.proofRequest.create.mock.calls[0][0];
    expect(data.status).toBe(ProofStatus.PENDING);
    expect(data.targetChain).toBe('SEPOLIA');
    expect(data.policyId).toBe(MVP_POLICY_ID);
    expect(data.credentialId).toBe('cred_1');
  });

  it('propagates CredentialNotFoundError (→404) for an unknown credential', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(null);
    await expect(createProofRequest(baseParams)).rejects.toBeInstanceOf(CredentialNotFoundError);
    expect(prismaMock.proofRequest.create).not.toHaveBeenCalled();
  });

  it('propagates NotCredentialOwnerError (→403) for a non-owner', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(activeCredential());
    await expect(
      createProofRequest({ ...baseParams, ownerWallet: '0xsomeone-else' }),
    ).rejects.toBeInstanceOf(NotCredentialOwnerError);
    expect(prismaMock.proofRequest.create).not.toHaveBeenCalled();
  });

  it('rejects an unsupported policyId (→400) without writing', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(activeCredential());
    await expect(
      createProofRequest({ ...baseParams, policyId: 'not_the_mvp_policy' }),
    ).rejects.toBeInstanceOf(InvalidPolicyError);
    expect(prismaMock.consentLog.create).not.toHaveBeenCalled();
    expect(prismaMock.proofRequest.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown consent hash (→400) without writing', async () => {
    prismaMock.credential.findUnique.mockResolvedValue(activeCredential());
    await expect(
      createProofRequest({ ...baseParams, consentHash: 'deadbeef' }),
    ).rejects.toBeInstanceOf(UnknownConsentHashError);
    expect(prismaMock.consentLog.create).not.toHaveBeenCalled();
    expect(prismaMock.proofRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a non-ACTIVE credential (→409) without logging consent or writing', async () => {
    prismaMock.credential.findUnique.mockResolvedValue({ ...activeCredential(), expiresAt: PAST });
    await expect(createProofRequest(baseParams)).rejects.toBeInstanceOf(CredentialNotActiveError);
    // Active check precedes consent persistence — nothing is written.
    expect(prismaMock.consentLog.create).not.toHaveBeenCalled();
    expect(prismaMock.proofRequest.create).not.toHaveBeenCalled();
  });
});

describe('getProofStatus', () => {
  it('throws ProofRequestNotFoundError (→404) for an unknown id', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue(null);
    await expect(getProofStatus('missing', '0xowner')).rejects.toBeInstanceOf(
      ProofRequestNotFoundError,
    );
  });

  it('throws NotCredentialOwnerError (→403) for a non-owner', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue({
      id: 'pr_1',
      status: 'PENDING',
      failureReason: null,
      credential: { ownerWallet: '0xowner' },
    });
    await expect(getProofStatus('pr_1', '0xsomeone-else')).rejects.toBeInstanceOf(
      NotCredentialOwnerError,
    );
  });

  it('returns the status view for the owner', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue({
      id: 'pr_1',
      status: 'PENDING',
      failureReason: null,
      credential: { ownerWallet: '0xowner' },
    });
    const res = await getProofStatus('pr_1', '0xowner');
    expect(res).toEqual({ proofRequestId: 'pr_1', status: ProofStatus.PENDING, failureReason: null });
  });
});

describe('verifyProof', () => {
  it('throws (never fabricates) until the Midnight toolchain is wired', async () => {
    await expect(verifyProof('pr_1')).rejects.toBeInstanceOf(MidnightVerificationUnavailableError);
  });
});
