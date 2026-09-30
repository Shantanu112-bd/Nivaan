import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type AadhaarAttrs = { ageYears: bigint;
                             jurisdictionCode: bigint;
                             nullifier: Uint8Array
                           };

export type CredentialRecord = { eligible: boolean;
                                 jurisdictionCode: bigint;
                                 issuedAtEpoch: bigint;
                                 ttlEpochs: bigint
                               };

export type Witnesses<PS> = {
  getAadhaarTestProof(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, AadhaarAttrs];
}

export type ImpureCircuits<PS> = {
  tick(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveComplianceTier(context: __compactRuntime.CircuitContext<PS>,
                      threshold_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array,
                  threshold_0: bigint,
                  ttlEpochs_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  revoke(context: __compactRuntime.CircuitContext<PS>, did_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkNotRevoked(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  tick(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array,
                  threshold_0: bigint,
                  ttlEpochs_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  revoke(context: __compactRuntime.CircuitContext<PS>, did_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkNotRevoked(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  tick(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveComplianceTier(context: __compactRuntime.CircuitContext<PS>,
                      threshold_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array,
                  threshold_0: bigint,
                  ttlEpochs_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  revoke(context: __compactRuntime.CircuitContext<PS>, did_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkNotRevoked(context: __compactRuntime.CircuitContext<PS>,
                  did_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  credentials: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): CredentialRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, CredentialRecord]>
  };
  revoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  readonly epoch: bigint;
  readonly issuedCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
