// NIVAAN — Minokawa witness provider (TypeScript side of the Compact circuit).
//
// Source of truth: docs/architecture.md §5 (credential architecture) and §7
// (Midnight architecture); docs/decisions.md ADR-003 (Anon Aadhaar Test QR data
// source). This is part 1 of the three parts described in nivaan.compact — the
// `witness getAadhaarTestProof(): AadhaarAttrs` declared there is IMPLEMENTED here.
//
// It runs CLIENT-SIDE, on the holder's device (§2, §6, docs/security-model.md):
// the raw Aadhaar Test-QR payload lives only in the contract's *private state* and
// is never sent to the backend. The circuit consumes the returned attributes and
// disclose()s only a derived boolean + a coarse jurisdiction code — never the age
// or the QR itself.
//
// Data-source-agnostic by design (ADR-003): the MVP reads a validly-signed Anon
// Aadhaar **Test QR**. The post-MVP REAL_DATA swap changes only extractAadhaarAttrs
// (and its source), not the circuit, the ledger, or the backend.

import { createHash } from 'node:crypto';

import * as anonAadhaarCore from '@anon-aadhaar/core';

import type { AadhaarAttrs, Witnesses } from './managed/contract/index.js';

/** Malformed / unparseable Test QR. We THROW rather than fabricate attributes —
 * an unreadable QR must never silently yield an "eligible" credential. */
export class InvalidAadhaarQrError extends Error {
  constructor(message: string) {
    super(`Invalid Aadhaar QR: ${message}`);
    this.name = 'InvalidAadhaarQrError';
  }
}

/**
 * The Minokawa contract's private state: the local Test-QR payload only.
 *
 * `aadhaarQrData` is the Anon Aadhaar Secure QR V2 value — a big-integer encoded as
 * a decimal string (the format produced by @anon-aadhaar/core's
 * `rawDataToCompressedQR(...).toString()` and consumed by its `generateArgs`). It is
 * private witness data: it stays on the device and never crosses to the backend.
 */
export interface NivaanPrivateState {
  readonly aadhaarQrData: string;
}

// Anon Aadhaar Secure QR V2 appends a 256-byte RSA signature after the signed
// payload (see @anon-aadhaar/core generateArgs). We read attributes from the signed
// payload; signature verification against the test certificate is a separate,
// optional hardening step (gated on ANON_AADHAAR_TEST_KEY) and not required to
// extract the witness attributes for the MVP.
const AADHAAR_SIGNATURE_BYTES = 256;

/** Decode the QR big-integer string back to the signed payload (sans signature). */
function decodeSignedData(qrData: string): Uint8Array {
  let asBigInt: bigint;
  try {
    asBigInt = BigInt(qrData);
  } catch {
    throw new InvalidAadhaarQrError('QR data is not a valid integer string');
  }

  const packed = anonAadhaarCore.convertBigIntToByteArray(asBigInt);
  let decompressed: Uint8Array;
  try {
    decompressed = anonAadhaarCore.decompressByteArray(packed);
  } catch {
    throw new InvalidAadhaarQrError('QR data could not be decompressed');
  }

  if (decompressed.length <= AADHAAR_SIGNATURE_BYTES) {
    throw new InvalidAadhaarQrError('QR payload too short to contain a signed body');
  }
  return decompressed.slice(0, decompressed.length - AADHAAR_SIGNATURE_BYTES);
}

/**
 * Whole years between a "DD-MM-YYYY" DOB (the Aadhaar QR DOB format) and `now`.
 * `now` is a parameter so age is deterministically testable. Exported for unit
 * tests. The exact age is PRIVATE — the circuit only ever compares it to a
 * threshold and discloses the boolean.
 */
export function computeAgeYears(dob: string, now: Date): number {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob.trim());
  if (!match) {
    throw new InvalidAadhaarQrError(`unrecognised DOB "${dob}" (expected DD-MM-YYYY)`);
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  let age = now.getUTCFullYear() - year;
  const nowMonth = now.getUTCMonth() + 1;
  if (nowMonth < month || (nowMonth === month && now.getUTCDate() < day)) {
    age -= 1;
  }
  if (age < 0) {
    throw new InvalidAadhaarQrError('DOB is in the future');
  }
  return age;
}

/**
 * Coarse jurisdiction code derived from the Indian PIN code: the first two digits
 * are the postal region (a broad multi-district zone, e.g. "56" ≈ Karnataka
 * region), which is deliberately coarse — this value is disclose()'d to public
 * state, so it must not pinpoint a location (docs/security-model.md). Fits Uint<16>.
 */
export function deriveJurisdictionCode(pincode: string): number {
  const digits = pincode.trim();
  if (!/^\d{6}$/.test(digits)) {
    throw new InvalidAadhaarQrError(`unrecognised PIN code "${pincode}" (expected 6 digits)`);
  }
  return Number(digits.slice(0, 2));
}

/**
 * A stable per-identity nullifier: sha256 of the QR photo bytes. The photo is
 * constant across QR refreshes (unlike the timestamp), so the same identity yields
 * the same 32-byte tag — the anti-duplication property the AadhaarAttrs.nullifier
 * field is reserved for. Uses node:crypto sha256, matching lib/chains/attestation.ts.
 */
function computeNullifier(signedData: Uint8Array): Uint8Array {
  const photo = anonAadhaarCore.extractPhoto(Array.from(signedData), signedData.length);
  const photoBytes = Uint8Array.from(photo.bytes);
  return new Uint8Array(createHash('sha256').update(photoBytes).digest());
}

/**
 * Extract the circuit's private inputs from a Test QR. Pure and synchronous (the
 * Compact runtime calls the witness synchronously). `now` defaults to the current
 * time; tests inject a fixed clock.
 */
export function extractAadhaarAttrs(qrData: string, now: Date = new Date()): AadhaarAttrs {
  const signedData = decodeSignedData(qrData);
  const id = anonAadhaarCore.returnFullId(signedData) as Record<string, string>;

  const ageYears = computeAgeYears(id.DOB ?? '', now);
  const jurisdictionCode = deriveJurisdictionCode(id.PinCode ?? '');
  const nullifier = computeNullifier(signedData);

  return {
    // Widths are enforced by the circuit's Uint<8>/Uint<16> descriptors; clamp
    // defensively so a bad QR throws above rather than overflowing here.
    ageYears: BigInt(Math.min(ageYears, 255)),
    jurisdictionCode: BigInt(Math.min(jurisdictionCode, 65535)),
    nullifier,
  };
}

/**
 * Build the `Witnesses` object the Minokawa `Contract` is constructed with. The
 * witness reads the private-state QR and returns the extracted attributes; private
 * state is passed through unchanged.
 */
export function createNivaanWitnesses(now: Date = new Date()): Witnesses<NivaanPrivateState> {
  return {
    getAadhaarTestProof(context) {
      const attrs = extractAadhaarAttrs(context.privateState.aadhaarQrData, now);
      return [context.privateState, attrs];
    },
  };
}
