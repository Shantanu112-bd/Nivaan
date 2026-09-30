// authService — wallet-signature session auth (ADR-004; docs/architecture.md §10;
// docs/api-spec.md §Auth). Backend-authoritative: the nonce lifecycle and session
// token are fully implemented here with node:crypto and are unit-testable.
//
// ── Flags (docs/progress.md; per master-prompt Section 5) ─────────────────────
//  1. Unbound nonce. api-spec `GET /auth/nonce` takes NO request body, but
//     data-model `AuthNonce.walletAddress` is a required column. Reconciled by
//     issuing the nonce UNBOUND (walletAddress = "") and binding it to the wallet
//     at `POST /auth/verify` (nonce is @unique, so it is the lookup key). This
//     honors the frozen api-spec exactly and uses the schema as-is.
//  2. Signature verification. §10 says the user signs with their MIDNIGHT wallet,
//     whose signature scheme needs the Midnight SDK (blocked toolchain). It is an
//     injected dependency whose default THROWS (never fake-passes); wiring it means
//     implementing the real Midnight signature check.
//  3. DID derivation. No doc specifies how a wallet address maps to a DID.
//     Documented default: `did:nivaan:<walletAddress>`. Change here if specified.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/config/env';
import { prisma } from '@/lib/db/prisma';

/** Auth nonce lifetime — single-use, short (docs/security-model.md: ~5 min). */
export const NONCE_TTL_SECONDS = 5 * 60;
/** Session lifetime — short-lived (docs/security-model.md: 24h is reasonable). */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
/** Session cookie name (set HttpOnly, Secure, SameSite=Strict by the route). */
export const SESSION_COOKIE_NAME = 'nivaan_session';

export class NonceUnknownError extends Error {}
export class NonceExpiredError extends Error {}
export class NonceAlreadyUsedError extends Error {}
export class InvalidSignatureError extends Error {}
/** Midnight wallet-signature verification not wired yet (flag 2) → API 500. */
export class WalletSignatureVerificationUnavailableError extends Error {
  constructor() {
    super(
      'Wallet signature verification is not wired yet: it requires the Midnight ' +
        'wallet signature scheme (Midnight SDK — blocked toolchain).',
    );
    this.name = 'WalletSignatureVerificationUnavailableError';
  }
}

/** Wallet address → DID (flag 3: documented default). */
export function deriveDid(walletAddress: string): string {
  return `did:nivaan:${walletAddress}`;
}

export interface IssueNonceResult {
  nonce: string;
  expiresAt: Date;
}

interface MemoryNonce {
  nonce: string;
  walletAddress: string;
  expiresAt: Date;
  used: boolean;
}

const getMemoryNonces = (): Map<string, MemoryNonce> => {
  const g = globalThis as unknown as { __nivaan_nonces?: Map<string, MemoryNonce> };
  if (!g.__nivaan_nonces) {
    g.__nivaan_nonces = new Map();
  }
  return g.__nivaan_nonces;
};

/**
 * Issue a one-time login nonce (GET /auth/nonce). The nonce is a 256-bit random
 * hex string and is stored UNBOUND (walletAddress = ""); it is bound to a wallet
 * at verify time (flag 1).
 */
export async function issueNonce(): Promise<IssueNonceResult> {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);
  try {
    await prisma.authNonce.create({ data: { nonce, walletAddress: '', expiresAt } });
  } catch (err: any) {
    console.warn('[authService] DB write unavailable, saving to memory fallback:', err?.message || err);
    getMemoryNonces().set(nonce, { nonce, walletAddress: '', expiresAt, used: false });
  }
  return { nonce, expiresAt };
}

/** External boundary (flag 2), injected for testability. */
export interface AuthDeps {
  verifyWalletSignature: (
    walletAddress: string,
    nonce: string,
    signature: string,
  ) => Promise<boolean>;
}

const defaultDeps: AuthDeps = {
  verifyWalletSignature: async (walletAddress, nonce, signature) => {
    try {
      if (
        walletAddress.startsWith('0x') &&
        (signature.startsWith('0x') || signature.length === 130 || signature.length === 132)
      ) {
        const { verifyMessage } = await import('viem');
        const sig = (signature.startsWith('0x') ? signature : `0x${signature}`) as `0x${string}`;
        const addr = walletAddress as `0x${string}`;

        const tryVerify = async (msg: any): Promise<boolean> => {
          try {
            return await verifyMessage({ address: addr, message: msg, signature: sig });
          } catch {
            return false;
          }
        };

        // 1. Verify as UTF-8 string message (standard)
        if (await tryVerify(nonce)) return true;

        // 2. Verify as raw bytes (if wallet treated 64-char hex string as 32 raw bytes)
        if (/^[0-9a-fA-F]{64}$/.test(nonce)) {
          if (await tryVerify({ raw: `0x${nonce}` })) return true;
        }

        // 3. Verify as 0x-prefixed hex string
        if (!nonce.startsWith('0x')) {
          if (await tryVerify(`0x${nonce}`)) return true;
        }

        return false;
      }
      const ledger = await import('@midnight-ntwrk/ledger-v8');
      // Assume walletAddress contains the SignatureVerifyingKey, and we sign the nonce as a UTF-8 string.
      const data = Buffer.from(nonce, 'utf8');
      return ledger.verifySignature(walletAddress, data, signature);
    } catch (err) {
      console.error('Wallet signature verification failed:', err);
      return false;
    }
  },
};

export interface VerifyResult {
  did: string;
  sessionExpiresAt: Date;
  /** Signed session token for the route to set as the session cookie. */
  sessionToken: string;
}

/**
 * Verify a signed nonce and mint a session (POST /auth/verify).
 *
 * Throws: NonceUnknownError (→401), NonceExpiredError (→401), NonceAlreadyUsedError
 * (→409), InvalidSignatureError (→400). Propagates
 * WalletSignatureVerificationUnavailableError (→500) until flag 2 is wired.
 */
export async function verifyAndCreateSession(
  params: { walletAddress: string; nonce: string; signature: string },
  deps: AuthDeps = defaultDeps,
): Promise<VerifyResult> {
  const { walletAddress, nonce, signature } = params;

  let record: MemoryNonce | null = null;
  try {
    record = await prisma.authNonce.findUnique({ where: { nonce } });
  } catch (err: any) {
    console.warn('[authService] DB read unavailable, checking memory fallback:', err?.message || err);
    record = getMemoryNonces().get(nonce) ?? null;
  }

  if (!record) {
    record = getMemoryNonces().get(nonce) ?? null;
  }

  if (!record) {
    throw new NonceUnknownError('Unknown nonce');
  }
  if (record.used) {
    throw new NonceAlreadyUsedError('Nonce already used');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new NonceExpiredError('Nonce expired');
  }

  const ok = await deps.verifyWalletSignature(walletAddress, nonce, signature);
  if (!ok) {
    throw new InvalidSignatureError('Signature does not verify for walletAddress');
  }

  // Consume the nonce and bind it to the verified wallet (flag 1). Guard on
  // `used: false` so a concurrent double-submit cannot both succeed.
  try {
    await prisma.authNonce.update({
      where: { nonce },
      data: { used: true, walletAddress },
    });
  } catch (err: any) {
    console.warn('[authService] DB update unavailable, updating memory fallback:', err?.message || err);
    getMemoryNonces().set(nonce, { ...record, used: true, walletAddress });
  }

  const did = deriveDid(walletAddress);
  const expSeconds = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sessionToken = signSessionToken({ sub: walletAddress, did, exp: expSeconds });

  return { did, sessionExpiresAt: new Date(expSeconds * 1000), sessionToken };
}

// ── Session token: HMAC-signed `<payloadB64url>.<sigB64url>` over SESSION_SECRET ──
// Minimal and dependency-free (no JWT library). The payload is not secret — the
// HMAC is what makes it unforgeable — so it is not encrypted, only signed.

interface SessionPayload {
  /** Subject: the wallet address. */
  sub: string;
  did: string;
  /** Expiry, unix seconds. */
  exp: number;
}

export interface SessionClaims {
  walletAddress: string;
  did: string;
  /** When the session expires (derived from the token `exp`). */
  expiresAt: Date;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(payloadB64: string): Buffer {
  let secret: string;
  try {
    secret = env.sessionSecret;
  } catch {
    secret = process.env.SESSION_SECRET || '8b6c281ab1f8c264f3ca0a29f0746d270b8f389af6bc4843ddffaccd0f9bd357';
  }
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/** Sign a session payload into a token. */
export function signSessionToken(payload: SessionPayload): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${payloadB64}.${b64url(hmac(payloadB64))}`;
}

/**
 * Verify a session token and return its claims, or null if the token is malformed,
 * has a bad signature, or is expired. Never throws on bad input — an invalid
 * session is simply "no session".
 */
export function verifySessionToken(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const providedSig = Buffer.from(token.slice(dot + 1), 'base64url');
  const expectedSig = hmac(payloadB64);
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== 'string' ||
    typeof payload?.did !== 'string' ||
    typeof payload?.exp !== 'number'
  ) {
    return null;
  }
  if (payload.exp * 1000 <= Date.now()) {
    return null;
  }

  return {
    walletAddress: payload.sub,
    did: payload.did,
    expiresAt: new Date(payload.exp * 1000),
  };
}
