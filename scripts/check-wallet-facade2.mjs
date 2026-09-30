import { NetworkId, createKeystore, UnshieldedWallet, DustWallet, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { config } from 'dotenv';
config({ path: '.env.local' });

const seedStr = process.env.MIDNIGHT_WALLET_SEED;
const entropy = mnemonicToEntropy(seedStr, wordlist);
const networkId = NetworkId.TestNet;
const keystore = createKeystore(entropy, networkId);
const pk = PublicKey.fromKeyStore(keystore);

const configuration = {
  networkId: NetworkId.TestNet,
  indexerClientConnection: {
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v1/graphql/ws',
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v1/graphql',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};

async function main() {
  const unshielded = await UnshieldedWallet(configuration).startWithPublicKey(pk);
  await unshielded.start();

  unshielded.state().subscribe(state => {
      console.log("Unshielded Balances:", state.balances);
  });
  
  setTimeout(() => process.exit(0), 10000);
}

main().catch(console.error);
