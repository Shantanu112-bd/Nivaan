# Data Model

Postgres via Prisma. Six tables total. No table contains raw identity data (name, DOB, Aadhaar number, or any document contents) — this is enforced by schema design, not just policy, so review any migration against this rule before merging.

```prisma
// schema.prisma

model AuthNonce {
  id            String    @id @default(cuid())
  walletAddress String
  nonce         String    @unique
  used          Boolean   @default(false)
  createdAt     DateTime  @default(now())
  expiresAt     DateTime

  @@index([walletAddress])
}

model Credential {
  id            String    @id @default(cuid())
  did           String    @unique
  tier          String    // e.g. "kyc_tier_1"
  jurisdiction  String    // "IN" for MVP
  status        CredentialStatus @default(ACTIVE)
  issuedAt      DateTime  @default(now())
  expiresAt     DateTime
  ownerWallet   String    // links to the session's wallet address, not a PII field

  consentLogs        ConsentLog[]
  proofRequests       ProofRequest[]
  revocation          RevokedCredential?

  @@index([ownerWallet])
  @@index([status])
}

enum CredentialStatus {
  ACTIVE
  EXPIRED
  REVOKED
}

model RevokedCredential {
  id            String    @id @default(cuid())
  credentialId  String    @unique
  credential    Credential @relation(fields: [credentialId], references: [id])
  revokedAt     DateTime  @default(now())
  reason        String?
}

model ConsentLog {
  id            String    @id @default(cuid())
  credentialId  String
  credential    Credential @relation(fields: [credentialId], references: [id])
  consentHash   String    // hash of the exact consent text shown, not the underlying data
  timestamp     DateTime  @default(now())

  @@index([credentialId])
}

model ProofRequest {
  id            String    @id @default(cuid())
  credentialId  String
  credential    Credential @relation(fields: [credentialId], references: [id])
  targetChain   ChainTarget
  policyId      String
  status        ProofStatus @default(PENDING)
  failureReason String?
  createdAt     DateTime  @default(now())

  verificationResult VerificationResult?

  @@index([credentialId])
  @@index([status])
}

enum ChainTarget {
  SOROBAN
  SEPOLIA
}

enum ProofStatus {
  PENDING
  READY
  FAILED
}

model VerificationResult {
  id             String    @id @default(cuid())
  proofRequestId String    @unique
  proofRequest   ProofRequest @relation(fields: [proofRequestId], references: [id])
  chain          ChainTarget
  result         Boolean
  attestationSig String    // the backend signature submitted on-chain, stored for audit/debugging
  verifiedAt     DateTime  @default(now())

  @@index([chain])
}
```

## Notes

- `Credential.ownerWallet` and `AuthNonce.walletAddress` are public blockchain addresses, not identity data — safe to store.
- `ConsentLog.consentHash` stores a hash of the consent text version shown, not any user data — sufficient to prove consent occurred without storing what was consented to in plaintext (the text itself is static and versioned in code, not per-user).
- `Credential.status` is a stored, queryable field but must still be checked against `expiresAt` and the `RevokedCredential` relation at verification time — don't trust a stale `ACTIVE` status without that check (see `docs/security-model.md`).
- No table has a foreign key or column referencing raw Aadhaar data, XML payloads, or QR contents. If a future migration adds one, that's a scope violation — flag it against `docs/product-spec.md` before merging.
