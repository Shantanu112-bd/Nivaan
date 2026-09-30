#![no_std]
//! NIVAAN Soroban registry contract (Phase 6; docs/architecture.md §8).
//!
//! Cross-chain verification is backend-attested (ADR-001, "Path C"): Midnight's
//! Halo2/Pluto-Eris proof system cannot be verified on Soroban, so the backend
//! verifies the Midnight proof off-chain, then signs a compact attestation with the
//! singular `BACKEND_ATTESTATION_SIGNING_KEY` (the root of trust). THIS CONTRACT
//! NEVER RE-VERIFIES THE ZK PROOF. It only checks that a submission carries a valid
//! backend signature over the canonical attestation fields, records the result once,
//! and rejects replays.
//!
//! The signed digest MUST match `lib/chains/attestation.ts` byte-for-byte:
//!   digest = sha256( credentialId32 ‖ "SOROBAN" ‖ resultByte ‖ u64_be(timestamp) )
//! where credentialId32 = SHA-256(utf8(DB cuid)) (32 bytes), chain tag is ASCII
//! "SOROBAN" (7 bytes), resultByte is 0x01/0x00, timestamp is unix SECONDS as a
//! big-endian u64. The signature is r‖s (64 bytes) followed by a 1-byte recovery id
//! (65 bytes total), mirroring the EVM 65-byte convention; the recovered secp256k1
//! public key must equal the configured backend key.

use soroban_sdk::{
    contract, contractevent, contracterror, contractimpl, contracttype, Bytes, BytesN, Env,
};

/// Replay/staleness window — mirrors `ATTESTATION_MAX_AGE_SECONDS` (300) in
/// lib/chains/attestation.ts. A timestamp further than this from ledger time
/// (past OR future) is rejected.
const MAX_AGE_SECONDS: u64 = 300;

/// ASCII chain tag bound into the signed digest, so a signature minted for one
/// chain cannot be replayed on another. Mirrors `chainTagFor('soroban')`.
const CHAIN_TAG: &[u8] = b"SOROBAN";

/// A recorded verification outcome for one credential.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationResult {
    pub result: bool,
    pub timestamp: u64,
}

/// Event emitted when a verification result is recorded. The leading topic is the
/// symbol `attest` (the struct name, snake-cased); `credential_id` is an indexed
/// topic; `result` and `timestamp` are the event data.
#[contractevent]
pub struct Attest {
    #[topic]
    pub credential_id: BytesN<32>,
    pub result: bool,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    /// Configured backend secp256k1 public key: 65-byte uncompressed, 0x04-prefixed.
    Backend,
    /// credentialId32 -> VerificationResult
    Result(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// init() called on an already-configured contract.
    AlreadyInitialized = 1,
    /// submit_attestation() before init().
    NotInitialized = 2,
    /// A result for this credentialId already exists (replay).
    AlreadyRecorded = 3,
    /// timestamp is outside +/- MAX_AGE_SECONDS of ledger time (replay/staleness).
    StaleTimestamp = 4,
    /// Recovered signer does not match the configured backend key (bad signature).
    InvalidSignature = 5,
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// One-time configuration of the backend attestation public key (ADR-001 root of
    /// trust): a 65-byte uncompressed secp256k1 key (0x04 ‖ X32 ‖ Y32). Fails if the
    /// contract is already initialized.
    pub fn init(env: Env, backend_pubkey: BytesN<65>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Backend) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Backend, &backend_pubkey);
        Ok(())
    }

    /// The configured backend public key, or None if the contract is uninitialized.
    pub fn backend_key(env: Env) -> Option<BytesN<65>> {
        env.storage().instance().get(&DataKey::Backend)
    }

    /// Record a verification result iff `signature` is a valid backend signature over
    /// the canonical digest for (`credential_id`, `result`, `timestamp`).
    ///
    /// `signature` is 65 bytes: r‖s (64) ‖ recovery_id (1). Rejects a duplicate
    /// `credential_id` (AlreadyRecorded) and a `timestamp` outside the freshness
    /// window (StaleTimestamp) BEFORE the signature check, then verifies the signer
    /// is the configured backend key (InvalidSignature otherwise). On success, stores
    /// the result and emits an `attest` event.
    pub fn submit_attestation(
        env: Env,
        credential_id: BytesN<32>,
        result: bool,
        signature: BytesN<65>,
        timestamp: u64,
    ) -> Result<(), Error> {
        let backend: BytesN<65> = env
            .storage()
            .instance()
            .get(&DataKey::Backend)
            .ok_or(Error::NotInitialized)?;

        // Replay guard: never overwrite an existing result for this credential.
        let key = DataKey::Result(credential_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyRecorded);
        }

        // Freshness guard: |ledger_now - timestamp| must be within the window.
        let now = env.ledger().timestamp();
        let skew = if now >= timestamp { now - timestamp } else { timestamp - now };
        if skew > MAX_AGE_SECONDS {
            return Err(Error::StaleTimestamp);
        }

        // Rebuild the signed message: credentialId ‖ "SOROBAN" ‖ resultByte ‖ u64_be(ts).
        let mut message = Bytes::from_array(&env, &credential_id.to_array());
        message.extend_from_slice(CHAIN_TAG);
        message.push_back(if result { 1u8 } else { 0u8 });
        message.extend_from_slice(&timestamp.to_be_bytes());
        let digest = env.crypto().sha256(&message);

        // Split the 65-byte signature into 64-byte r‖s and the recovery id.
        let sig_bytes = signature.to_array();
        let mut rs = [0u8; 64];
        rs.copy_from_slice(&sig_bytes[..64]);
        let recovery_id = sig_bytes[64] as u32;
        let sig64 = BytesN::<64>::from_array(&env, &rs);

        // Recover the signer and require it to be exactly the configured backend key.
        let recovered = env.crypto().secp256k1_recover(&digest, &sig64, recovery_id);
        if recovered != backend {
            return Err(Error::InvalidSignature);
        }

        env.storage()
            .persistent()
            .set(&key, &VerificationResult { result, timestamp });
        Attest { credential_id, result, timestamp }.publish(&env);
        Ok(())
    }

    /// Read the recorded result for a credential, or None if none exists.
    pub fn get_result(env: Env, credential_id: BytesN<32>) -> Option<VerificationResult> {
        env.storage().persistent().get(&DataKey::Result(credential_id))
    }
}
