// Domain constants for the single-issuer, single-credential-type MVP.
//
// Grounded in docs/product-spec.md (India-focused, one credential type, 30-day
// TTL) and the B4 decision recorded in docs/progress.md (one hardcoded policy id
// mapping to the kyc_tier_1 check, living in lib/config). These are backend-
// authoritative values — never accept them from the client.

/** The one compliance tier this MVP issues (docs/product-spec.md, ADR-005). */
export const CREDENTIAL_TIER = 'kyc_tier_1';

/** Only supported jurisdiction for the MVP (docs/product-spec.md: India-focused). */
export const SUPPORTED_JURISDICTION = 'IN';

/** Credential lifetime — 30 days default (docs/product-spec.md MVP scope). */
export const CREDENTIAL_TTL_DAYS = 30;

/**
 * The single supported policy id (B4). `POST /proofs/generate` validates the
 * request's `policyId` against exactly this value; it maps to the kyc_tier_1
 * compliance check. A second policy id is out of MVP scope.
 */
export const MVP_POLICY_ID = 'kyc_tier_1';
