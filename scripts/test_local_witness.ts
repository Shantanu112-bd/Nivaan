import { createNivaanWitnesses, extractAadhaarAttrs } from '../contracts/midnight/witnesses.ts';
import * as anonAadhaarCore from '@anon-aadhaar/core';

const enc = new TextEncoder();
function buildTestQr(core: any, opts = { dob: '15-08-1990', pincode: '560001', state: 'Karnataka' }) {
  const fields = new Array(17).fill('x');
  fields[3] = opts.dob; // DOB
  fields[10] = opts.pincode; // PinCode
  fields[12] = opts.state || 'Karnataka';

  const parts = [];
  const pushField = (value: string) => {
    for (const b of enc.encode(value)) parts.push(b);
    parts.push(255);
  };
  pushField('V2');
  for (const field of fields) pushField(field);
  for (const b of enc.encode('PHOTO-TEST')) parts.push(b);

  const signed = new Uint8Array(parts);
  const withSignature = new Uint8Array(signed.length + 256);
  withSignature.set(signed, 0);
  return core.rawDataToCompressedQR(withSignature).toString();
}

async function main() {
  console.log('Testing witnesses directly...');
  console.log('anonAadhaarCore keys:', Object.keys(anonAadhaarCore));
  console.log('anonAadhaarCore.default keys:', anonAadhaarCore.default ? Object.keys(anonAadhaarCore.default) : null);
  const core = (anonAadhaarCore as any).rawDataToCompressedQR
    ? anonAadhaarCore
    : (anonAadhaarCore as any).default;
  const qr = buildTestQr(core);
  console.log('Generated test QR length:', qr.length);
  const attrs = extractAadhaarAttrs(qr, new Date());
  console.log('Extracted Aadhaar attributes successfully:', {
    ageYears: attrs.ageYears.toString(),
    jurisdictionCode: attrs.jurisdictionCode.toString(),
    nullifierHex: Buffer.from(attrs.nullifier).toString('hex').slice(0, 16) + '...',
  });

  const witnesses = createNivaanWitnesses(new Date());
  const proofResult = witnesses.getAadhaarTestProof({
    privateState: { aadhaarQrData: qr },
  });
  console.log('Witnesses getAadhaarTestProof produced:', {
    ageYears: proofResult[1].ageYears.toString(),
    jurisdictionCode: proofResult[1].jurisdictionCode.toString(),
  });
  console.log('ALL LOCAL WITNESS CHECKS PASSED!');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
