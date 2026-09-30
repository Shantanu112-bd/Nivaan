import { WebSocket } from 'ws';
// @ts-expect-error WebSocket
globalThis.WebSocket = WebSocket;

import { resolveNetwork, getOrCreateWallet } from './network';
import { createWallet } from './wallet';

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);

async function main() {
  console.log("Checking wallet components progress on", networkConfig.networkId);
  const walletCtx = await createWallet({ network, networkConfig, seed: WALLET.seed });
  
  walletCtx.wallet.state().subscribe((s: any) => {
    console.log("UNSHIELDED KEYS:", Object.keys(s.unshielded || {}));
    console.log("DUST KEYS:", Object.keys(s.dust || {}));
    console.log("SHIELDED KEYS:", Object.keys(s.shielded || {}));
    if (s.unshielded) {
      console.log("unshielded props:", {
        synced: s.unshielded.isSynced,
        progress: s.unshielded.progress,
        balances: s.unshielded.balances,
      });
    }
    if (s.dust) {
      console.log("dust props:", {
        synced: s.dust.isSynced,
        progress: s.dust.progress,
        balance: s.dust.balance ? s.dust.balance(new Date()).toString() : undefined,
      });
    }
  });
}

main().catch(console.error);
