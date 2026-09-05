//! Integration tests for the NIVAAN Soroban registry (Phase 6 acceptance,
//! docs/roadmap.md line 74): a manually-constructed attestation signed with the
//! backend key is ACCEPTED; a badly-signed one is REJECTED. Plus the replay guards
//! required by docs/security-model.md: duplicate credentialId and stale timestamp.
//!
//! This is an integration test (its own std crate), so it can freely use k256/sha2
//! to mint a real recoverable secp256k1 signature over the exact digest the contract
//! recomputes — the signature check is genuine, never stubbed.

use k256::ecdsa::SigningKey;
use nivaan_soroban_registry::{Error, Registry, RegistryClient, VerificationResult};
use sha2::{Digest, Sha256};
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{Address, BytesN, Env};

const CHAIN_TAG: &[u8] = b"SOROBAN";
/// Fixed ledger time for the tests (unix seconds). Deterministic — no clock reads.
const LEDGER_NOW: u64 = 1_700_000_000;

/// A deterministic backend signing key (test-only; NOT a real key). 32 nonzero bytes.
fn backend_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[0x11u8; 32].into()).expect("valid scalar")
}

/// 65-byte uncompressed public key (0x04 ‖ X ‖ Y) for a signing key.
fn pubkey_65(env: &Env, sk: &SigningKey) -> BytesN<65> {
    let point = sk.verifying_key().to_encoded_point(false); // uncompressed
    let bytes = point.as_bytes();
    assert_eq!(bytes.len(), 65, "uncompressed secp256k1 pubkey is 65 bytes");
    let mut arr = [0u8; 65];
    arr.copy_from_slice(bytes);
    BytesN::from_array(env, &arr)
}

/// Rebuild the canonical attestation message (mirrors lib/chains/attestation.ts).
fn message(credential_id: &[u8; 32], result: bool, timestamp: u64) -> Vec<u8> {
    let mut m = Vec::with_capacity(32 + CHAIN_TAG.len() + 1 + 8);
    m.extend_from_slice(credential_id);
    m.extend_from_slice(CHAIN_TAG);
    m.push(if result { 1u8 } else { 0u8 });
    m.extend_from_slice(&timestamp.to_be_bytes());
    m
}

/// Sign an attestation with `sk`, returning the 65-byte r‖s‖recovery signature the
/// contract expects.
fn sign_attestation(
    env: &Env,
    sk: &SigningKey,
    credential_id: &[u8; 32],
    result: bool,
    timestamp: u64,
) -> BytesN<65> {
    let digest = Sha256::digest(message(credential_id, result, timestamp));
    let (sig, recid) = sk
        .sign_prehash_recoverable(&digest)
        .expect("sign prehash");
    let mut out = [0u8; 65];
    out[..64].copy_from_slice(&sig.to_bytes());
    out[64] = recid.to_byte();
    BytesN::from_array(env, &out)
}

/// Fresh env with ledger time pinned to LEDGER_NOW and the backend key configured.
/// Returns the env, the deployed contract id, and the backend signing key. The
/// client is (re)built per test to keep its borrow local.
fn setup() -> (Env, Address, SigningKey) {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = LEDGER_NOW);
    let contract_id = env.register(Registry, ());
    let sk = backend_signing_key();
    let client = RegistryClient::new(&env, &contract_id);
    client.init(&pubkey_65(&env, &sk));
    (env, contract_id, sk)
}

#[test]
fn accepts_a_valid_backend_signed_attestation() {
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0xAB; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    let sig = sign_attestation(&env, &sk, &cred, true, LEDGER_NOW);

    client.submit_attestation(&cred_id, &true, &sig, &LEDGER_NOW);

    assert_eq!(
        client.get_result(&cred_id),
        Some(VerificationResult { result: true, timestamp: LEDGER_NOW })
    );
}

#[test]
fn rejects_a_badly_signed_attestation() {
    // Signed by an ATTACKER key, not the configured backend key → InvalidSignature.
    let (env, contract_id, _backend) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let attacker = SigningKey::from_bytes(&[0x22u8; 32].into()).unwrap();
    let cred = [0xCD; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    let sig = sign_attestation(&env, &attacker, &cred, true, LEDGER_NOW);

    let res = client.try_submit_attestation(&cred_id, &true, &sig, &LEDGER_NOW);
    assert_eq!(res, Err(Ok(Error::InvalidSignature)));
    // Nothing recorded for a rejected attestation.
    assert_eq!(client.get_result(&cred_id), None);
}

#[test]
fn rejects_a_tampered_result_bit() {
    // Valid signature over result=true, but submitted as result=false → the recovered
    // signer won't match (digest differs) → InvalidSignature. Proves result is signed.
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0xEF; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    let sig = sign_attestation(&env, &sk, &cred, true, LEDGER_NOW);

    let res = client.try_submit_attestation(&cred_id, &false, &sig, &LEDGER_NOW);
    assert_eq!(res, Err(Ok(Error::InvalidSignature)));
}

#[test]
fn rejects_a_duplicate_credential_id() {
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0x01; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    let sig = sign_attestation(&env, &sk, &cred, true, LEDGER_NOW);

    client.submit_attestation(&cred_id, &true, &sig, &LEDGER_NOW);
    // A second valid submission for the same credential is a replay.
    let res = client.try_submit_attestation(&cred_id, &true, &sig, &LEDGER_NOW);
    assert_eq!(res, Err(Ok(Error::AlreadyRecorded)));
}

#[test]
fn rejects_a_stale_timestamp() {
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0x02; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    // 301s in the past — just outside the 300s window.
    let stale = LEDGER_NOW - 301;
    let sig = sign_attestation(&env, &sk, &cred, true, stale);

    let res = client.try_submit_attestation(&cred_id, &true, &sig, &stale);
    assert_eq!(res, Err(Ok(Error::StaleTimestamp)));
    assert_eq!(client.get_result(&cred_id), None);
}

#[test]
fn rejects_a_future_timestamp() {
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0x03; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    // 301s in the future — the window is symmetric.
    let future = LEDGER_NOW + 301;
    let sig = sign_attestation(&env, &sk, &cred, true, future);

    let res = client.try_submit_attestation(&cred_id, &true, &sig, &future);
    assert_eq!(res, Err(Ok(Error::StaleTimestamp)));
}

#[test]
fn accepts_at_the_freshness_boundary() {
    // Exactly MAX_AGE_SECONDS old is still accepted (boundary is inclusive).
    let (env, contract_id, sk) = setup();
    let client = RegistryClient::new(&env, &contract_id);
    let cred = [0x04; 32];
    let cred_id = BytesN::from_array(&env, &cred);
    let edge = LEDGER_NOW - 300;
    let sig = sign_attestation(&env, &sk, &cred, true, edge);

    client.submit_attestation(&cred_id, &true, &sig, &edge);
    assert_eq!(
        client.get_result(&cred_id),
        Some(VerificationResult { result: true, timestamp: edge })
    );
}
