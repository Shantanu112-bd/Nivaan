// Recoverable secp256k1 signing for backend attestations — the ONE place the
// BACKEND_ATTESTATION_SIGNING_KEY (ADR-001 root of trust) becomes an on-chain-
// verifiable signature. Deliberately PURE and env-free: every function takes the
// raw private-key bytes as a parameter, so it is unit-testable against the exact
// vector both registry contracts' tests use (the 0x11..×32 key) with no
// environment provisioned. The adapters (evm.ts / soroban.ts) read the key from
// lib/config/env and pass it in; this module never touches process.env.
//
// One key, two chains, two digest conventions (see lib/chains/attestation.ts and
// the two contracts, which this mirrors byte-for-byte — verified by the round-trip
// tests in tests/unit/chains.test.ts):
//   • Sepolia (EVM): sign toEthSignedMessageHash(keccak256(abi.encodePacked(...))).
//     Signature bytes are r‖s‖v with v ∈ {27,28}. OpenZeppelin ECDSA.recover
//     verifies it and REQUIRES low-S — @noble/curves signs canonically (low-S) by
//     default, so this holds without extra normalization.
//   • Soroban: sign the raw sha256(...) digest. Signature bytes are r‖s (64) ‖
//     recovery_id (1), verified by env.crypto().secp256k1_recover.
//
// @noble/curves v2 specifics (empirically pinned):
//   • Import path requires the `.js` extension: '@noble/curves/secp256k1.js'.
//   • sign(hash, priv, { prehash: false, format: 'recovered' }) signs the ALREADY-
//     hashed 32-byte input (prehash:false — must NOT let it re-hash) and returns 65
//     bytes laid out recovery‖r‖s (recovery byte FIRST). We re-lay those bytes into
//     each chain's required order (recovery LAST) below.

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hashMessage, keccak256, toBytes, toHex } from 'viem';

import { InvalidSigningKeyError } from './errors';

/**
 * Parse and validate a secp256k1 private key from its configured string form.
 * Documented default (flagged in docs/progress.md): a 32-byte scalar as 64 hex
 * characters with an OPTIONAL `0x` prefix. Rejects any other shape, and rejects a
 * value outside the valid scalar range [1, n). The key material is NEVER included
 * in a thrown error (docs/security-model.md — root-of-trust secret).
 */
export function parseSecp256k1PrivateKey(raw: string): Uint8Array {
  const hex = raw.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new InvalidSigningKeyError(
      'expected a 32-byte secp256k1 scalar as 64 hex characters (optional 0x prefix)',
    );
  }
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
  // getPublicKey enforces 1 <= key < n. Wrap so noble's own error (which could
  // echo the scalar) never propagates the secret.
  try {
    secp256k1.getPublicKey(bytes);
  } catch {
    throw new InvalidSigningKeyError('value is not a valid secp256k1 scalar in [1, n)');
  }
  return bytes;
}

/**
 * Sign a 32-byte prehash, returning { recovery, rs }: `rs` is the 64-byte r‖s and
 * `recovery` is 0|1. Canonical (low-S) per @noble/curves default. prehash:false
 * because the input is already the final digest to be signed.
 */
function signPrehash(
  prehash: Uint8Array,
  privateKey: Uint8Array,
): { recovery: number; rs: Uint8Array } {
  const recovered = secp256k1.sign(prehash, privateKey, { prehash: false, format: 'recovered' });
  // noble 'recovered' layout is [recovery, r(32), s(32)] — recovery byte FIRST.
  return { recovery: recovered[0], rs: recovered.subarray(1, 65) };
}

/**
 * Sign an EVM attestation. `message` is the 72-byte abi.encodePacked pre-image
 * from encodeEvmAttestationMessage. Returns a 0x-prefixed 65-byte r‖s‖v signature
 * (v = 27 + recovery) that OpenZeppelin ECDSA.recover accepts over
 * toEthSignedMessageHash(keccak256(message)) as the configured backend signer.
 */
export function signEvmAttestation(message: Buffer, privateKey: Uint8Array): string {
  const digest = keccak256(toHex(message)); // keccak256(abi.encodePacked(...))
  const ethSigned = hashMessage({ raw: digest }); // EIP-191 prefix → 32-byte hash
  const { recovery, rs } = signPrehash(toBytes(ethSigned), privateKey);
  const sig = new Uint8Array(65);
  sig.set(rs, 0);
  sig[64] = 27 + recovery; // EVM `v`
  return toHex(sig);
}

/**
 * Sign a Soroban attestation. `digest` is the 32-byte SHA-256 digest from
 * sorobanAttestationDigest. Returns a 0x-prefixed 65-byte r‖s‖recovery_id
 * signature that env.crypto().secp256k1_recover accepts as the backend key.
 */
export function signSorobanAttestation(digest: Buffer, privateKey: Uint8Array): string {
  const { recovery, rs } = signPrehash(Uint8Array.from(digest), privateKey);
  const sig = new Uint8Array(65);
  sig.set(rs, 0);
  sig[64] = recovery; // Soroban recovery id (0|1)
  return toHex(sig);
}
