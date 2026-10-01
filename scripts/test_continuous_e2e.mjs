import { privateKeyToAccount } from 'viem/accounts';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const CONSENT_HASH = '928659ce28095428e9ebef27f48ad9cfb942b427a2f1d20ba87b8a74de65b9a2';
const POLICY_ID = 'kyc_tier_1';
const SAMPLE_QR = '413980064395675672371227137711583253818588855011140279517448839820612623632349901856184351959999993482778047983380439368130654000523344778832306969762570511482';

// Fresh test account per run
const testPk = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const account = privateKeyToAccount(testPk);
const walletAddress = account.address;

console.log(`=== Starting E2E Flow with wallet: ${walletAddress} against ${BASE_URL} ===\n`);

async function step(name, fn) {
  console.log(`>>> STEP: ${name}`);
  const start = Date.now();
  const res = await fn();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`[Elapsed: ${elapsed}s]\n`);
  return res;
}

async function main() {
  // 1. Authenticate (Nonce + Verify)
  let cookie = '';
  await step('1. Request Nonce', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/nonce`);
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));

    const signature = await account.signMessage({ message: body.nonce });
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, nonce: body.nonce, signature }),
    });
    console.log(`Verify HTTP ${verifyRes.status}`);
    cookie = verifyRes.headers.get('set-cookie') || '';
  });

  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie,
  };

  // 2. Issue Credential
  let credentialId = '';
  await step('2. Issue Credential (/api/credentials/issue)', async () => {
    const res = await fetch(`${BASE_URL}/api/credentials/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        circuitProofInput: { aadhaarQrData: SAMPLE_QR },
        jurisdiction: 'IN',
      }),
    });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    credentialId = body.credentialId;
    if (!credentialId) throw new Error('No credentialId returned');
  });

  // 3. Generate Proof for Soroban
  let sorobanProofId = '';
  await step('3. Generate Proof for Soroban (/api/proofs/generate)', async () => {
    const res = await fetch(`${BASE_URL}/api/proofs/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        credentialId,
        targetChain: 'soroban',
        policyId: POLICY_ID,
        consentHash: CONSENT_HASH,
      }),
    });
    const status = res.status;
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.error(`HTTP ${status} Non-JSON Response:`, text);
      throw new Error(`Non-JSON response: ${text.substring(0, 300)}`);
    }
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    sorobanProofId = body.proofRequestId;
  });

  // 4. Confirm Status Reaches READY for Soroban Proof
  await step('4. Check Soroban Proof Status (/api/proofs/:id/status)', async () => {
    const res = await fetch(`${BASE_URL}/api/proofs/${sorobanProofId}/status`, { headers });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    if (body.status !== 'ready') {
      throw new Error(`Expected status to be ready, got: ${body.status}`);
    }
  });

  // 5. Verify and Attest on Soroban
  let sorobanVerificationId = '';
  await step('5. Verify on Soroban (/api/verify)', async () => {
    const res = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proofRequestId: sorobanProofId }),
    });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    sorobanVerificationId = body.verificationId;
  });

  // 6. Check Soroban Verification Result
  await step('6. Check Soroban Verification Result (/api/verify/:id/result)', async () => {
    const res = await fetch(`${BASE_URL}/api/verify/${sorobanVerificationId}/result`, { headers });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    if (body.result !== true) {
      throw new Error(`Expected verification result true, got: ${body.result}`);
    }
  });

  // 7. Generate Proof for Sepolia with the SAME credential
  let sepoliaProofId = '';
  await step('7. Generate Proof for Sepolia (/api/proofs/generate)', async () => {
    const res = await fetch(`${BASE_URL}/api/proofs/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        credentialId,
        targetChain: 'sepolia',
        policyId: POLICY_ID,
        consentHash: CONSENT_HASH,
      }),
    });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    sepoliaProofId = body.proofRequestId;
  });

  // 8. Confirm Status Reaches READY for Sepolia Proof
  await step('8. Check Sepolia Proof Status (/api/proofs/:id/status)', async () => {
    const res = await fetch(`${BASE_URL}/api/proofs/${sepoliaProofId}/status`, { headers });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    if (body.status !== 'ready') {
      throw new Error(`Expected status to be ready, got: ${body.status}`);
    }
  });

  // 9. Verify and Attest on Sepolia
  let sepoliaVerificationId = '';
  await step('9. Verify on Sepolia (/api/verify)', async () => {
    const res = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proofRequestId: sepoliaProofId }),
    });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    sepoliaVerificationId = body.verificationId;
  });

  // 10. Check Sepolia Verification Result
  await step('10. Check Sepolia Verification Result (/api/verify/:id/result)', async () => {
    const res = await fetch(`${BASE_URL}/api/verify/${sepoliaVerificationId}/result`, { headers });
    const status = res.status;
    const body = await res.json();
    console.log(`HTTP ${status}`, JSON.stringify(body, null, 2));
    if (body.result !== true) {
      throw new Error(`Expected verification result true, got: ${body.result}`);
    }
  });

  console.log('\n========================================');
  console.log('✅ ALL STEPS PASSED VERIFIED END-TO-END!');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\n❌ FAILURE IN E2E FLOW:', err);
  process.exit(1);
});
