import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
setNetworkId('preview');

import { createKeystore, DustWallet, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { config } from 'dotenv';
config({ path: '.env.local' });

const seedStr = process.env.MIDNIGHT_WALLET_SEED;
const entropy = mnemonicToEntropy(seedStr, wordlist);
const keystore = createKeystore(entropy, 'preview');
const pk = PublicKey.fromKeyStore(keystore);
console.log("Unshielded Address:", pk.address);

const configuration = {
  networkId: 'preview',
  indexerClientConnection: {
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS,
    indexerHttpUrl: process.env.MIDNIGHT_INDEXER_HTTP,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};

async function main() {
  const dust = await DustWallet(configuration).startWithPublicKey(pk);
  await dust.start();

  dust.state().subscribe(state => {
      console.log("Dust Balances:", state.balances);
  });
  
  setTimeout(() => process.exit(0), 10000);
}

main().catch(console.error);
