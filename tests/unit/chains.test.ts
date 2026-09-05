// Unit tests for the chain-adapter layer (docs/architecture.md §3, §8, §9;
// ADR-001 backend attestation). These exercise the parts that are genuinely
// computable offline with no funded key and no deployed contract:
//   • the canonical attestation encoding each registry contract recomputes,
//   • the shared big-endian / freshness primitives in attestation.ts,
//   • the recoverable secp256k1 signing that produces each chain's on-chain
//     signature bytes (verified by INDEPENDENTLY recovering the signer),
//   • the adapter registry + api-string mapping,
// and they assert the deployment-gated boundaries (broadcast + on-chain read) fail
// LOUDLY via ChainAdapterNotConfiguredError rather than fabricating a result.
//
// Encodings and signatures are checked INDEPENDENTLY (recomputed/recovered a
// different way) so the tests would catch a regression in the functions under
// test, not merely mirror them. The EVM 72-byte layout matches
// `abi.encodePacked(bytes32, string, bool, uint256)` in Registry.test.js; the
// Soroban digest matches sha256(preimage) in contracts/soroban/src/lib.rs; the
// signature vectors use the SAME 0x11..×32 key both contracts' tests use.

import { createHash } from 'node:crypto';

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { getAddress, hashMessage, keccak256, recoverAddress, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Chains code imports ChainTarget as a value; mock the DB module so no Prisma
// client is instantiated (mirrors verificationService.test.ts).
vi.mock('@/lib/db/prisma', () => ({
  ChainTarget: { SOROBAN: 'SOROBAN', SEPOLIA: 'SEPOLIA' },
}));

import { ChainTarget } from '@/lib/db/prisma';
import {
  chainToApiString,
  getChainAdapter,
  parseChainTarget,
  type AttestationFields,
} from '@/lib/chains';
import {
  ATTESTATION_MAX_AGE_SECONDS,
  credentialIdToBytes32,
  encodeUintBigEndian,
  isTimestampFresh,
  nowUnixSeconds,
} from '@/lib/chains/attestation';
import {
  ChainAdapterNotConfiguredError,
  InvalidSigningKeyError,
  StaleAttestationError,
} from '@/lib/chains/errors';
import { encodeEvmAttestationMessage, evmAdapter } from '@/lib/chains/evm';
import {
  encodeSorobanAttestationMessage,
  sorobanAdapter,
  sorobanAttestationDigest,
} from '@/lib/chains/soroban';
import {
  parseSecp256k1PrivateKey,
  signEvmAttestation,
  signSorobanAttestation,
} from '@/lib/chains/signing';

/** Independent big-endian encoder for values < 2^32 (test-only cross-check). */
function beBytes(value: number, len: number): Buffer {
  const b = Buffer.alloc(len);
  b.writeUInt32BE(value, len - 4);
  return b;
}

/** Independent SHA-256 (does not go through attestation.ts). */
function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

/** The exact backend key both registry contracts' tests sign with (0x11..×32). */
const PRIV_HEX = '11'.repeat(32);
const PRIV = Uint8Array.from(Buffer.from(PRIV_HEX, 'hex'));

/** secp256k1 group order n and its half — for the canonical low-S assertion. */
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const HALF_N = SECP256K1_N >> BigInt(1);

const SEPOLIA_FIELDS: AttestationFields = {
  credentialId: 'clr1credentialcuid000001',
  chain: ChainTarget.SEPOLIA,
  result: true,
  timestamp: 1_700_000_000,
};
const SOROBAN_FIELDS: AttestationFields = {
  ...SEPOLIA_FIELDS,
  chain: ChainTarget.SOROBAN,
};

describe('encodeUintBigEndian', () => {
  it('encodes zero as all-zero bytes of the requested width', () => {
    expect(encodeUintBigEndian(0, 8)).toEqual(Buffer.alloc(8));
  });

  it('encodes a small value big-endian', () => {
    expect(encodeUintBigEndian(1, 4)).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x01]));
    expect(encodeUintBigEndian(255, 1)).toEqual(Buffer.from([0xff]));
  });

  it('handles the full u64 range via BigInt', () => {
    expect(encodeUintBigEndian(BigInt(2) ** BigInt(64) - BigInt(1), 8)).toEqual(
      Buffer.from('ffffffffffffffff', 'hex'),
    );
    expect(encodeUintBigEndian(BigInt(1) << BigInt(63), 8)).toEqual(
      Buffer.from('8000000000000000', 'hex'),
    );
  });

  it('rejects negative, non-integer, overflowing, and bad-width inputs', () => {
    expect(() => encodeUintBigEndian(-1, 8)).toThrow(RangeError);
    expect(() => encodeUintBigEndian(1.5, 8)).toThrow(RangeError);
    expect(() => encodeUintBigEndian(256, 1)).toThrow(RangeError); // 0x100 > 1 byte
    expect(() => encodeUintBigEndian(BigInt(2) ** BigInt(64), 8)).toThrow(RangeError);
    expect(() => encodeUintBigEndian(1, 0)).toThrow(RangeError);
  });
});

describe('credentialIdToBytes32', () => {
  it('is sha256(utf8(id)) — 32 bytes, deterministic, matches an independent hash', () => {
    const out = credentialIdToBytes32(SEPOLIA_FIELDS.credentialId);
    expect(out).toHaveLength(32);
    expect(out).toEqual(sha256(SEPOLIA_FIELDS.credentialId));
    expect(out).toEqual(credentialIdToBytes32(SEPOLIA_FIELDS.credentialId));
  });
});

describe('isTimestampFresh', () => {
  it('accepts within the window (inclusive at exactly MAX_AGE) and rejects beyond, both directions', () => {
    const now = 2_000_000_000;
    expect(isTimestampFresh(now, now)).toBe(true);
    expect(isTimestampFresh(now - ATTESTATION_MAX_AGE_SECONDS, now)).toBe(true);
    expect(isTimestampFresh(now + ATTESTATION_MAX_AGE_SECONDS, now)).toBe(true);
    expect(isTimestampFresh(now - ATTESTATION_MAX_AGE_SECONDS - 1, now)).toBe(false);
    expect(isTimestampFresh(now + ATTESTATION_MAX_AGE_SECONDS + 1, now)).toBe(false);
  });
});

describe('encodeEvmAttestationMessage', () => {
  it('lays out bytes32 ‖ "SEPOLIA" ‖ bool ‖ uint256 = 72 bytes (abi.encodePacked)', () => {
    const msg = encodeEvmAttestationMessage(SEPOLIA_FIELDS);
    expect(msg).toHaveLength(32 + 7 + 1 + 32);
    expect(msg.subarray(0, 32)).toEqual(sha256(SEPOLIA_FIELDS.credentialId));
    expect(msg.subarray(32, 39).toString('ascii')).toBe('SEPOLIA');
    expect(msg[39]).toBe(0x01); // result = true
    expect(msg.subarray(40, 72)).toEqual(beBytes(SEPOLIA_FIELDS.timestamp, 32));
  });

  it('encodes result=false as a 0x00 byte', () => {
    const msg = encodeEvmAttestationMessage({ ...SEPOLIA_FIELDS, result: false });
    expect(msg[39]).toBe(0x00);
  });

  it('refuses to encode a non-Sepolia field set (chain-tag binding)', () => {
    expect(() => encodeEvmAttestationMessage(SOROBAN_FIELDS)).toThrow(RangeError);
  });
});

describe('encodeSorobanAttestationMessage / sorobanAttestationDigest', () => {
  it('lays out credentialId32 ‖ "SOROBAN" ‖ bool ‖ u64_be = 48 bytes', () => {
    const msg = encodeSorobanAttestationMessage(SOROBAN_FIELDS);
    expect(msg).toHaveLength(32 + 7 + 1 + 8);
    expect(msg.subarray(0, 32)).toEqual(sha256(SOROBAN_FIELDS.credentialId));
    expect(msg.subarray(32, 39).toString('ascii')).toBe('SOROBAN');
    expect(msg[39]).toBe(0x01);
    expect(msg.subarray(40, 48)).toEqual(beBytes(SOROBAN_FIELDS.timestamp, 8));
  });

  it('digest is sha256 of the message — 32 bytes, matches an independent hash', () => {
    const digest = sorobanAttestationDigest(SOROBAN_FIELDS);
    expect(digest).toHaveLength(32);
    expect(digest).toEqual(sha256(encodeSorobanAttestationMessage(SOROBAN_FIELDS)));
  });

  it('refuses to encode a non-Soroban field set (chain-tag binding)', () => {
    expect(() => encodeSorobanAttestationMessage(SEPOLIA_FIELDS)).toThrow(RangeError);
  });
});

describe('parseSecp256k1PrivateKey', () => {
  it('accepts 64 hex chars with or without 0x (and surrounding space/case), returning 32 raw bytes', () => {
    const expected = Uint8Array.from(Buffer.from(PRIV_HEX, 'hex'));
    expect(parseSecp256k1PrivateKey(PRIV_HEX)).toEqual(expected);
    expect(parseSecp256k1PrivateKey(`0x${PRIV_HEX}`)).toEqual(expected);
    expect(parseSecp256k1PrivateKey(`  0X${PRIV_HEX.toUpperCase()}  `)).toEqual(expected);
  });

  it('rejects malformed shapes with InvalidSigningKeyError', () => {
    expect(() => parseSecp256k1PrivateKey('')).toThrow(InvalidSigningKeyError);
    expect(() => parseSecp256k1PrivateKey('11')).toThrow(InvalidSigningKeyError); // too short
    expect(() => parseSecp256k1PrivateKey('zz'.repeat(32))).toThrow(InvalidSigningKeyError); // non-hex
    expect(() => parseSecp256k1PrivateKey('11'.repeat(33))).toThrow(InvalidSigningKeyError); // too long
  });

  it('rejects a scalar outside [1, n): zero and n itself', () => {
    expect(() => parseSecp256k1PrivateKey('00'.repeat(32))).toThrow(InvalidSigningKeyError);
    expect(() =>
      parseSecp256k1PrivateKey('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'),
    ).toThrow(InvalidSigningKeyError);
  });

  it('never includes the key material in the thrown message', () => {
    const secretish = 'de'.repeat(40); // 80 chars — wrong length, triggers the shape error
    try {
      parseSecp256k1PrivateKey(secretish);
      throw new Error('expected parseSecp256k1PrivateKey to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSigningKeyError);
      expect((err as Error).message).not.toContain(secretish);
    }
  });
});

describe('signEvmAttestation (recoverable secp256k1 → r‖s‖v)', () => {
  it('produces a 65-byte, v∈{27,28}, low-S signature that recovers to the signer address', async () => {
    const message = encodeEvmAttestationMessage(SEPOLIA_FIELDS);
    const sig = signEvmAttestation(message, PRIV);

    // 65 bytes, 0x-prefixed lowercase hex.
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);

    // v = 27 + recovery ∈ {27, 28} (last byte).
    const v = parseInt(sig.slice(-2), 16);
    expect([27, 28]).toContain(v);

    // Canonical low-S: OpenZeppelin's ECDSA.recover rejects high-S.
    const s = BigInt(`0x${sig.slice(2).slice(64, 128)}`);
    expect(s <= HALF_N).toBe(true);

    // Independent recovery: recompute the eth-signed digest and recover the address,
    // then compare to the address viem derives from the same private key.
    const digest = keccak256(toHex(message));
    const ethHash = hashMessage({ raw: digest });
    const recovered = await recoverAddress({ hash: ethHash, signature: sig as `0x${string}` });
    expect(getAddress(recovered)).toBe(privateKeyToAccount(`0x${PRIV_HEX}`).address);
  });

  it('changing any field changes the signature (binds the message)', () => {
    const a = signEvmAttestation(encodeEvmAttestationMessage(SEPOLIA_FIELDS), PRIV);
    const b = signEvmAttestation(
      encodeEvmAttestationMessage({ ...SEPOLIA_FIELDS, result: false }),
      PRIV,
    );
    expect(a).not.toBe(b);
  });
});

describe('signSorobanAttestation (recoverable secp256k1 → r‖s‖recovery)', () => {
  it('produces a 65-byte, recovery∈{0,1} signature that recovers to the backend pubkey', () => {
    const digest = sorobanAttestationDigest(SOROBAN_FIELDS);
    const sig = signSorobanAttestation(digest, PRIV);

    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    const bytes = Buffer.from(sig.slice(2), 'hex');
    const recovery = bytes[64];
    expect([0, 1]).toContain(recovery);

    // Independent recovery: reconstruct the pubkey from r‖s + recovery over the
    // digest and compare to the uncompressed pubkey noble derives from the key.
    const recoveredPub = secp256k1.Signature.fromBytes(Uint8Array.from(bytes.subarray(0, 64)), 'compact')
      .addRecoveryBit(recovery)
      .recoverPublicKey(Uint8Array.from(digest))
      .toBytes(false);
    expect(Buffer.from(recoveredPub)).toEqual(Buffer.from(secp256k1.getPublicKey(PRIV, false)));
  });

  it('yields a DIFFERENT signature than the EVM path for the same logical fields (distinct digests)', () => {
    const evmSig = signEvmAttestation(encodeEvmAttestationMessage(SEPOLIA_FIELDS), PRIV);
    const sorobanSig = signSorobanAttestation(sorobanAttestationDigest(SOROBAN_FIELDS), PRIV);
    expect(evmSig).not.toBe(sorobanSig);
  });
});

describe('getChainAdapter / chain api-string mapping', () => {
  it('resolves each ChainTarget to the adapter whose chain matches', () => {
    expect(getChainAdapter(ChainTarget.SOROBAN)).toBe(sorobanAdapter);
    expect(getChainAdapter(ChainTarget.SEPOLIA)).toBe(evmAdapter);
    expect(sorobanAdapter.chain).toBe(ChainTarget.SOROBAN);
    expect(evmAdapter.chain).toBe(ChainTarget.SEPOLIA);
  });

  it('round-trips the api-spec wire strings', () => {
    expect(parseChainTarget('soroban')).toBe(ChainTarget.SOROBAN);
    expect(parseChainTarget('sepolia')).toBe(ChainTarget.SEPOLIA);
    expect(parseChainTarget('bitcoin')).toBeNull();
    expect(chainToApiString(ChainTarget.SOROBAN)).toBe('soroban');
    expect(chainToApiString(ChainTarget.SEPOLIA)).toBe('sepolia');
  });
});

describe('adapter deployment gate (broadcast/read fail loudly, signing still happens first)', () => {
  // Hermetic env: a valid backend signing key so signing SUCCEEDS, and blank
  // deployment vars so the broadcast/read gate is what fires. This proves the
  // ordering that matters for ADR-001 — the signature is computed before the gate,
  // so a "not configured" error can never mask a signing failure.
  beforeEach(() => {
    vi.stubEnv('BACKEND_ATTESTATION_SIGNING_KEY', `0x${PRIV_HEX}`);
    vi.stubEnv('SEPOLIA_RPC_URL', '');
    vi.stubEnv('SEPOLIA_DEPLOYER_KEY', '');
    vi.stubEnv('SEPOLIA_REGISTRY_ADDRESS', '');
    vi.stubEnv('SOROBAN_RPC_URL', '');
    vi.stubEnv('SOROBAN_TESTNET_SECRET', '');
    vi.stubEnv('SOROBAN_REGISTRY_CONTRACT_ID', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fresh = (chain: ChainTarget): AttestationFields => ({
    credentialId: 'cred_boundary',
    chain,
    result: true,
    timestamp: nowUnixSeconds(),
  });

  it('getResult throws ChainAdapterNotConfiguredError on both chains (lists missing vars)', async () => {
    await expect(sorobanAdapter.getResult('cred_x')).rejects.toBeInstanceOf(
      ChainAdapterNotConfiguredError,
    );
    let evmErr: unknown;
    try {
      await evmAdapter.getResult('cred_x');
    } catch (e) {
      evmErr = e;
    }
    expect(evmErr).toBeInstanceOf(ChainAdapterNotConfiguredError);
    expect((evmErr as ChainAdapterNotConfiguredError).missing).toContain('SEPOLIA_REGISTRY_ADDRESS');
  });

  it('submitAttestation (fresh) signs, then throws ChainAdapterNotConfiguredError at the broadcast gate', async () => {
    let evmErr: unknown;
    try {
      await evmAdapter.submitAttestation(fresh(ChainTarget.SEPOLIA));
    } catch (e) {
      evmErr = e;
    }
    expect(evmErr).toBeInstanceOf(ChainAdapterNotConfiguredError);
    expect((evmErr as Error).message).toContain('SEPOLIA');
    expect((evmErr as Error).message).toContain('submitAttestation');
    expect((evmErr as ChainAdapterNotConfiguredError).missing).toEqual([
      'SEPOLIA_RPC_URL',
      'SEPOLIA_DEPLOYER_KEY',
      'SEPOLIA_REGISTRY_ADDRESS',
    ]);

    await expect(
      sorobanAdapter.submitAttestation(fresh(ChainTarget.SOROBAN)),
    ).rejects.toBeInstanceOf(ChainAdapterNotConfiguredError);
  });

  it('submitAttestation rejects a stale timestamp BEFORE the gate (StaleAttestationError)', async () => {
    const stale = (chain: ChainTarget): AttestationFields => ({
      credentialId: 'cred_stale',
      chain,
      result: true,
      timestamp: nowUnixSeconds() - ATTESTATION_MAX_AGE_SECONDS - 1,
    });
    await expect(evmAdapter.submitAttestation(stale(ChainTarget.SEPOLIA))).rejects.toBeInstanceOf(
      StaleAttestationError,
    );
    await expect(
      sorobanAdapter.submitAttestation(stale(ChainTarget.SOROBAN)),
    ).rejects.toBeInstanceOf(StaleAttestationError);
  });

  it('submitAttestation surfaces a malformed backend signing key as InvalidSigningKeyError (no gate reached)', async () => {
    vi.stubEnv('BACKEND_ATTESTATION_SIGNING_KEY', 'not-a-valid-key');
    await expect(evmAdapter.submitAttestation(fresh(ChainTarget.SEPOLIA))).rejects.toBeInstanceOf(
      InvalidSigningKeyError,
    );
    await expect(
      sorobanAdapter.submitAttestation(fresh(ChainTarget.SOROBAN)),
    ).rejects.toBeInstanceOf(InvalidSigningKeyError);
  });
});
