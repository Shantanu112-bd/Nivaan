/**
 * Typed environment access — the single source of truth for env vars.
 *
 * Per docs/architecture.md ("lib/config/env.ts — typed env var access, single
 * source") and docs/security-model.md: backend code MUST read configuration
 * through this module and never touch `process.env` directly, so that every
 * required variable is named in exactly one place and secrets are handled
 * consistently.
 *
 * Design notes:
 * - Access is via lazy getters. Reading `env.databaseUrl` throws only if
 *   DATABASE_URL is missing *at the moment it is used* — importing this module
 *   never throws. That matters during early phases when most testnet/DB
 *   credentials are not yet provisioned: unrelated routes must still load.
 * - Values are NEVER logged or echoed. Error messages contain the variable
 *   NAME only, never its value (several of these are secrets — see
 *   docs/security-model.md, "the one trust assumption to never lose track of").
 * - Server-only. Do not import this from a client component; none of these vars
 *   are NEXT_PUBLIC_-prefixed and must never reach the browser bundle.
 */

/** Every environment variable the MVP requires (docs/roadmap.md). */
export const REQUIRED_ENV_VARS = [
  'MIDNIGHT_TESTNET_RPC',
  'MIDNIGHT_WALLET_SEED',
  'PROOF_SERVER_URL',
  'ANON_AADHAAR_TEST_KEY',
  'SOROBAN_RPC_URL',
  'SOROBAN_TESTNET_SECRET',
  'SOROBAN_REGISTRY_CONTRACT_ID',
  'SEPOLIA_RPC_URL',
  'SEPOLIA_DEPLOYER_KEY',
  'SEPOLIA_REGISTRY_ADDRESS',
  'BACKEND_ATTESTATION_SIGNING_KEY',
  'ISSUER_ADMIN_KEY',
  'DEMO_VERIFIER_KEY',
  'DATABASE_URL',
  'SESSION_SECRET',
] as const;

export type EnvVarName = (typeof REQUIRED_ENV_VARS)[number];

/**
 * Read a required variable, throwing a name-only error if it is absent or blank.
 * The value is never included in the thrown message.
 */
function read(name: EnvVarName): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `[config/env] Required environment variable ${name} is not set. ` +
        `See .env.example and docs/roadmap.md ("Environment variables & external services").`,
    );
  }
  return value;
}

/**
 * The typed configuration surface. Each getter resolves its variable lazily on
 * access, so a missing credential fails loudly at the point of use rather than
 * silently or at import time.
 */
export const env = {
  // --- Midnight (credential issuance + proof generation) ---
  get midnightTestnetRpc(): string {
    return read('MIDNIGHT_TESTNET_RPC');
  },
  get midnightWalletSeed(): string {
    return read('MIDNIGHT_WALLET_SEED');
  },
  get proofServerUrl(): string {
    return read('PROOF_SERVER_URL');
  },

  // --- Anon Aadhaar (Test QR path — ADR-003) ---
  get anonAadhaarTestKey(): string {
    return read('ANON_AADHAAR_TEST_KEY');
  },

  // --- Soroban / Stellar testnet ---
  get sorobanRpcUrl(): string {
    return read('SOROBAN_RPC_URL');
  },
  get sorobanTestnetSecret(): string {
    return read('SOROBAN_TESTNET_SECRET');
  },
  // Deployed Soroban registry contract id (C...), recorded after CLI deploy
  // (docs/architecture.md §12). Needed to broadcast/read attestations on Soroban.
  get sorobanRegistryContractId(): string {
    return read('SOROBAN_REGISTRY_CONTRACT_ID');
  },

  // --- Sepolia / EVM testnet ---
  get sepoliaRpcUrl(): string {
    return read('SEPOLIA_RPC_URL');
  },
  get sepoliaDeployerKey(): string {
    return read('SEPOLIA_DEPLOYER_KEY');
  },
  // Deployed Sepolia registry contract address (0x...), recorded after CLI deploy
  // (docs/architecture.md §12). Needed to broadcast/read attestations on Sepolia.
  get sepoliaRegistryAddress(): string {
    return read('SEPOLIA_REGISTRY_ADDRESS');
  },

  // --- Backend trust root (ADR-001) — HIGHEST-PRIORITY SECRET ---
  // If this leaks, an attacker can forge "verified" results on both registry
  // contracts (docs/security-model.md). Never log it.
  get backendAttestationSigningKey(): string {
    return read('BACKEND_ATTESTATION_SIGNING_KEY');
  },

  // --- Issuer + demo verifier static keys ---
  get issuerAdminKey(): string {
    return read('ISSUER_ADMIN_KEY');
  },
  get demoVerifierKey(): string {
    return read('DEMO_VERIFIER_KEY');
  },

  // --- Database (Postgres — ADR-006) ---
  get databaseUrl(): string {
    return read('DATABASE_URL');
  },

  // --- Session (wallet-signature auth — ADR-004) ---
  get sessionSecret(): string {
    return read('SESSION_SECRET');
  },
} as const;

/**
 * Report which required variables are currently set (non-empty). Returns only
 * booleans keyed by name — never any value — so it is safe to surface in a
 * health/diagnostics response. Useful for confirming provisioning without
 * leaking secrets.
 */
export function presentEnvVars(): Record<EnvVarName, boolean> {
  return Object.fromEntries(
    REQUIRED_ENV_VARS.map((name) => [
      name,
      Boolean(process.env[name] && process.env[name]!.trim() !== ''),
    ]),
  ) as Record<EnvVarName, boolean>;
}

/**
 * Of the given required variables, return those that are absent or blank — without
 * throwing. Used by the chain adapters to build a `ChainAdapterNotConfiguredError`
 * that lists exactly which deployment variables are missing, before touching a
 * throwing getter. Returns NAMES only (never values), so it is safe to surface.
 */
export function missingEnvVars(names: readonly EnvVarName[]): EnvVarName[] {
  return names.filter((name) => !process.env[name] || process.env[name]!.trim() === '');
}

/**
 * Assert that every required variable is present. Intended for an explicit
 * startup/preflight check (e.g. before a deploy or an end-to-end run) — NOT
 * called at import time, so partial local setups keep working.
 * Throws a name-only error listing what is missing.
 */
export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (name) => !process.env[name] || process.env[name]!.trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `[config/env] Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
