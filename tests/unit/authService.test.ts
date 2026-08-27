// Unit tests for authService (docs/roadmap.md Phase 7: wallet-signature session
// auth, ADR-004). The DB module and env are mocked; node:crypto is real, so the
// nonce lifecycle and the HMAC session token are exercised end-to-end without a
// database. The Midnight wallet-signature check is an injected dependency — its
// default (unwired) path is asserted to THROW, never to fake a pass.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    authNonce: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/config/env', () => ({
  env: { sessionSecret: 'unit-test-session-secret' },
}));

import {
  deriveDid,
  InvalidSignatureError,
  issueNonce,
  NONCE_TTL_SECONDS,
  NonceAlreadyUsedError,
  NonceExpiredError,
  NonceUnknownError,
  signSessionToken,
  verifyAndCreateSession,
  verifySessionToken,
  WalletSignatureVerificationUnavailableError,
} from '@/lib/services/authService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveDid', () => {
  it('maps a wallet address to the documented did:nivaan default', () => {
    expect(deriveDid('0xabc')).toBe('did:nivaan:0xabc');
  });
});

describe('issueNonce', () => {
  it('creates an UNBOUND 256-bit nonce with a ~5-minute TTL', async () => {
    prismaMock.authNonce.create.mockResolvedValue({});
    const before = Date.now();

    const { nonce, expiresAt } = await issueNonce();

    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(prismaMock.authNonce.create).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.authNonce.create.mock.calls[0][0];
    // Flag 1: nonce is issued unbound (walletAddress = "") and bound at verify.
    expect(data.walletAddress).toBe('');
    expect(data.nonce).toBe(nonce);
    // TTL is ~NONCE_TTL_SECONDS in the future.
    const ttlMs = expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan((NONCE_TTL_SECONDS - 5) * 1000);
    expect(ttlMs).toBeLessThanOrEqual(NONCE_TTL_SECONDS * 1000 + 1000);
  });
});

describe('session token', () => {
  const claims = { sub: '0xabc', did: 'did:nivaan:0xabc' };

  it('round-trips a valid token to its claims', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signSessionToken({ ...claims, exp });
    expect(verifySessionToken(token)).toEqual({
      walletAddress: '0xabc',
      did: 'did:nivaan:0xabc',
    });
  });

  it('rejects a tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signSessionToken({ ...claims, exp });
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 5;
    const token = signSessionToken({ ...claims, exp });
    expect(verifySessionToken(token)).toBeNull();
  });

  it('returns null (never throws) for malformed / missing tokens', () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not-a-token')).toBeNull();
  });
});

describe('verifyAndCreateSession', () => {
  const validNonceRow = () => ({
    nonce: 'n1',
    used: false,
    walletAddress: '',
    expiresAt: new Date(Date.now() + 60_000),
  });
  const passSig = { verifyWalletSignature: vi.fn(async () => true) };

  it('throws NonceUnknownError for an unknown nonce', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue(null);
    await expect(
      verifyAndCreateSession({ walletAddress: '0xabc', nonce: 'n1', signature: 'sig' }, passSig),
    ).rejects.toBeInstanceOf(NonceUnknownError);
    expect(prismaMock.authNonce.update).not.toHaveBeenCalled();
  });

  it('throws NonceAlreadyUsedError for a consumed nonce', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue({ ...validNonceRow(), used: true });
    await expect(
      verifyAndCreateSession({ walletAddress: '0xabc', nonce: 'n1', signature: 'sig' }, passSig),
    ).rejects.toBeInstanceOf(NonceAlreadyUsedError);
  });

  it('throws NonceExpiredError for an expired nonce', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue({
      ...validNonceRow(),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      verifyAndCreateSession({ walletAddress: '0xabc', nonce: 'n1', signature: 'sig' }, passSig),
    ).rejects.toBeInstanceOf(NonceExpiredError);
  });

  it('throws InvalidSignatureError when the signature does not verify', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue(validNonceRow());
    await expect(
      verifyAndCreateSession(
        { walletAddress: '0xabc', nonce: 'n1', signature: 'bad' },
        { verifyWalletSignature: vi.fn(async () => false) },
      ),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
    expect(prismaMock.authNonce.update).not.toHaveBeenCalled();
  });

  it('consumes + binds the nonce and mints a verifiable session on success', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue(validNonceRow());
    prismaMock.authNonce.update.mockResolvedValue({});

    const res = await verifyAndCreateSession(
      { walletAddress: '0xabc', nonce: 'n1', signature: 'good' },
      passSig,
    );

    expect(res.did).toBe('did:nivaan:0xabc');
    // Nonce is marked used AND bound to the verified wallet (flag 1).
    expect(prismaMock.authNonce.update).toHaveBeenCalledWith({
      where: { nonce: 'n1' },
      data: { used: true, walletAddress: '0xabc' },
    });
    // The returned token verifies back to the wallet's claims.
    expect(verifySessionToken(res.sessionToken)).toEqual({
      walletAddress: '0xabc',
      did: 'did:nivaan:0xabc',
    });
  });

  it('propagates WalletSignatureVerificationUnavailableError with default deps (unwired boundary)', async () => {
    prismaMock.authNonce.findUnique.mockResolvedValue(validNonceRow());
    await expect(
      verifyAndCreateSession({ walletAddress: '0xabc', nonce: 'n1', signature: 'sig' }),
    ).rejects.toBeInstanceOf(WalletSignatureVerificationUnavailableError);
    expect(prismaMock.authNonce.update).not.toHaveBeenCalled();
  });
});
