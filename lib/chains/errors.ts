// Errors for the chain-adapter layer.

/** Base class for any failure originating in a chain adapter. */
export class ChainAdapterError extends Error {}

/**
 * Thrown by an adapter method whose on-chain implementation is not wired yet
 * (Phase 6 — needs the registry contract deployed + the chain client library
 * installed + secp256k1 signing per attestation.ts). Mirrors the API layer's
 * `notImplemented()` philosophy: the adapter conforms to ChainAdapter so callers
 * typecheck, but an unwired path fails loudly instead of fabricating a result.
 */
export class ChainAdapterNotWiredError extends ChainAdapterError {
  constructor(chain: string, operation: string) {
    super(
      `Chain adapter for ${chain} is not wired yet (Phase 6): ${operation}. ` +
        `Deploy the registry contract, install the chain client, and implement ` +
        `signing per lib/chains/attestation.ts before this can succeed.`,
    );
    this.name = 'ChainAdapterNotWiredError';
  }
}
