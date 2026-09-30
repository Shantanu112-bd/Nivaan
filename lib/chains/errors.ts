// Errors for the chain-adapter layer.

/** Base class for any failure originating in a chain adapter. */
export class ChainAdapterError extends Error {}

/**
 * Thrown by an adapter method whose on-chain implementation is not wired yet:
 * no signing/broadcast code exists. Retained for a genuinely-unwired future
 * boundary (e.g. a newly-added chain). The Soroban/Sepolia adapters are now WIRED
 * — when they cannot act it is because deployment config is absent, which is
 * `ChainAdapterNotConfiguredError` (below), a distinct condition.
 */
export class ChainAdapterNotWiredError extends ChainAdapterError {
  constructor(chain: string, operation: string) {
    super(
      `Chain adapter for ${chain} is not wired yet: ${operation}. ` +
        `Implement signing per lib/chains/attestation.ts before this can succeed.`,
    );
    this.name = 'ChainAdapterNotWiredError';
  }
}

/**
 * Thrown when an adapter's code IS written but the deployment configuration it
 * needs is absent — a deployed registry address, a funded broadcast key, and/or
 * an RPC URL (docs/architecture.md §12: "addresses stored in environment
 * variables"). Distinct from ChainAdapterNotWiredError: nothing is missing in the
 * code; the operator has not provisioned the testnet resources yet.
 *
 * For a `submitAttestation`, the backend signature has ALREADY been computed by
 * the time this is thrown — only the on-chain broadcast is gated — so this never
 * fabricates a result: it reports precisely which variables to set. `missing`
 * carries variable NAMES only, never any value (docs/security-model.md).
 */
export class ChainAdapterNotConfiguredError extends ChainAdapterError {
  readonly missing: readonly string[];

  constructor(chain: string, operation: string, missing: readonly string[]) {
    super(
      `Chain adapter for ${chain} is not configured: ${operation} requires ` +
        `${missing.join(', ')}. Deploy the registry, fund the broadcast key, and ` +
        `set these environment variables (docs/architecture.md §12).`,
    );
    this.name = 'ChainAdapterNotConfiguredError';
    this.missing = missing;
  }
}

/**
 * Thrown when the configured attestation signing key (BACKEND_ATTESTATION_SIGNING_KEY,
 * the ADR-001 root of trust) is malformed. The key material is NEVER included in
 * the message — only the shape/reason — because this is the highest-priority
 * secret in the system (docs/security-model.md).
 */
export class InvalidSigningKeyError extends ChainAdapterError {
  constructor(reason: string) {
    super(
      `Attestation signing key is malformed: ${reason}. ` +
        `(The key value is never logged.)`,
    );
    this.name = 'InvalidSigningKeyError';
  }
}

/**
 * Thrown before submission when an attestation's timestamp is outside the
 * freshness window (ATTESTATION_MAX_AGE_SECONDS, past OR future). Mirrors the
 * `StaleTimestamp` guard both registry contracts enforce on-chain
 * (docs/security-model.md replay protection) so a stale attestation is rejected
 * backend-side too, before a doomed submission is ever attempted.
 */
export class StaleAttestationError extends ChainAdapterError {
  constructor(chain: string, timestamp: number, now: number) {
    super(
      `Attestation timestamp ${timestamp} is outside the freshness window for ` +
        `${chain} (now=${now}). The registry contract would reject it as stale.`,
    );
    this.name = 'StaleAttestationError';
  }
}
