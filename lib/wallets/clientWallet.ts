import { privateKeyToAccount } from 'viem/accounts';

export interface WalletSession {
  did: string;
  walletAddress: string;
  sessionExpiresAt: string;
}

/**
 * Sign in using an injected Ethereum provider (window.ethereum) or a generated local demo wallet.
 */
export async function connectAndAuthenticate(): Promise<WalletSession> {
  // 1. Fetch fresh nonce
  const nonceRes = await fetch('/api/auth/nonce');
  if (!nonceRes.ok) {
    throw new Error('Failed to obtain authentication nonce');
  }
  const { nonce } = await nonceRes.json();

  let walletAddress: string;
  let signature: string;

  // 2. Check for window.ethereum
  const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (ethereum) {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    signature = await ethereum.request({
      method: 'personal_sign',
      params: [nonce, walletAddress],
    });
  } else {
    // Demo key stored in localStorage so it persists across reloads in demo mode
    let demoKey = localStorage.getItem('nivaan_demo_wallet_pk');
    if (!demoKey) {
      demoKey = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem('nivaan_demo_wallet_pk', demoKey);
    }
    const account = privateKeyToAccount(demoKey as `0x${string}`);
    walletAddress = account.address;
    signature = await account.signMessage({ message: nonce });
  }

  // 3. Post to verify and set HttpOnly session cookie
  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, nonce, signature }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error || 'Authentication failed');
  }

  const data = await verifyRes.json();
  return {
    did: data.did,
    walletAddress,
    sessionExpiresAt: data.sessionExpiresAt,
  };
}
