// Unit tests for consentService (docs/roadmap.md Phase 3: consent logging). The DB
// module is mocked; crypto is real. NOTE: the consent TEXT and hash contract are
// PROVISIONAL and flagged for frontend coordination (see consentService.ts) — these
// tests pin the *mechanism* (deterministic SHA-256, known-hash gating), not final
// copy, so confirming the real text later will not require rewriting them.

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { consentLog: { create: vi.fn() } },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));

import {
  CONSENT_TEXT_VERSIONS,
  UnknownConsentHashError,
  hashConsentText,
  isKnownConsentHash,
  logConsent,
} from '@/lib/services/consentService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hashConsentText', () => {
  it('is a deterministic SHA-256 hex digest of the UTF-8 text', () => {
    const expected = createHash('sha256').update('hello', 'utf8').digest('hex');
    expect(hashConsentText('hello')).toBe(expected);
    expect(hashConsentText('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isKnownConsentHash', () => {
  it('accepts the hash of a known consent-text version', () => {
    expect(isKnownConsentHash(hashConsentText(CONSENT_TEXT_VERSIONS.v1))).toBe(true);
  });

  it('rejects an unknown hash', () => {
    expect(isKnownConsentHash('deadbeef')).toBe(false);
  });
});

describe('logConsent', () => {
  it('throws on an unknown consent hash without writing', async () => {
    await expect(
      logConsent({ credentialId: 'cred_1', consentHash: 'deadbeef' }),
    ).rejects.toBeInstanceOf(UnknownConsentHashError);
    expect(prismaMock.consentLog.create).not.toHaveBeenCalled();
  });

  it('records consent for a known hash', async () => {
    const knownHash = hashConsentText(CONSENT_TEXT_VERSIONS.v1);
    prismaMock.consentLog.create.mockResolvedValue({ id: 'consent_1' });

    await logConsent({ credentialId: 'cred_1', consentHash: knownHash });

    expect(prismaMock.consentLog.create).toHaveBeenCalledWith({
      data: { credentialId: 'cred_1', consentHash: knownHash },
    });
  });
});
