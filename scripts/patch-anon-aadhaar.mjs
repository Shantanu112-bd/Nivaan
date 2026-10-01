import fs from 'node:fs';
import path from 'node:path';

const pkgPath = path.resolve('node_modules/@anon-aadhaar/core/package.json');
const dtsPath = path.resolve('node_modules/@anon-aadhaar/core/dist/index.d.ts');

if (fs.existsSync(pkgPath)) {
  const dtsContent = `export enum IdFields {
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

export declare function convertBigIntToByteArray(bigInt: bigint): Uint8Array;
export declare function decompressByteArray(byteArray: Uint8Array): Uint8Array;
export declare function returnFullId(signedData: Uint8Array): { [key: string]: string };
export declare function extractPhoto(
  qrDataPadded: number[],
  dataLength: number,
): { begin: number; dataLength: number; bytes: number[] };
export declare function rawDataToCompressedQR(data: Uint8Array): bigint;

declare const _default: {
  IdFields: typeof IdFields;
  convertBigIntToByteArray: typeof convertBigIntToByteArray;
  decompressByteArray: typeof decompressByteArray;
  returnFullId: typeof returnFullId;
  extractPhoto: typeof extractPhoto;
  rawDataToCompressedQR: typeof rawDataToCompressedQR;
  [key: string]: any;
};
export default _default;
`;

  fs.writeFileSync(dtsPath, dtsContent, 'utf-8');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.types = './dist/index.d.ts';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  console.log('[patch-anon-aadhaar] Patched @anon-aadhaar/core package.json and created dist/index.d.ts');
} else {
  console.log('[patch-anon-aadhaar] @anon-aadhaar/core not installed, skipping patch.');
}
