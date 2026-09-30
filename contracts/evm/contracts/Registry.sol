// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title NIVAAN Sepolia registry (Phase 6; docs/architecture.md §9)
 * @notice Cross-chain verification is backend-attested (ADR-001, "Path C"):
 *         Midnight's proof system cannot be verified on the EVM, so the backend
 *         verifies the Midnight proof off-chain, then signs a compact attestation
 *         with the singular BACKEND_ATTESTATION_SIGNING_KEY (the root of trust).
 *         THIS CONTRACT NEVER RE-VERIFIES THE ZK PROOF. It only checks that a
 *         submission carries a valid backend signature over the canonical
 *         attestation fields, records the result once, and rejects replays.
 *
 *         The signed digest MUST match lib/chains/attestation.ts byte-for-byte:
 *           digest    = keccak256(abi.encodePacked(
 *                          bytes32 credentialId,   // SHA-256(utf8(DB cuid))
 *                          string  "SEPOLIA",      // ASCII chain tag
 *                          bool    result,         // 1 byte 0x01/0x00
 *                          uint256 timestamp))     // unix seconds
 *           ethSigned = "\x19Ethereum Signed Message:\n32" ‖ digest
 *         and ECDSA.recover(ethSigned, signature) must equal `backendSigner`.
 */
contract Registry {
    using MessageHashUtils for bytes32;

    /// Replay/staleness window — mirrors ATTESTATION_MAX_AGE_SECONDS (300) in
    /// lib/chains/attestation.ts. A timestamp further than this from block time
    /// (past OR future) is rejected.
    uint256 public constant MAX_AGE_SECONDS = 300;

    /// ASCII chain tag bound into the signed digest, so a signature minted for one
    /// chain cannot be replayed on another. Mirrors chainTagFor('sepolia').
    string public constant CHAIN_TAG = "SEPOLIA";

    /// The configured backend attestation signer (ADR-001 root of trust). Set once
    /// at construction; immutable thereafter.
    address public immutable backendSigner;

    struct Record {
        bool result;
        bool exists;
        uint64 timestamp;
    }

    /// credentialId => recorded verification outcome.
    mapping(bytes32 => Record) private _records;

    event AttestationRecorded(bytes32 indexed credentialId, bool result, uint256 timestamp);

    /// A result for this credentialId already exists (replay).
    error AlreadyRecorded();
    /// timestamp is outside +/- MAX_AGE_SECONDS of block time (replay/staleness).
    error StaleTimestamp();
    /// Recovered signer does not match the configured backend signer (bad signature).
    error InvalidSignature();

    constructor(address backendSigner_) {
        require(backendSigner_ != address(0), "backendSigner is zero");
        backendSigner = backendSigner_;
    }

    /**
     * @notice Record a verification result iff `signature` is a valid backend
     *         signature over the canonical digest for (credentialId, result,
     *         timestamp).
     * @dev Rejects a duplicate `credentialId` (AlreadyRecorded) and a `timestamp`
     *      outside the freshness window (StaleTimestamp) BEFORE the signature check,
     *      then verifies the signer is `backendSigner` (InvalidSignature otherwise).
     * @param credentialId SHA-256(utf8(DB cuid)), 32 bytes.
     * @param result       The attested verification outcome.
     * @param signature     65-byte secp256k1 signature (r‖s‖v) from the backend key.
     * @param timestamp     Unix seconds the attestation was signed at.
     */
    function submitAttestation(
        bytes32 credentialId,
        bool result,
        bytes calldata signature,
        uint256 timestamp
    ) external {
        // Replay guard: never overwrite an existing result for this credential.
        if (_records[credentialId].exists) revert AlreadyRecorded();

        // Freshness guard: |block.timestamp - timestamp| must be within the window.
        uint256 skew = block.timestamp >= timestamp
            ? block.timestamp - timestamp
            : timestamp - block.timestamp;
        if (skew > MAX_AGE_SECONDS) revert StaleTimestamp();

        // Rebuild the signed digest and require the signer to be the backend key.
        bytes32 digest = keccak256(abi.encodePacked(credentialId, CHAIN_TAG, result, timestamp));
        address signer = ECDSA.recover(digest.toEthSignedMessageHash(), signature);
        if (signer != backendSigner) revert InvalidSignature();

        _records[credentialId] =
            Record({result: result, exists: true, timestamp: uint64(timestamp)});
        emit AttestationRecorded(credentialId, result, timestamp);
    }

    /**
     * @notice Read the recorded result for a credential (docs/architecture.md §9).
     * @dev Returns (false, 0) when no result exists — call {hasResult} to
     *      distinguish "absent" from a recorded `false`. This mirrors the Soroban
     *      registry's `Option<VerificationResult>` semantics without changing the
     *      documented (bool, uint256) return shape.
     */
    function getResult(bytes32 credentialId) external view returns (bool result, uint256 timestamp) {
        Record storage r = _records[credentialId];
        return (r.result, r.timestamp);
    }

    /// Whether a result has been recorded for `credentialId`.
    function hasResult(bytes32 credentialId) external view returns (bool) {
        return _records[credentialId].exists;
    }
}
