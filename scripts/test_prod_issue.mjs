import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  const BASE_URL = 'https://nivaan-iota.vercel.app';
  console.log('1. Requesting nonce from', BASE_URL);
  const nonceRes = await fetch(`${BASE_URL}/api/auth/nonce`);
  console.log('Nonce HTTP Status:', nonceRes.status);
  const nonceData = await nonceRes.json();
  console.log('Nonce:', nonceData);
  const nonce = nonceData.nonce;

  // 2. Sign with a test private key
  const testPk = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f360318';
  const account = privateKeyToAccount(testPk);
  const walletAddress = account.address;
  const signature = await account.signMessage({ message: nonce });
  console.log('Signed by:', walletAddress);

  // 3. Verify and get cookie
  console.log('2. Verifying signature at /api/auth/verify');
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, nonce, signature }),
  });
  console.log('Verify HTTP Status:', verifyRes.status);
  const cookie = verifyRes.headers.get('set-cookie');
  console.log('Set-Cookie received:', !!cookie);

  // 4. Issue credential with the cookie
  console.log('3. Calling POST /api/credentials/issue');
  const sampleQr = '413980064395675672371227137711583253818588855011140279517448839820612623632349901856184351959999993482778047983380439368130654000523344778832306969762570511482';
  const issueRes = await fetch(`${BASE_URL}/api/credentials/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie || '',
    },
    body: JSON.stringify({
      circuitProofInput: { aadhaarQrData: sampleQr },
      jurisdiction: 'IN',
    }),
  });

  console.log('Issue HTTP Status:', issueRes.status);
  const issueText = await issueRes.text();
  console.log('Issue response body:');
  console.log(issueText);
}

main().catch(console.error);
