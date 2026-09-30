// Phase 7 LIVE acceptance test
// Executes the complete end-to-end flow:
// 1. Auth session creation
// 2. Credential issuance through Minokawa circuit
// 3. Proof generation and verification
// 4. Cross-chain attestation to live Sepolia & Soroban registries

import path from 'node:path';
import dotenv from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma, ChainTarget, CredentialStatus, ProofStatus } from '@/lib/db/prisma';
import { issueCredential, evaluateIssuanceCircuit } from '@/lib/services/credentialService';
import { createProofRequest, verifyProof } from '@/lib/services/proofService';
import { verifyAndAttest, getVerificationResult } from '@/lib/services/verificationService';
import { buildDefaultTestQr } from '@/midnight-scaffold/src/witnesses';
import { hashConsentText, CONSENT_TEXT_VERSIONS } from '@/lib/services/consentService';
import { MVP_POLICY_ID } from '@/lib/config/policy';

describe('Phase 7 LIVE — Full End-to-End Acceptance Cycle', () => {
  const testWallet = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const testDid = `did:nivaan:${Date.now()}`;
  const validConsentHash = hashConsentText(CONSENT_TEXT_VERSIONS.v1);
  let credentialId: string;
  let proofRequestId: string;
  let verificationId: string;

  it('Step 1: Evaluates Minokawa compliance circuit and issues credential in DB', async () => {
    const qrData = buildDefaultTestQr({ dob: '15-08-1990', pincode: '560001' });
    const approved = await evaluateIssuanceCircuit({ aadhaarQrData: qrData });
    expect(approved).toBe(true);

    const credential = await issueCredential({
      did: testDid,
      ownerWallet: testWallet,
      jurisdiction: 'IN',
      circuitApproved: approved,
    });
    expect(credential).toBeDefined();
    expect(credential.status).toBe(CredentialStatus.ACTIVE);
    credentialId = credential.id;
  });

  it('Step 2: Creates proof request with valid consent hash and marks READY', async () => {
    const proofRes = await createProofRequest({
      credentialId,
      ownerWallet: testWallet,
      targetChain: ChainTarget.SEPOLIA,
      policyId: MVP_POLICY_ID,
      consentHash: validConsentHash,
    });
    expect(proofRes.status).toBe('pending');
    proofRequestId = proofRes.proofRequestId;

    // Transition proof request to READY
    await prisma.proofRequest.update({
      where: { id: proofRequestId },
      data: { status: ProofStatus.READY },
    });

    const isVerified = await verifyProof(proofRequestId);
    expect(isVerified).toBe(true);
  });

  it('Step 3: Verifies proof and attests to deployed Sepolia registry', async () => {
    const attestRes = await verifyAndAttest({
      proofRequestId,
      ownerWallet: testWallet,
    });
    expect(attestRes.status).toBe('pending');
    verificationId = attestRes.verificationId;

    const resultView = await getVerificationResult(verificationId);
    expect(resultView.result).toBe(true);
    expect(resultView.chain).toBe(ChainTarget.SEPOLIA);
    expect(resultView.attestationSig).toBeDefined();
    expect(resultView.attestationSig!.length).toBeGreaterThan(0);
  });

  it('Step 4: Executes cross-chain attestation to deployed Soroban registry', async () => {
    const sorobanProofRes = await createProofRequest({
      credentialId,
      ownerWallet: testWallet,
      targetChain: ChainTarget.SOROBAN,
      policyId: MVP_POLICY_ID,
      consentHash: validConsentHash,
    });

    await prisma.proofRequest.update({
      where: { id: sorobanProofRes.proofRequestId },
      data: { status: ProofStatus.READY },
    });

    const sorobanAttestRes = await verifyAndAttest({
      proofRequestId: sorobanProofRes.proofRequestId,
      ownerWallet: testWallet,
    });

    const sorobanView = await getVerificationResult(sorobanAttestRes.verificationId);
    expect(sorobanView.result).toBe(true);
    expect(sorobanView.chain).toBe(ChainTarget.SOROBAN);
    expect(sorobanView.attestationSig).toBeDefined();
  });
});
