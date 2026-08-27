// consentService — validate and record explicit user consent.
//
// Consent MUST be logged before any proof is generated (docs/product-spec.md core
// flow), captured on POST /proofs/generate (B2). Only a hash of the exact consent
// text is stored — never the user's data (docs/data-model.md ConsentLog).
//
// ⚠️ COORDINATION FLAG (recorded in docs/progress.md; master-prompt Section 5):
// The exact consent TEXT and the hashing/canonicalization that derives
// `consentHash` form a SHARED contract with the frontend — Antigravity displays
// the text and computes the hash sent to the API; this backend validates it.
// data-model.md says the text is "static and versioned in code" but specifies
// neither the copy nor the algorithm. PROVISIONAL decision, to confirm with
// Antigravity: SHA-256 over the exact UTF-8 text bytes, hex-encoded. The text
// below is a PLACEHOLDER pending product sign-off — not final copy.

import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';

export class UnknownConsentHashError extends Error {}

/** Versioned consent texts. PROVISIONAL copy — see the coordination flag above. */
export const CONSENT_TEXT_VERSIONS: Record<string, string> = {
  v1:
    'I consent to NIVAAN generating a zero-knowledge proof of my KYC compliance ' +
    'status for the selected chain. No identity documents or personal data are ' +
    'shared; only a pass/fail result is disclosed.',
};

/** SHA-256 hex of the exact UTF-8 text bytes (provisional canonicalization). */
export function hashConsentText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The set of accepted consent hashes (one per known text version). */
export function knownConsentHashes(): Set<string> {
  return new Set(Object.values(CONSENT_TEXT_VERSIONS).map(hashConsentText));
}

export function isKnownConsentHash(consentHash: string): boolean {
  return knownConsentHashes().has(consentHash);
}

/**
 * Validate the consent hash against a known version and record it. Throws
 * UnknownConsentHashError (→ API 400) if it matches no known consent-text version.
 */
export async function logConsent(params: { credentialId: string; consentHash: string }) {
  const { credentialId, consentHash } = params;

  if (!isKnownConsentHash(consentHash)) {
    throw new UnknownConsentHashError(
      'consentHash does not match a known consent-text version',
    );
  }

  return prisma.consentLog.create({
    data: { credentialId, consentHash },
  });
}
