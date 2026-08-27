// Unit tests for verificationService (docs/roadmap.md Phase 7: POST /verify +
// GET /verify/:id/result orchestration, ADR-001 backend attestation). The DB
// module is mocked; the two external boundaries (Midnight proof verify, chain
// adapter) are INJECTED so ownership, idempotency, and the attestation write are
// exercised without the Midnight toolchain or a deployed registry.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    proofRequest: { findUnique: vi.fn() },
    verificationResult: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
  ChainTarget: { SOROBAN: 'SOROBAN', SEPOLIA: 'SEPOLIA' },
  ProofStatus: { PENDING: 'PENDING', READY: 'READY', FAILED: 'FAILED' },
}));

import { ChainTarget } from '@/lib/db/prisma';
import type { AttestationFields } from '@/lib/chains';
import { NotCredentialOwnerError } from '@/lib/services/credentialService';
import { ProofRequestNotFoundError } from '@/lib/services/proofService';
import {
  getVerificationResult,
  ProofNotReadyError,
  verifyAndAttest,
  VerificationResultNotFoundError,
} from '@/lib/services/verificationService';

/** A READY, owned proof request with no existing verification result. */
function readyProofRequest() {
  return {
    id: 'pr_1',
    credentialId: 'cred_1',
    targetChain: 'SEPOLIA',
    status: 'READY',
    verificationResult: null,
    credential: { ownerWallet: '0xowner' },
  };
}

/** An adapter mock that records the fields it was asked to attest. */
function adapterMock() {
  return {
    chain: ChainTarget.SEPOLIA,
    submitAttestation: vi.fn(async (_fields: AttestationFields) => ({
      txHash: '0xtx',
      signature: '0xsig',
    })),
    getResult: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyAndAttest', () => {
  it('throws ProofRequestNotFoundError (→404) for an unknown proof request', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue(null);
    const deps = { verifyProof: vi.fn(), resolveAdapter: vi.fn() };
    await expect(
      verifyAndAttest({ proofRequestId: 'missing', ownerWallet: '0xowner' }, deps),
    ).rejects.toBeInstanceOf(ProofRequestNotFoundError);
    expect(deps.verifyProof).not.toHaveBeenCalled();
  });

  it('throws NotCredentialOwnerError (→403) when the caller does not own the credential', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue(readyProofRequest());
    const deps = { verifyProof: vi.fn(), resolveAdapter: vi.fn() };
    await expect(
      verifyAndAttest({ proofRequestId: 'pr_1', ownerWallet: '0xsomeone-else' }, deps),
    ).rejects.toBeInstanceOf(NotCredentialOwnerError);
    expect(deps.verifyProof).not.toHaveBeenCalled();
  });

  it('is idempotent: returns the existing result without re-verifying or re-submitting', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue({
      ...readyProofRequest(),
      verificationResult: { id: 'vr_existing' },
    });
    const deps = { verifyProof: vi.fn(), resolveAdapter: vi.fn() };

    const res = await verifyAndAttest({ proofRequestId: 'pr_1', ownerWallet: '0xowner' }, deps);

    expect(res).toEqual({ verificationId: 'vr_existing', status: 'pending' });
    expect(deps.verifyProof).not.toHaveBeenCalled();
    expect(deps.resolveAdapter).not.toHaveBeenCalled();
    expect(prismaMock.verificationResult.create).not.toHaveBeenCalled();
  });

  it('throws ProofNotReadyError (→409) when the proof is not READY', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue({
      ...readyProofRequest(),
      status: 'PENDING',
    });
    const deps = { verifyProof: vi.fn(), resolveAdapter: vi.fn() };
    await expect(
      verifyAndAttest({ proofRequestId: 'pr_1', ownerWallet: '0xowner' }, deps),
    ).rejects.toBeInstanceOf(ProofNotReadyError);
    expect(deps.verifyProof).not.toHaveBeenCalled();
  });

  it('verifies, submits the attestation, and persists the returned signature', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue(readyProofRequest());
    prismaMock.verificationResult.create.mockResolvedValue({ id: 'vr_new' });
    const adapter = adapterMock();
    const deps = {
      verifyProof: vi.fn(async () => true),
      resolveAdapter: vi.fn(() => adapter),
    };

    const res = await verifyAndAttest({ proofRequestId: 'pr_1', ownerWallet: '0xowner' }, deps);

    expect(res).toEqual({ verificationId: 'vr_new', status: 'pending' });
    expect(deps.resolveAdapter).toHaveBeenCalledWith('SEPOLIA');

    // The adapter is asked to attest the verified result for this credential/chain.
    expect(adapter.submitAttestation).toHaveBeenCalledTimes(1);
    const fields = adapter.submitAttestation.mock.calls[0][0];
    expect(fields.credentialId).toBe('cred_1');
    expect(fields.chain).toBe('SEPOLIA');
    expect(fields.result).toBe(true);
    expect(typeof fields.timestamp).toBe('number');

    // The signature the adapter returned is what gets persisted (audit trail).
    expect(prismaMock.verificationResult.create).toHaveBeenCalledWith({
      data: {
        proofRequestId: 'pr_1',
        chain: 'SEPOLIA',
        result: true,
        attestationSig: '0xsig',
      },
    });
  });

  it('does not write a result when the injected verifier throws (unwired Midnight)', async () => {
    prismaMock.proofRequest.findUnique.mockResolvedValue(readyProofRequest());
    const deps = {
      verifyProof: vi.fn(async () => {
        throw new Error('midnight unavailable');
      }),
      resolveAdapter: vi.fn(() => adapterMock()),
    };
    await expect(
      verifyAndAttest({ proofRequestId: 'pr_1', ownerWallet: '0xowner' }, deps),
    ).rejects.toThrow('midnight unavailable');
    expect(prismaMock.verificationResult.create).not.toHaveBeenCalled();
  });
});

describe('getVerificationResult', () => {
  it('throws VerificationResultNotFoundError (→404) for an unknown id', async () => {
    prismaMock.verificationResult.findUnique.mockResolvedValue(null);
    await expect(getVerificationResult('missing')).rejects.toBeInstanceOf(
      VerificationResultNotFoundError,
    );
  });

  it('returns the result view including the owner wallet (route authorizes on it)', async () => {
    const verifiedAt = new Date('2026-08-26T00:00:00Z');
    prismaMock.verificationResult.findUnique.mockResolvedValue({
      id: 'vr_1',
      chain: 'SOROBAN',
      result: true,
      verifiedAt,
      proofRequest: { credential: { ownerWallet: '0xowner' } },
    });

    const res = await getVerificationResult('vr_1');

    expect(res).toEqual({
      verificationId: 'vr_1',
      chain: 'SOROBAN',
      result: true,
      verifiedAt,
      ownerWallet: '0xowner',
    });
  });
});
