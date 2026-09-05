// Sepolia (EVM) registry adapter — implements ChainAdapter (docs/architecture.md
// §9). Backend-attested cross-chain verification (ADR-001, "Path C"): the backend
// signs a compact attestation with BACKEND_ATTESTATION_SIGNING_KEY and the
// contract checks only that signature, never re-verifying the ZK proof.
//
// What is IMPLEMENTED here:
//   • encodeEvmAttestationMessage — the exact `abi.encodePacked(bytes32, string,
//     bool, uint256)` pre-image the deployed Registry recomputes and keccak256-
//     hashes (contracts/evm/contracts/Registry.sol). This is the chain-specific
//     encoding attestation.ts says "live[s] in lib/chains/evm.ts". BYTE-FROZEN —
//     it is verified against Registry.test.js's vector; do not alter it.
//   • the backend-side freshness guard mirroring the contract's StaleTimestamp.
//   • signing (lib/chains/signing.ts): keccak256(message) → eth-signed-message
//     prefix → recoverable secp256k1 → r‖s‖v (v = 27+recovery). Pure + unit-tested.
//   • broadcast + getResult against the deployed Registry via viem.
//
// DEPLOYMENT GATE (honest, never fabricates a result): broadcasting and reading
// need a deployed Registry address, a funded key, and an RPC URL. When any of
// those env vars is absent the adapter throws ChainAdapterNotConfiguredError
// listing exactly what to set — AFTER the backend signature has already been
// computed, so a "not configured" error never hides a signing failure. Deploying
// the Registry + funding the key is the operator step tracked in docs/progress.md.

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  toHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

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
import { parseSecp256k1PrivateKey, signEvmAttestation } from './signing';
import type {
  AttestationFields,
  ChainAdapter,
  OnChainResult,
  SubmitAttestationResult,
} from './types';

/** EVM encodes the attestation timestamp as a `uint256` (32 bytes) — §9. */
const EVM_TIMESTAMP_BYTES = 32;

/**
 * Env vars required to BROADCAST an attestation to the deployed Registry: the RPC
 * endpoint, the funded broadcast key, and the deployed contract address. Read-only
 * calls need the RPC + address but not the key.
 */
const EVM_BROADCAST_VARS: readonly EnvVarName[] = [
  'SEPOLIA_RPC_URL',
  'SEPOLIA_DEPLOYER_KEY',
  'SEPOLIA_REGISTRY_ADDRESS',
];
const EVM_READ_VARS: readonly EnvVarName[] = ['SEPOLIA_RPC_URL', 'SEPOLIA_REGISTRY_ADDRESS'];

/**
 * Minimal ABI for the three Registry functions this adapter calls. Mirrors
 * contracts/evm/contracts/Registry.sol exactly:
 *   submitAttestation(bytes32 credentialId, bool result, bytes signature, uint256 timestamp)
 *   getResult(bytes32) → (bool result, uint256 timestamp)
 *   hasResult(bytes32) → bool
 */
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitAttestation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'credentialId', type: 'bytes32' },
      { name: 'result', type: 'bool' },
      { name: 'signature', type: 'bytes' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getResult',
    stateMutability: 'view',
    inputs: [{ name: 'credentialId', type: 'bytes32' }],
    outputs: [
      { name: 'result', type: 'bool' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'hasResult',
    stateMutability: 'view',
    inputs: [{ name: 'credentialId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Build the canonical EVM attestation message: the `abi.encodePacked` layout
 *   bytes32 credentialId ‖ string "SEPOLIA" ‖ bool result ‖ uint256 timestamp
 * (32 ‖ 7 ‖ 1 ‖ 32 = 72 bytes). The deployed Registry computes
 * `keccak256(abi.encodePacked(...))` over exactly these bytes, then recovers the
 * signer from the eth-signed-message hash (Registry.sol).
 *
 * Bound to SEPOLIA: encoding a non-Sepolia field set is a programming error (the
 * chain tag would be wrong), so it throws rather than emit a mis-tagged message.
 */
export function encodeEvmAttestationMessage(fields: AttestationFields): Buffer {
  if (fields.chain !== ChainTarget.SEPOLIA) {
    throw new RangeError(
      `encodeEvmAttestationMessage: expected chain SEPOLIA, got ${fields.chain}`,
    );
  }
  return Buffer.concat([
    credentialIdToBytes32(fields.credentialId), // 32
    chainTagFor(fields), // "SEPOLIA" → 7
    resultByte(fields), // 1
    encodeUintBigEndian(fields.timestamp, EVM_TIMESTAMP_BYTES), // 32
  ]);
}

/** The Registry's on-chain 32-byte credential id, as a viem hex string. */
function onChainCredentialId(credentialId: string): Hex {
  return toHex(credentialIdToBytes32(credentialId));
}

/**
 * Build a viem account from SEPOLIA_DEPLOYER_KEY. Normalizes an optional `0x`
 * prefix and validates the 32-byte hex shape BEFORE handing it to viem, so a
 * malformed key fails with our own message and viem's error (which could echo the
 * value) never fires. The key value is never included in the thrown message.
 */
function accountFromDeployerKey(raw: string) {
  const hex = raw.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ChainAdapterError(
      'SEPOLIA_DEPLOYER_KEY is malformed: expected a 32-byte hex private key ' +
        '(64 hex characters, optional 0x prefix). (The key value is never logged.)',
    );
  }
  return privateKeyToAccount(`0x${hex}`);
}

export const evmAdapter: ChainAdapter = {
  chain: ChainTarget.SEPOLIA,

  async submitAttestation(fields: AttestationFields): Promise<SubmitAttestationResult> {
    // Precondition #1: reject a stale/future timestamp before anything, exactly as
    // the contract would (StaleTimestamp). Backend-authoritative.
    const now = nowUnixSeconds();
    if (!isTimestampFresh(fields.timestamp, now)) {
      throw new StaleAttestationError(ChainTarget.SEPOLIA, fields.timestamp, now);
    }

    // Precondition #2: build (and thereby validate) the canonical message.
    const message = encodeEvmAttestationMessage(fields);

    // SIGN FIRST with the ADR-001 root-of-trust key. This depends on NO deployment
    // config, so the backend signature is always produced before the broadcast
    // gate below — a "not configured" error can never mask a signing failure.
    const signature = signEvmAttestation(
      message,
      parseSecp256k1PrivateKey(env.backendAttestationSigningKey),
    );

    // Broadcast gate: report precisely which deployment vars are unset. The
    // signature above is already computed and returned to the caller conceptually,
    // but with no Registry to submit to we must not fabricate a tx hash.
    const missing = missingEnvVars(EVM_BROADCAST_VARS);
    if (missing.length > 0) {
      throw new ChainAdapterNotConfiguredError('SEPOLIA', 'submitAttestation (broadcast)', missing);
    }

    const account = accountFromDeployerKey(env.sepoliaDeployerKey);
    const address = getAddress(env.sepoliaRegistryAddress);
    const transport = http(env.sepoliaRpcUrl);
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const walletClient = createWalletClient({ account, chain: sepolia, transport });

    // Simulate first so a contract revert (AlreadyRecorded / StaleTimestamp /
    // InvalidSignature) surfaces as a decoded error before any gas is spent.
    const { request } = await publicClient.simulateContract({
      account,
      address,
      abi: REGISTRY_ABI,
      functionName: 'submitAttestation',
      args: [
        onChainCredentialId(fields.credentialId),
        fields.result,
        signature as Hex,
        BigInt(fields.timestamp),
      ],
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      throw new ChainAdapterError(
        `SEPOLIA submitAttestation reverted on-chain (tx ${txHash}, status ${receipt.status}).`,
      );
    }

    return { txHash, signature };
  },

  async getResult(credentialId: string): Promise<OnChainResult | null> {
    const missing = missingEnvVars(EVM_READ_VARS);
    if (missing.length > 0) {
      throw new ChainAdapterNotConfiguredError('SEPOLIA', 'getResult', missing);
    }

    const address = getAddress(env.sepoliaRegistryAddress);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(env.sepoliaRpcUrl) });
    const onChainId = onChainCredentialId(credentialId);

    // hasResult distinguishes "no attestation recorded" (→ null) from a recorded
    // result=false, which getResult alone could not (both would read as false).
    const recorded = await publicClient.readContract({
      address,
      abi: REGISTRY_ABI,
      functionName: 'hasResult',
      args: [onChainId],
    });
    if (!recorded) {
      return null;
    }

    const [result, timestamp] = await publicClient.readContract({
      address,
      abi: REGISTRY_ABI,
      functionName: 'getResult',
      args: [onChainId],
    });
    return { result, timestamp: Number(timestamp) };
  },
};
