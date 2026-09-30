import { createHash } from 'node:crypto';
import * as anonAadhaarCore from '@anon-aadhaar/core';
import type { AadhaarAttrs, Witnesses } from '../contracts/managed/nivaan/contract/index.js';

export class InvalidAadhaarQrError extends Error {
  constructor(message: string) {
    super(`Invalid Aadhaar QR: ${message}`);
    this.name = 'InvalidAadhaarQrError';
  }
}

export interface NivaanPrivateState {
  readonly aadhaarQrData: string;
}

const AADHAAR_SIGNATURE_BYTES = 256;

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

export function deriveJurisdictionCode(pincode: string): number {
  const digits = pincode.trim();
  if (!/^\d{6}$/.test(digits)) {
    throw new InvalidAadhaarQrError(`unrecognised PIN code "${pincode}" (expected 6 digits)`);
  }
  return Number(digits.slice(0, 2));
}

function computeNullifier(signedData: Uint8Array): Uint8Array {
  const photo = anonAadhaarCore.extractPhoto(Array.from(signedData), signedData.length);
  const photoBytes = Uint8Array.from(photo.bytes);
  return new Uint8Array(createHash('sha256').update(photoBytes).digest());
}

export function extractAadhaarAttrs(qrData: string, now: Date = new Date()): AadhaarAttrs {
  const signedData = decodeSignedData(qrData);
  const id = anonAadhaarCore.returnFullId(signedData) as Record<string, string>;

  const ageYears = computeAgeYears(id.DOB ?? '', now);
  const jurisdictionCode = deriveJurisdictionCode(id.PinCode ?? '');
  const nullifier = computeNullifier(signedData);

  return {
    ageYears: BigInt(Math.min(ageYears, 255)),
    jurisdictionCode: BigInt(Math.min(jurisdictionCode, 65535)),
    nullifier,
  };
}

export function createNivaanWitnesses(now: Date = new Date()): Witnesses<NivaanPrivateState> {
  return {
    getAadhaarTestProof(context) {
      const attrs = extractAadhaarAttrs(context.privateState.aadhaarQrData, now);
      return [context.privateState, attrs];
    },
  };
}

export function buildDefaultTestQr(opts: {
  dob?: string;
  pincode?: string;
  state?: string;
  photoSeed?: string;
} = {}): string {
  const { dob = '15-08-1990', pincode = '560001', state = 'Karnataka', photoSeed = 'PHOTO-BLOB-STABLE' } = opts;
  const enc = new TextEncoder();
  const fields = new Array<string>(17).fill('x');
  fields[anonAadhaarCore.IdFields.DOB] = dob;
  fields[anonAadhaarCore.IdFields.PinCode] = pincode;
  fields[anonAadhaarCore.IdFields.State] = state;

  const parts: number[] = [];
  const pushField = (value: string) => {
    for (const b of enc.encode(value)) parts.push(b);
    parts.push(255);
  };
  pushField('V2');
  for (const field of fields) pushField(field);
  for (const b of enc.encode(photoSeed)) parts.push(b);

  const signed = new Uint8Array(parts);
  const withSignature = new Uint8Array(signed.length + 256);
  withSignature.set(signed, 0);
  return anonAadhaarCore.rawDataToCompressedQR(withSignature).toString();
}
