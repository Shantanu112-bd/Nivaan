// Unit tests for the Minokawa credential circuit (contracts/midnight/nivaan.compact)
// and its TypeScript witness provider (contracts/midnight/witnesses.ts).
//
// docs/roadmap.md Phase 5 acceptance + docs/security-model.md ("circuit logic is
// the real credential-forgery control; tests must cover valid AND invalid witness
// inputs"). These execute the *compiled* circuit locally via @midnight-ntwrk/
// compact-runtime — no Proof Server, testnet, or midnight-js required (local
// circuit execution proves the LOGIC; proof generation is only needed for on-chain
// submission, which is the separately-blocked live step).
//
// Two layers are exercised:
//   1. Circuit logic — with a controllable witness returning fixed attributes, so
//      each branch (eligible/ineligible, sealed, revoked, expired) is deterministic.
//   2. Witness provider — extractAadhaarAttrs against a synthetic Anon Aadhaar V2
//      Test QR built with @anon-aadhaar/core's own primitives, then wired end-to-end
//      (QR → witness → circuit).

import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import * as anonAadhaarCore from '@anon-aadhaar/core';
import { describe, expect, it } from 'vitest';

import {
  Contract,
  ledger,
  type AadhaarAttrs,
  type Ledger,
  type Witnesses,
} from '../../contracts/midnight/managed/contract/index.js';
import {
  computeAgeYears,
  createNivaanWitnesses,
  deriveJurisdictionCode,
  extractAadhaarAttrs,
  InvalidAadhaarQrError,
  type NivaanPrivateState,
} from '../../contracts/midnight/witnesses';

// --- harness ---------------------------------------------------------------

const ZERO_COIN_KEY = '0'.repeat(64);
const enc = new TextEncoder();

/** 32-byte value from a label (DID / nullifier seed). */
function bytes32(label: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(enc.encode(label).slice(0, 32));
  return out;
}

/** Boot a fresh contract instance and return the initial circuit context. */
function boot<PS>(witnesses: Witnesses<PS>, privateState: PS) {
  const contract = new Contract<PS>(witnesses);
  const { currentContractState, currentPrivateState, currentZswapLocalState } =
    contract.initialState(createConstructorContext(privateState, ZERO_COIN_KEY));
  const ctx = createCircuitContext(
    dummyContractAddress(),
    currentZswapLocalState,
    currentContractState,
    currentPrivateState,
  );
  return { contract, ctx };
}

/** Public ledger view for the current context state. */
function readLedger(ctx: CircuitContext): Ledger {
  return ledger(ctx.currentQueryContext.state);
}

// --- controllable witness (circuit-logic layer) ----------------------------

interface AttrsPrivateState {
  readonly attrs: AadhaarAttrs;
}

function attrsWitnesses(): Witnesses<AttrsPrivateState> {
  return {
    getAadhaarTestProof: (context) => [context.privateState, context.privateState.attrs],
  };
}

function attrs(ageYears: number, jurisdictionCode = 42, seed = 'nullifier'): AadhaarAttrs {
  return {
    ageYears: BigInt(ageYears),
    jurisdictionCode: BigInt(jurisdictionCode),
    nullifier: bytes32(seed),
  };
}

function bootWithAttrs(a: AadhaarAttrs) {
  return boot(attrsWitnesses(), { attrs: a });
}

// --- synthetic Test QR builder (witness-provider layer) ---------------------

/**
 * Build an Anon Aadhaar Secure QR V2 payload with controllable fields, using
 * @anon-aadhaar/core's own compression so it round-trips through the same decode
 * path a real Test QR does. Layout: "V2" + 17 delimiter-separated fields (DOB at
 * index 3, PIN at 10, State at 12) = 18 `0xff` delimiters, then photo bytes, then a
 * 256-byte (dummy) signature — matching generateArgs' `slice(0, len - 256)`.
 */
function buildTestQr(opts: {
  dob: string;
  pincode: string;
  state?: string;
  photoSeed?: string;
}): string {
  const { dob, pincode, state = 'Karnataka', photoSeed = 'PHOTO-BLOB-STABLE' } = opts;
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
  for (const b of enc.encode(photoSeed)) parts.push(b); // photo after the 18th delimiter

  const signed = new Uint8Array(parts);
  const withSignature = new Uint8Array(signed.length + 256);
  withSignature.set(signed, 0);
  return anonAadhaarCore.rawDataToCompressedQR(withSignature).toString();
}

const AS_OF = new Date(Date.UTC(2026, 8, 5)); // 2026-09-05, fixed clock for age tests

// ===========================================================================
// 1. Circuit logic
// ===========================================================================

describe('Minokawa circuit — proveComplianceTier (age gate, nothing disclosed but the boolean)', () => {
  it('returns true when age meets the threshold', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    expect(contract.circuits.proveComplianceTier(ctx, 18n).result).toBe(true);
  });

  it('returns false when age is below the threshold (invalid witness input)', () => {
    const { contract, ctx } = bootWithAttrs(attrs(16));
    expect(contract.circuits.proveComplianceTier(ctx, 18n).result).toBe(false);
  });

  it('treats the threshold as inclusive (age == threshold passes)', () => {
    const { contract, ctx } = bootWithAttrs(attrs(18));
    expect(contract.circuits.proveComplianceTier(ctx, 18n).result).toBe(true);
  });
});

describe('Minokawa circuit — issueCredential (sealed, DID-bound ledger write)', () => {
  it('issues for an eligible holder and writes the sealed record', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25, 77));
    const did = bytes32('did-alice');

    const { result, context } = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    expect(result).toBe(true);

    const led = readLedger(context);
    expect(led.credentials.member(did)).toBe(true);
    expect(led.issuedCount).toBe(1n);
    const record = led.credentials.lookup(did);
    expect(record.eligible).toBe(true);
    expect(record.jurisdictionCode).toBe(77n);
    expect(record.ttlEpochs).toBe(100n);
    expect(record.issuedAtEpoch).toBe(0n);
  });

  it('records eligible=false for an ineligible holder (returns false)', () => {
    const { contract, ctx } = bootWithAttrs(attrs(16));
    const did = bytes32('did-minor');

    const { result, context } = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    expect(result).toBe(false);
    expect(readLedger(context).credentials.lookup(did).eligible).toBe(false);
  });

  it('is sealed: a second issue for the same DID is rejected', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    const did = bytes32('did-once');

    const { context } = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    expect(() => contract.circuits.issueCredential(context, did, 18n, 100n)).toThrow();
  });
});

describe('Minokawa circuit — checkNotRevoked (verification-time control)', () => {
  it('is true for a fresh, eligible, unexpired credential', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    const did = bytes32('did-live');
    const issued = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    expect(contract.circuits.checkNotRevoked(issued.context, did).result).toBe(true);
  });

  it('is false for a DID that was never issued', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    expect(contract.circuits.checkNotRevoked(ctx, bytes32('did-absent')).result).toBe(false);
  });

  it('is false after revocation', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    const did = bytes32('did-revoked');
    const issued = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    const revoked = contract.circuits.revoke(issued.context, did);
    expect(contract.circuits.checkNotRevoked(revoked.context, did).result).toBe(false);
  });

  it('is false once the Counter-relative TTL has elapsed', () => {
    const { contract, ctx } = bootWithAttrs(attrs(25));
    const did = bytes32('did-expiring');
    const issued = contract.circuits.issueCredential(ctx, did, 18n, 2n); // TTL = 2 epochs
    expect(contract.circuits.checkNotRevoked(issued.context, did).result).toBe(true);
    const afterFirstTick = contract.circuits.tick(issued.context);
    const afterSecondTick = contract.circuits.tick(afterFirstTick.context); // epoch == issuedAt + ttl
    expect(contract.circuits.checkNotRevoked(afterSecondTick.context, did).result).toBe(false);
  });

  it('is false for a recorded-but-ineligible credential', () => {
    const { contract, ctx } = bootWithAttrs(attrs(16));
    const did = bytes32('did-ineligible');
    const issued = contract.circuits.issueCredential(ctx, did, 18n, 100n);
    expect(contract.circuits.checkNotRevoked(issued.context, did).result).toBe(false);
  });
});

// ===========================================================================
// 2. Witness provider (extractAadhaarAttrs + helpers)
// ===========================================================================

describe('witness provider — computeAgeYears', () => {
  it('computes whole years from a DD-MM-YYYY DOB', () => {
    expect(computeAgeYears('15-08-1990', AS_OF)).toBe(36);
  });

  it('has not yet counted a birthday later this year', () => {
    expect(computeAgeYears('31-12-2000', AS_OF)).toBe(25); // birthday (Dec) after Sep
  });

  it('counts a birthday that has already passed this year', () => {
    expect(computeAgeYears('01-01-2000', AS_OF)).toBe(26);
  });

  it('throws on an unparseable DOB rather than guessing', () => {
    expect(() => computeAgeYears('1990', AS_OF)).toThrow(InvalidAadhaarQrError);
  });
});

describe('witness provider — deriveJurisdictionCode', () => {
  it('takes the first two digits of the PIN as a coarse postal region', () => {
    expect(deriveJurisdictionCode('560001')).toBe(56);
  });

  it('throws on a non-6-digit PIN', () => {
    expect(() => deriveJurisdictionCode('56')).toThrow(InvalidAadhaarQrError);
  });
});

describe('witness provider — extractAadhaarAttrs', () => {
  it('extracts age, jurisdiction and a 32-byte nullifier from a Test QR', () => {
    const qr = buildTestQr({ dob: '15-08-1990', pincode: '560001' });
    const a = extractAadhaarAttrs(qr, AS_OF);
    expect(a.ageYears).toBe(36n);
    expect(a.jurisdictionCode).toBe(56n);
    expect(a.nullifier).toBeInstanceOf(Uint8Array);
    expect(a.nullifier.length).toBe(32);
  });

  it('produces a stable nullifier for the same identity photo', () => {
    const a = extractAadhaarAttrs(buildTestQr({ dob: '15-08-1990', pincode: '560001' }), AS_OF);
    const b = extractAadhaarAttrs(buildTestQr({ dob: '15-08-1990', pincode: '560001' }), AS_OF);
    expect(Buffer.from(a.nullifier).equals(Buffer.from(b.nullifier))).toBe(true);
  });

  it('produces a different nullifier for a different identity photo', () => {
    const a = extractAadhaarAttrs(buildTestQr({ dob: '15-08-1990', pincode: '560001', photoSeed: 'ID-A' }), AS_OF);
    const b = extractAadhaarAttrs(buildTestQr({ dob: '15-08-1990', pincode: '560001', photoSeed: 'ID-B' }), AS_OF);
    expect(Buffer.from(a.nullifier).equals(Buffer.from(b.nullifier))).toBe(false);
  });

  it('throws on a QR that is not a valid integer string', () => {
    expect(() => extractAadhaarAttrs('not-a-number', AS_OF)).toThrow(InvalidAadhaarQrError);
  });
});

// ===========================================================================
// 3. End-to-end: real witness provider driving the circuit
// ===========================================================================

describe('Minokawa — QR → witness provider → circuit', () => {
  function bootWithQr(qrData: string) {
    const privateState: NivaanPrivateState = { aadhaarQrData: qrData };
    return boot(createNivaanWitnesses(AS_OF), privateState);
  }

  it('an adult Test QR passes the tier gate and issues an eligible credential', () => {
    const { contract, ctx } = bootWithQr(buildTestQr({ dob: '15-08-1990', pincode: '560001' }));
    expect(contract.circuits.proveComplianceTier(ctx, 18n).result).toBe(true);

    const did = bytes32('did-e2e-adult');
    const { result, context } = contract.circuits.issueCredential(ctx, did, 18n, 365n);
    expect(result).toBe(true);
    expect(readLedger(context).credentials.lookup(did).jurisdictionCode).toBe(56n);
  });

  it('a minor Test QR fails the tier gate', () => {
    const { contract, ctx } = bootWithQr(buildTestQr({ dob: '01-01-2015', pincode: '560001' }));
    expect(contract.circuits.proveComplianceTier(ctx, 18n).result).toBe(false);
  });
});
