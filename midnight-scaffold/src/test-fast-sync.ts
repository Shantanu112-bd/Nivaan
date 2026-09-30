import { WebSocket } from 'ws';
// @ts-expect-error WebSocket
globalThis.WebSocket = WebSocket;

import { resolveNetwork, getOrCreateWallet } from './network';
import { createWallet, unshieldedToken } from './wallet';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);

async function main() {
  console.log("Testing fast sync on", networkConfig.networkId);
  const start = Date.now();
  
  // Create wallet
  const walletCtx = await createWallet({ network, networkConfig, seed: WALLET.seed });
  
  console.log("Waiting for synced state...");
  const state = await walletCtx.wallet.waitForSyncedState();
  const elapsed = (Date.now() - start) / 1000;
  console.log(`Synced in ${elapsed.toFixed(1)}s!`);
  
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log("tNIGHT Balance:", balance.toString());
  console.log("DUST Balance:", state.dust.balance(new Date()).toString());
  
  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch(console.error);
