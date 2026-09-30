import { Contract } from '../contracts/midnight/managed/contract/index.js';
import { ConstructorContext, CircuitContext } from '@midnight-ntwrk/compact-runtime';

const witnesses = {
  getAadhaarTestProof: (ctx) => {
    return [ctx.state, { ageYears: 20n, jurisdictionCode: 356n, nullifier: new Uint8Array(32) }];
  }
};

const contract = new Contract(witnesses);
const ctx = new CircuitContext({}); // mock context
const result = contract.circuits.proveComplianceTier(ctx, 18n);
console.log('Result:', result.result);
