// Soroban registry adapter — implements ChainAdapter (docs/architecture.md §8).
// Backend-attested cross-chain verification (ADR-001, "Path C"): the backend signs
// a compact attestation with BACKEND_ATTESTATION_SIGNING_KEY and the contract
// checks only that signature via secp256k1_recover, never re-verifying the proof.
//
// What is IMPLEMENTED here:
//   • encodeSorobanAttestationMessage — the exact preimage
//       credentialId32 ‖ "SOROBAN" ‖ resultByte ‖ u64_be(timestamp)   (48 bytes)
//     specified in attestation.ts. BYTE-FROZEN against contracts/soroban/src/lib.rs
//     and the registry.rs test vector; do not alter it.
//   • sorobanAttestationDigest — sha256 of that message: the 32-byte digest the
//     deployed registry recomputes and runs secp256k1_recover against.
//   • the backend-side freshness guard mirroring the contract's stale-timestamp check.
//   • signing (lib/chains/signing.ts): recoverable secp256k1 over the digest →
//     r‖s (64) ‖ recovery_id (1) = BytesN<65>. Pure + unit-tested.
//   • submit + get_result against the deployed contract via @stellar/stellar-sdk.
//
// The Stellar SDK is imported LAZILY (dynamic import, after the config gate) so it
// is never loaded by unit tests, which exercise only the pure encode/digest/sign
// paths and the honest gate — keeping the test run light and hermetic.
//
// DEPLOYMENT GATE (honest, never fabricates a result): submit/read need a deployed
// contract id, a funded key, and an RPC URL. When any is absent the adapter throws
// ChainAdapterNotConfiguredError listing exactly what to set — AFTER the backend
// signature is computed, so a "not configured" error never hides a signing failure.

import { createHash } from 'node:crypto';

import { env, missingEnvVars, type EnvVarName } from '@/lib/config/env';
import { ChainTarget } from '@/lib/db/prisma';

import {
  chainTagFor,
  credentialIdToBytes32,
  encodeUintBigEndian,
  isTimestampFresh,
  nowUnixSeconds,
  resultByte,
} from './attestation';
import {
  ChainAdapterError,
  ChainAdapterNotConfiguredError,
  StaleAttestationError,
} from './errors';
import { parseSecp256k1PrivateKey, signSorobanAttestation } from './signing';
import type {
  AttestationFields,
  ChainAdapter,
  OnChainResult,
  SubmitAttestationResult,
} from './types';

/** Soroban encodes the attestation timestamp as a `u64` (8 bytes, big-endian) — §8. */
const SOROBAN_TIMESTAMP_BYTES = 8;

/**
 * Env vars the Soroban adapter needs. Both submit and read require all three: a
 * read is done via `simulateTransaction`, which still needs a source account
 * (derived from the configured secret) and the deployed contract id.
 */
const SOROBAN_VARS: readonly EnvVarName[] = [
  'SOROBAN_RPC_URL',
  'SOROBAN_TESTNET_SECRET',
  'SOROBAN_REGISTRY_CONTRACT_ID',
];

/** How long to poll for a submitted transaction to leave NOT_FOUND before giving up. */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30; // ~60s ceiling — testnet inclusion is typically a few seconds.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the canonical Soroban attestation message (the sha256 preimage):
 *   credentialId32 ‖ "SOROBAN" ‖ resultByte ‖ u64_be(timestamp)   (32‖7‖1‖8 = 48).
 *
 * Bound to SOROBAN: encoding a non-Soroban field set is a programming error (the
 * chain tag would be wrong), so it throws rather than emit a mis-tagged message.
 */
export function encodeSorobanAttestationMessage(fields: AttestationFields): Buffer {
  if (fields.chain !== ChainTarget.SOROBAN) {
    throw new RangeError(
      `encodeSorobanAttestationMessage: expected chain SOROBAN, got ${fields.chain}`,
    );
  }
  return Buffer.concat([
    credentialIdToBytes32(fields.credentialId), // 32
    chainTagFor(fields), // "SOROBAN" → 7
    resultByte(fields), // 1
    encodeUintBigEndian(fields.timestamp, SOROBAN_TIMESTAMP_BYTES), // 8
  ]);
}

/**
 * The 32-byte SHA-256 digest the Soroban registry recomputes and verifies with
 * secp256k1_recover (contracts/soroban/src/lib.rs). This is the exact value the
 * backend signs.
 */
export function sorobanAttestationDigest(fields: AttestationFields): Buffer {
  return createHash('sha256').update(encodeSorobanAttestationMessage(fields)).digest();
}

export const sorobanAdapter: ChainAdapter = {
  chain: ChainTarget.SOROBAN,

  async submitAttestation(fields: AttestationFields): Promise<SubmitAttestationResult> {
    // Precondition #1: reject a stale/future timestamp before anything, exactly as
    // the contract would. Backend-authoritative.
    const now = nowUnixSeconds();
    if (!isTimestampFresh(fields.timestamp, now)) {
      throw new StaleAttestationError(ChainTarget.SOROBAN, fields.timestamp, now);
    }

    // Precondition #2: compute the canonical digest (validates the fields and is
    // the exact value that is signed).
    const digest = sorobanAttestationDigest(fields);

    // SIGN FIRST with the ADR-001 root-of-trust key — depends on no deployment
    // config, so the signature is always produced before the broadcast gate.
    const signature = signSorobanAttestation(
      digest,
      parseSecp256k1PrivateKey(env.backendAttestationSigningKey),
    );

    const missing = missingEnvVars(SOROBAN_VARS);
    if (missing.length > 0) {
      throw new ChainAdapterNotConfiguredError('SOROBAN', 'submitAttestation (broadcast)', missing);
    }

    // Lazy import: only pulled in once we are actually broadcasting.
    const { Contract, Keypair, Networks, TransactionBuilder, BASE_FEE, rpc, xdr } =
      await import('@stellar/stellar-sdk');

    let source;
    try {
      source = Keypair.fromSecret(env.sorobanTestnetSecret.trim());
    } catch {
      throw new ChainAdapterError(
        'SOROBAN_TESTNET_SECRET is malformed: expected a Stellar secret seed (S...). ' +
          '(The secret value is never logged.)',
      );
    }

    const server = new rpc.Server(env.sorobanRpcUrl);
    const account = await server.getAccount(source.publicKey());
    const contract = new Contract(env.sorobanRegistryContractId);

    const op = contract.call(
      'submit_attestation',
      xdr.ScVal.scvBytes(credentialIdToBytes32(fields.credentialId)), // BytesN<32>
      xdr.ScVal.scvBool(fields.result),
      xdr.ScVal.scvBytes(Buffer.from(signature.slice(2), 'hex')), // BytesN<65> = r‖s‖recovery
      xdr.ScVal.scvU64(BigInt(fields.timestamp)),
    );

    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    // prepareTransaction simulates + assembles the Soroban footprint/resource fee;
    // a contract panic (e.g. InvalidSignature) surfaces here before broadcast.
    const prepared = await server.prepareTransaction(built);
    prepared.sign(source);

    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new ChainAdapterError(
        `SOROBAN submit_attestation was rejected on send (status ${sent.status}): ` +
          `${JSON.stringify(sent.errorResult ?? null)}`,
      );
    }

    // Poll until the ledger includes it (leaves NOT_FOUND), then require SUCCESS.
    let got = await server.getTransaction(sent.hash);
    for (let i = 0; got.status === rpc.Api.GetTransactionStatus.NOT_FOUND && i < MAX_POLLS; i++) {
      await delay(POLL_INTERVAL_MS);
      got = await server.getTransaction(sent.hash);
    }
    if (got.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new ChainAdapterError(
        `SOROBAN submit_attestation did not confirm (tx ${sent.hash}, status ${got.status}).`,
      );
    }

    return { txHash: sent.hash, signature };
  },

  async getResult(credentialId: string): Promise<OnChainResult | null> {
    const missing = missingEnvVars(SOROBAN_VARS);
    if (missing.length > 0) {
      throw new ChainAdapterNotConfiguredError('SOROBAN', 'getResult', missing);
    }

    const { Account, Contract, Keypair, Networks, TransactionBuilder, BASE_FEE, rpc, xdr, scValToNative } =
      await import('@stellar/stellar-sdk');

    let sourcePublicKey: string;
    try {
      sourcePublicKey = Keypair.fromSecret(env.sorobanTestnetSecret.trim()).publicKey();
    } catch {
      throw new ChainAdapterError(
        'SOROBAN_TESTNET_SECRET is malformed: expected a Stellar secret seed (S...). ' +
          '(The secret value is never logged.)',
      );
    }

    const server = new rpc.Server(env.sorobanRpcUrl);
    const contract = new Contract(env.sorobanRegistryContractId);
    // A read is a simulate-only call: a placeholder source account (seq "0") is
    // sufficient; no on-chain fetch, no signing, no fee.
    const built = new TransactionBuilder(new Account(sourcePublicKey, '0'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('get_result', xdr.ScVal.scvBytes(credentialIdToBytes32(credentialId))))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(built);
    if (rpc.Api.isSimulationError(sim)) {
      throw new ChainAdapterError(`SOROBAN get_result simulation failed: ${sim.error}`);
    }

    const retval = sim.result?.retval;
    if (!retval) {
      return null;
    }
    // Option::None (no attestation recorded) comes back as ScVal::Void → null.
    const native = scValToNative(retval) as { result: boolean; timestamp: bigint } | null;
    if (native == null) {
      return null;
    }
    return { result: Boolean(native.result), timestamp: Number(native.timestamp) };
  },
};
