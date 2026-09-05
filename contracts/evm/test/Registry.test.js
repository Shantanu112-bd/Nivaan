// Tests for the NIVAAN Sepolia registry (Phase 6 acceptance, docs/roadmap.md line
// 74): a manually-constructed attestation signed with the backend key is ACCEPTED;
// a badly-signed one is REJECTED. Plus the replay guards required by
// docs/security-model.md: duplicate credentialId and stale/future timestamp.
//
// Signatures are minted here with a real secp256k1 key via ethers, over the exact
// digest the contract recomputes (mirrors lib/chains/attestation.ts), so the
// signature check is genuine, never stubbed.

const assert = require('node:assert');
const { ethers } = require('hardhat');

// Deterministic backend signing key (test-only; NOT a real key). 32 nonzero bytes,
// mirroring the Soroban test key — the EVM digest differs, so the signature differs.
const BACKEND_PRIVKEY = '0x' + '11'.repeat(32);
const CHAIN_TAG = 'SEPOLIA';
const MAX_AGE = 300n;

/** keccak256(abi.encodePacked(bytes32, string, bool, uint256)) — the signed digest. */
function attestationDigest(credentialId, result, timestamp) {
  const packed = ethers.solidityPacked(
    ['bytes32', 'string', 'bool', 'uint256'],
    [credentialId, CHAIN_TAG, result, timestamp],
  );
  return ethers.keccak256(packed);
}

/** Sign an attestation with `wallet`, returning the 65-byte r‖s‖v signature. */
async function sign(wallet, credentialId, result, timestamp) {
  const digest = attestationDigest(credentialId, result, timestamp);
  // signMessage over the 32 raw digest bytes applies the EIP-191 prefix, matching
  // the contract's MessageHashUtils.toEthSignedMessageHash(digest).
  return wallet.signMessage(ethers.getBytes(digest));
}

/** Pin the NEXT mined block's timestamp exactly (must be strictly increasing). */
async function setNextBlockTimestamp(t) {
  await ethers.provider.send('evm_setNextBlockTimestamp', [Number(t)]);
}

/** A block timestamp safely ahead of the current chain head (keeps time monotonic). */
async function futureBase() {
  const latest = await ethers.provider.getBlock('latest');
  return BigInt(latest.timestamp) + 1000n;
}

/** Assert a contract call reverts with the named custom error. */
async function expectRevert(promise, name) {
  await assert.rejects(promise, (e) => {
    assert.ok(
      e.message.includes(name),
      `expected revert "${name}", got: ${e.message}`,
    );
    return true;
  });
}

describe('Registry', function () {
  let backend;
  let attacker;
  let registry;

  beforeEach(async function () {
    backend = new ethers.Wallet(BACKEND_PRIVKEY);
    attacker = ethers.Wallet.createRandom();
    const Factory = await ethers.getContractFactory('Registry');
    registry = await Factory.deploy(backend.address);
    await registry.waitForDeployment();
  });

  it('accepts a valid backend-signed attestation and stores it', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const t = await futureBase();
    const sig = await sign(backend, credentialId, true, t);

    await setNextBlockTimestamp(t);
    await registry.submitAttestation(credentialId, true, sig, t);

    const [result, timestamp] = await registry.getResult(credentialId);
    assert.equal(result, true);
    assert.equal(timestamp, t);
    assert.equal(await registry.hasResult(credentialId), true);
  });

  it('rejects a badly-signed attestation (wrong signer)', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const t = await futureBase();
    const sig = await sign(attacker, credentialId, true, t); // attacker, not backend

    await setNextBlockTimestamp(t);
    await expectRevert(
      registry.submitAttestation(credentialId, true, sig, t),
      'InvalidSignature',
    );
    assert.equal(await registry.hasResult(credentialId), false);
  });

  it('rejects a tampered result bit', async function () {
    // Valid signature over result=true, submitted as result=false → digest differs
    // → recovered signer != backend → InvalidSignature. Proves result is signed.
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const t = await futureBase();
    const sig = await sign(backend, credentialId, true, t);

    await setNextBlockTimestamp(t);
    await expectRevert(
      registry.submitAttestation(credentialId, false, sig, t),
      'InvalidSignature',
    );
  });

  it('rejects a duplicate credentialId (replay)', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const t = await futureBase();
    const sig = await sign(backend, credentialId, true, t);

    await setNextBlockTimestamp(t);
    await registry.submitAttestation(credentialId, true, sig, t);

    // A second valid submission for the same credential is a replay.
    await setNextBlockTimestamp(t + 1n);
    await expectRevert(
      registry.submitAttestation(credentialId, true, sig, t),
      'AlreadyRecorded',
    );
  });

  it('rejects a stale timestamp (too far in the past)', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const base = await futureBase();
    const stale = base - MAX_AGE - 1n; // 301s before block time
    const sig = await sign(backend, credentialId, true, stale);

    await setNextBlockTimestamp(base);
    await expectRevert(
      registry.submitAttestation(credentialId, true, sig, stale),
      'StaleTimestamp',
    );
    assert.equal(await registry.hasResult(credentialId), false);
  });

  it('rejects a future timestamp (window is symmetric)', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const base = await futureBase();
    const future = base + MAX_AGE + 1n; // 301s after block time
    const sig = await sign(backend, credentialId, true, future);

    await setNextBlockTimestamp(base);
    await expectRevert(
      registry.submitAttestation(credentialId, true, sig, future),
      'StaleTimestamp',
    );
  });

  it('accepts at the freshness boundary (exactly MAX_AGE old)', async function () {
    const credentialId = ethers.hexlify(ethers.randomBytes(32));
    const base = await futureBase();
    const edge = base - MAX_AGE; // exactly 300s before block time — inclusive
    const sig = await sign(backend, credentialId, true, edge);

    await setNextBlockTimestamp(base);
    await registry.submitAttestation(credentialId, true, sig, edge);

    const [result, timestamp] = await registry.getResult(credentialId);
    assert.equal(result, true);
    assert.equal(timestamp, edge);
  });
});
