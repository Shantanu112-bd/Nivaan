// Live credential validation for NIVAAN (docs/deployment.md preflight).
//
// REAL connection tests, not presence checks: it actually connects to Postgres,
// calls each RPC, derives each key's public artifacts, and checks on-chain funding.
// It NEVER prints a secret value — only derived PUBLIC data (addresses, public keys,
// balances, chain ids) and pass/fail reasons. Safe to run and paste.
//
// Run:  node scripts/validate-env.mjs
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  const tag = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'WARN';
  console.log(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}
const val = (k) => (process.env[k] ?? '').trim();

async function jsonRpc(url, method, params = []) {
  // Soroban's (Go) RPC rejects an empty-array `params` ("cannot unmarshal array
  // into GetHealthRequest"); JSON-RPC allows omitting params for no-arg methods.
  const payload = { jsonrpc: '2.0', id: 1, method };
  if (Array.isArray(params) && params.length > 0) payload.params = params;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

console.log('=== NIVAAN live credential validation ===\n');

// 1. DATABASE_URL — real connect + SELECT 1 via the app's own PrismaPg adapter
{
  const name = 'DATABASE_URL';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const adapter = await new PrismaPg({ connectionString: val(name) }).connect();
      const r = await adapter.queryRaw({ sql: 'SELECT 1 AS ok', args: [], argTypes: [] });
      try { await adapter.dispose?.(); } catch {}
      record(name, JSON.stringify(r).includes('1'), 'PrismaPg adapter connected; SELECT 1 ok');
    } catch (e) {
      const why = e.code === 'ERR_INVALID_URL'
        ? 'malformed connection string — app PrismaPg adapter cannot parse it'
        : (e.code || e.message);
      record(name, false, `PrismaPg connect failed: ${why}`);
    }
  }
}

// 2. SOROBAN_RPC_URL — getHealth + getNetwork passphrase must be TESTNET
{
  const name = 'SOROBAN_RPC_URL';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const health = await jsonRpc(val(name), 'getHealth');
      const net = await jsonRpc(val(name), 'getNetwork');
      const healthy = health?.status === 'healthy';
      const isTestnet = (net?.passphrase || '').includes('Test SDF Network ; September 2015');
      record(name, healthy && isTestnet,
        `status=${health?.status}; passphrase=${isTestnet ? 'TESTNET ✓' : JSON.stringify(net?.passphrase)}`);
    } catch (e) {
      record(name, false, `rpc failed: ${e.message}`);
    }
  }
}

// 3. SEPOLIA_RPC_URL — eth_chainId MUST be 0xaa36a7 (11155111), not mainnet
{
  const name = 'SEPOLIA_RPC_URL';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const hex = await jsonRpc(val(name), 'eth_chainId');
      const chainId = parseInt(hex, 16);
      record(name, chainId === 11155111,
        chainId === 11155111 ? 'chainId 11155111 (Sepolia) ✓' : `chainId ${chainId} — NOT Sepolia (mainnet=1)`);
    } catch (e) {
      record(name, false, `rpc failed: ${e.message}`);
    }
  }
}

// 4. SEPOLIA_DEPLOYER_KEY — derive address; must be funded (pays deploy gas)
{
  const name = 'SEPOLIA_DEPLOYER_KEY';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const { privateKeyToAccount } = await import('viem/accounts');
      const raw = val(name).replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('not a 32-byte hex key');
      const acct = privateKeyToAccount(`0x${raw}`);
      let ok = true;
      let detail = `address ${acct.address.slice(0, 6)}…${acct.address.slice(-4)}`;
      const rpc = val('SEPOLIA_RPC_URL');
      if (rpc) {
        const balHex = await jsonRpc(rpc, 'eth_getBalance', [acct.address, 'latest']);
        const wei = BigInt(balHex);
        ok = wei > 0n;
        detail += `; balance ${Number(wei) / 1e18} ETH${ok ? '' : ' — UNFUNDED'}`;
      }
      record(name, ok, detail);
    } catch (e) {
      record(name, false, `invalid: ${e.message}`);
    }
  }
}

// 5. SOROBAN_TESTNET_SECRET — derive address; must be funded (pays deploy gas)
{
  const name = 'SOROBAN_TESTNET_SECRET';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const { Keypair } = await import('@stellar/stellar-sdk');
      const addr = Keypair.fromSecret(val(name)).publicKey();
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`, {
        signal: AbortSignal.timeout(15000),
      });
      let ok = false;
      let detail = `address ${addr.slice(0, 6)}…${addr.slice(-4)}`;
      if (res.status === 200) {
        const acct = await res.json();
        const native = (acct.balances || []).find((b) => b.asset_type === 'native');
        ok = native && parseFloat(native.balance) > 0;
        detail += `; balance ${native ? native.balance : '0'} XLM${ok ? '' : ' — UNFUNDED'}`;
      } else {
        detail += `; Horizon ${res.status} — account not found (unfunded)`;
      }
      record(name, ok, detail);
    } catch (e) {
      record(name, false, `invalid: ${e.message}`);
    }
  }
}

// 6. BACKEND_ATTESTATION_SIGNING_KEY — parse + derive EVM address & 65-byte pubkey
//    (these are what get baked into the two registries at deploy time)
{
  const name = 'BACKEND_ATTESTATION_SIGNING_KEY';
  if (!val(name)) record(name, false, 'not set');
  else {
    try {
      const { secp256k1 } = await import('@noble/curves/secp256k1.js');
      const { privateKeyToAccount } = await import('viem/accounts');
      const raw = val(name).replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('not 64 hex chars');
      const acct = privateKeyToAccount(`0x${raw}`);
      const pub = Buffer.from(secp256k1.getPublicKey(Buffer.from(raw, 'hex'), false)).toString('hex');
      record(name, pub.length === 130,
        `EVM signer ${acct.address.slice(0, 6)}…${acct.address.slice(-4)}; uncompressed pubkey ${pub.length} hex chars`);
    } catch (e) {
      record(name, false, `invalid: ${e.message}`);
    }
  }
}

// 7. MIDNIGHT_NODE_RPC + PROOF_SERVER_URL — reachability (any HTTP response = reachable)
for (const name of ['MIDNIGHT_NODE_RPC', 'MIDNIGHT_INDEXER_HTTP', 'PROOF_SERVER_URL']) {
  if (!val(name)) { record(name, false, 'not set'); continue; }
  try {
    const res = await fetch(val(name), { signal: AbortSignal.timeout(8000) });
    record(name, res.status > 0, `reachable (HTTP ${res.status})`);
  } catch (e) {
    record(name, false, `unreachable: ${e.cause?.code || e.message}`);
  }
}

// 8. ANON_AADHAAR_TEST_KEY — presence/format (no endpoint to hit)
{
  const name = 'ANON_AADHAAR_TEST_KEY';
  const v = val(name);
  record(name, v.length > 0, v ? `set (${v.length} chars)` : 'NOT SET');
}

// 9. Static secrets — non-empty + minimum length
for (const name of ['ISSUER_ADMIN_KEY', 'DEMO_VERIFIER_KEY', 'SESSION_SECRET']) {
  const v = val(name);
  record(name, v.length >= 16, v ? `set (${v.length} chars)` : (v ? `too short (${v.length})` : 'NOT SET'));
}

const fails = results.filter((r) => r.ok === false);
console.log(`\n=== ${results.length - fails.length}/${results.length} PASS; ${fails.length} FAIL ===`);
if (fails.length) console.log('FAILED: ' + fails.map((f) => f.name).join(', '));
