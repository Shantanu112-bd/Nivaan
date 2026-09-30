import { resolveNetwork, getOrCreateWallet } from './network';
import { createWallet } from './wallet';

async function main() {
  const { network, config } = resolveNetwork();
  const wallet = getOrCreateWallet(network);
  console.log('Testing wallet restore...');
  const ctx = await createWallet({ network, networkConfig: config, seed: wallet.seed });
  console.log('Restored results:', ctx.restored);
  const state = await ctx.wallet.waitForSyncedState();
  console.log('Sync complete! Balance:', state.unshielded.balances);
  console.log('Dust balance:', state.dust.balance(new Date()).toString());
  await ctx.wallet.stop();
  console.log('Done!');
}

main().catch(console.error);
