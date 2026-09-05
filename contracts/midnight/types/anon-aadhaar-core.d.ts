// Type-only shim for @anon-aadhaar/core (v2.4.3).
//
// The published package sets "types": "./src/index.ts" and ships NO compiled .d.ts,
// so TypeScript type-checks the library's raw source — which does not compile under
// this repo's `strict` settings (untyped deps uuid/json-bigint/pako; ArrayBuffer↔
// Buffer casts in prover.ts). `skipLibCheck` only skips *.d.ts, not *.ts, so it
// cannot help here.
//
// This declaration is consumed ONLY by contracts/midnight/tsconfig.json (via its
// scoped `paths`), which type-checks the Midnight witness layer. It is NOT part of
// the Next app's type program and is NOT a runtime alias: at run time (Node / Vitest)
// the real @anon-aadhaar/core module is resolved and used. We declare only the
// surface the witness provider and its tests call — extend as needed.

declare module '@anon-aadhaar/core' {
  // Field order of the Aadhaar Secure QR V2 payload (see the library's utils.ts).
  export enum IdFields {
    Email_mobile_present_bit_indicator_value,
    ReferenceId,
    Name,
    DOB,
    Gender,
    CareOf,
    District,
    Landmark,
    House,
    Location,
    PinCode,
    PostOffice,
    State,
    Street,
    SubDistrict,
    VTC,
    PhoneNumberLast4,
  }

  export function convertBigIntToByteArray(bigInt: bigint): Uint8Array;
  export function decompressByteArray(byteArray: Uint8Array): Uint8Array;
  export function returnFullId(signedData: Uint8Array): { [key: string]: string };
  export function extractPhoto(
    qrDataPadded: number[],
    dataLength: number,
  ): { begin: number; dataLength: number; bytes: number[] };
  export function rawDataToCompressedQR(data: Uint8Array): bigint;
}
