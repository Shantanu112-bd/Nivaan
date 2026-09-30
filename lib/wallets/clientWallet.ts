import { privateKeyToAccount } from 'viem/accounts';

export interface WalletSession {
  did: string;
  walletAddress: string;
  sessionExpiresAt: string;
}

async function authenticateWithLocalWallet(nonce: string) {
  let demoKey = typeof window !== 'undefined' ? localStorage.getItem('nivaan_demo_wallet_pk') : null;
  if (!demoKey) {
    demoKey = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    if (typeof window !== 'undefined') {
      localStorage.setItem('nivaan_demo_wallet_pk', demoKey);
    }
  }
  const account = privateKeyToAccount(demoKey as `0x${string}`);
  const walletAddress = account.address;
  const signature = await account.signMessage({ message: nonce });
  return { walletAddress, signature };
}

/**
 * Sign in using an injected Ethereum provider (window.ethereum) or a generated local demo wallet.
 */
export async function connectAndAuthenticate(): Promise<WalletSession> {
  // 1. Fetch fresh nonce
  const nonceRes = await fetch('/api/auth/nonce');
  if (!nonceRes.ok) {
    let msg = 'Failed to obtain authentication nonce';
    try {
      const data = await nonceRes.json();
      if (data?.message) msg = `${msg} (${data.message})`;
    } catch {}
    throw new Error(msg);
  }
  const { nonce } = await nonceRes.json();

  let walletAddress: string = '';
  let signature: string = '';

  // 2. Check for window.ethereum
  const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (ethereum) {
    let accounts: string[] = [];
    try {
      accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    } catch (err: any) {
      console.warn('[clientWallet] MetaMask connection prompt was dismissed. Continuing with instant demo wallet.');
      const demo = await authenticateWithLocalWallet(nonce);
      walletAddress = demo.walletAddress;
      signature = demo.signature;
    }

    if (accounts && accounts.length > 0 && !signature) {
      walletAddress = accounts[0];
      // EIP-1193 personal_sign standard expects hex-encoded UTF-8 message:
      const hexMessage = `0x${Array.from(new TextEncoder().encode(nonce))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}`;

      try {
        signature = await ethereum.request({
          method: 'personal_sign',
          params: [hexMessage, walletAddress],
        });
      } catch (err: any) {
        console.warn('[clientWallet] MetaMask signature was dismissed. Continuing with instant demo wallet.');
        const demo = await authenticateWithLocalWallet(nonce);
        walletAddress = demo.walletAddress;
        signature = demo.signature;
      }
    }
  }

  // Fallback if not authenticated via MetaMask
  if (!walletAddress || !signature) {
    const demo = await authenticateWithLocalWallet(nonce);
    walletAddress = demo.walletAddress;
    signature = demo.signature;
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
