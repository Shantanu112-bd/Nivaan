import * as anonAadhaarCore from '@anon-aadhaar/core';
import { createHash } from 'node:crypto';

console.log('Testing anonAadhaarCore in native Node ESM:');
console.log('Type of anonAadhaarCore:', typeof anonAadhaarCore);
console.log('Keys of anonAadhaarCore:', Object.keys(anonAadhaarCore));
console.log('convertBigIntToByteArray directly on namespace:', typeof anonAadhaarCore.convertBigIntToByteArray);
console.log('convertBigIntToByteArray on default:', typeof anonAadhaarCore.default?.convertBigIntToByteArray);

function getCore() {
  const p = anonAadhaarCore;
  if (typeof p?.convertBigIntToByteArray === 'function') return p;
  if (typeof p?.default?.convertBigIntToByteArray === 'function') return p.default;
  if (typeof p?.default?.default?.convertBigIntToByteArray === 'function') return p.default.default;
  return p;
}

const core = getCore();
console.log('Resolved core functions:');
console.log('convertBigIntToByteArray:', typeof core.convertBigIntToByteArray);
console.log('decompressByteArray:', typeof core.decompressByteArray);
console.log('extractPhoto:', typeof core.extractPhoto);
console.log('returnFullId:', typeof core.returnFullId);
console.log('rawDataToCompressedQR:', typeof core.rawDataToCompressedQR);

// Build test QR
const enc = new TextEncoder();
const fields = new Array(17).fill('x');
fields[3] = '15-08-1990';
fields[10] = '560001';
fields[12] = 'Karnataka';

const parts = [];
const pushField = (value) => {
  for (const b of enc.encode(value)) parts.push(b);
  parts.push(255);
};
pushField('V2');
for (const field of fields) pushField(field);
for (const b of enc.encode('PHOTO-TEST')) parts.push(b);

const signed = new Uint8Array(parts);
const withSignature = new Uint8Array(signed.length + 256);
withSignature.set(signed, 0);
const qr = core.rawDataToCompressedQR(withSignature).toString();
console.log('Generated test QR string length:', qr.length);

// Decode and extract
const asBigInt = BigInt(qr);
const packed = core.convertBigIntToByteArray(asBigInt);
const decompressed = core.decompressByteArray(packed);
const signedData = decompressed.slice(0, decompressed.length - 256);
const id = core.returnFullId(signedData);
console.log('Extracted DOB:', id.DOB);
console.log('Extracted PinCode:', id.PinCode);

const photo = core.extractPhoto(Array.from(signedData), signedData.length);
const nullifier = createHash('sha256').update(Uint8Array.from(photo.bytes)).digest('hex');
console.log('Computed nullifier:', nullifier);

console.log('MIMIC TEST PASSED!');
