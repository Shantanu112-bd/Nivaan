// Attestation encoding + signing scheme — the authoritative spec that both chain
// adapters (lib/chains/{evm,soroban}.ts) and both registry contracts
// (contracts/evm/Registry.sol, contracts/soroban/src/lib.rs) MUST mirror exactly.
//
// This module is dependency-free (node:crypto only): the chain-specific DIGEST and
// signature are applied by each adapter using its own library, over the field
// layout specified below. Keeping the layout in one place is what lets a single
// backend key attest to both chains consistently.
//
// ===================== Signing scheme (documented default) =====================
// ADR-001 makes BACKEND_ATTESTATION_SIGNING_KEY the single root of trust. To keep
// ONE key across both chains, the MVP uses secp256k1 on both:
//   • Sepolia (EVM): OpenZeppelin ECDSA (docs/architecture.md §9) — keccak256
//     digest with the Ethereum signed-message prefix, `ecrecover` in the contract.
//     Encoding + signing live in lib/chains/evm.ts.
//   • Soroban: env.crypto().secp256k1_recover() over a SHA-256 digest of the same
//     logical fields. Encoding + signing live in lib/chains/soroban.ts.
// Each contract recovers the signer and requires it to equal the configured
// backend public key. Because the digest function differs per chain convention,
// the backend produces a DISTINCT signature per chain from the SAME private key.
//
// ⚠️ FLAG (docs/progress.md): this exact scheme — secp256k1 on both sides, SHA-256
// vs keccak256, and the field layout below — is a documented default under
// ADR-001, not an independently specified requirement. If overridden before live
// deploy, change it in exactly three places: here, Registry.sol, and lib.rs.
//
// ============================ Canonical fields ================================
// Ordered fields, each fixed-width so adjacent fields are unambiguous:
//   1. credentialId32 — 32 bytes — SHA-256(utf8(DB credential id)); a
//      chain-independent id so the same credential maps to the same key on both.
//   2. chainTag       — ASCII "SOROBAN" | "SEPOLIA" (both 7 bytes) — binds the
//      attestation to one chain, preventing a signature valid on one from being
//      replayed on the other.
//   3. result         — 1 byte — 0x01 (pass) or 0x00 (fail).
//   4. timestamp      — unix SECONDS — EVM encodes as uint256 (per §9's
//      submitAttestation signature); Soroban encodes as u64 big-endian. This is
//      the ONE width that differs per chain; both read the same integer value.
//
// Per-chain digest (documented for the contract authors):
//   • EVM:     keccak256(abi.encodePacked(bytes32 credentialId, string chainTag,
//              bool result, uint256 timestamp)) then the eth-signed-message prefix.
//   • Soroban: sha256(credentialId32 ‖ chainTag ‖ resultByte ‖ u64_be(timestamp)).

import { createHash } from 'node:crypto';

import type { AttestationFields } from './types';

/**
 * Replay/staleness window. Registry contracts reject a timestamp further than this
 * from their current ledger time (docs/security-model.md replay protection),
 * alongside rejecting an already-recorded credentialId. 5 minutes mirrors the auth
 * nonce lifetime and tolerates modest clock skew between backend and chain.
 */
export const ATTESTATION_MAX_AGE_SECONDS = 300;

/** Map a DB credential id (cuid) to its chain-independent 32-byte on-chain id. */
export function credentialIdToBytes32(credentialId: string): Buffer {
  return createHash('sha256').update(credentialId, 'utf8').digest();
}

/** Current unix time in SECONDS (attestation timestamps are seconds, not ms). */
export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Encode a non-negative integer as a fixed-width big-endian byte buffer — the
 * shared primitive both adapters use for the timestamp field, which is the ONE
 * width that differs per chain (EVM `uint256` → 32 bytes; Soroban `u64` → 8
 * bytes; see the "Canonical fields" note above). Uses BigInt so the full u64/u256
 * range is representable, and rejects a value that is negative, non-integer, or
 * too large for `byteLength` — a malformed field fails here rather than producing
 * a silently-wrong digest the contract would reject.
 */
export function encodeUintBigEndian(value: number | bigint, byteLength: number): Buffer {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new RangeError(`encodeUintBigEndian: value ${value} is not an integer`);
  }
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError(`encodeUintBigEndian: byteLength ${byteLength} must be a positive integer`);
  }
  const v = typeof value === 'bigint' ? value : BigInt(value);
  if (v < BigInt(0)) {
    throw new RangeError(`encodeUintBigEndian: value ${v} must be non-negative`);
  }
  if (v >= BigInt(1) << BigInt(byteLength * 8)) {
    throw new RangeError(`encodeUintBigEndian: value ${v} does not fit in ${byteLength} bytes`);
  }
  const out = Buffer.alloc(byteLength);
  let rem = v;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(rem & BigInt(0xff));
    rem >>= BigInt(8);
  }
  return out;
}

/**
 * Backend-side freshness check, mirroring what each contract enforces on-chain.
 * Used to reject stale attestations before submitting (and unit-testable without
 * a chain). `now` defaults to the current time.
 */
export function isTimestampFresh(timestamp: number, now: number = nowUnixSeconds()): boolean {
  return Math.abs(now - timestamp) <= ATTESTATION_MAX_AGE_SECONDS;
}

/**
 * The ASCII chain-tag bytes both adapters mix into the signed message. The tag is
 * the ChainTarget value itself ("SOROBAN" | "SEPOLIA", both 7 bytes), so this is a
 * direct encode — no lookup table to drift from the enum.
 */
export function chainTagFor(fields: Pick<AttestationFields, 'chain'>): Buffer {
  return Buffer.from(fields.chain, 'ascii');
}

/**
 * The 1-byte result field mixed into both digests: 0x01 for pass, 0x00 for fail
 * (matches the `bool` encoding on both sides — see the "Canonical fields" note).
 */
export function resultByte(fields: Pick<AttestationFields, 'result'>): Buffer {
  return Buffer.from([fields.result ? 0x01 : 0x00]);
}
