const { NetworkId, createKeystore, UnshieldedWallet, PublicKey, InMemoryTransactionHistoryStorage } = require('@midnight-ntwrk/wallet-sdk');
const { setNetworkId } = require('@midnight-ntwrk/midnight-js-network-id');
const { mnemonicToEntropy } = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english');
require('dotenv').config({ path: '.env.local' });

const networkStr = process.env.MIDNIGHT_NETWORK_ID || 'preview';
setNetworkId(networkStr);

const seedStr = process.env.MIDNIGHT_WALLET_SEED;
const entropy = mnemonicToEntropy(seedStr, wordlist);

const networkId = NetworkId.Preview;
const keystore = createKeystore(entropy, networkId);
const pk = PublicKey.fromKeyStore(keystore);
console.log("Unshielded Address:", pk.address);

const configuration = {
  networkId: NetworkId.Preview,
  indexerClientConnection: {
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS,
    indexerHttpUrl: process.env.MIDNIGHT_INDEXER_HTTP,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
};

async function main() {
  const unshielded = await UnshieldedWallet(configuration).startWithPublicKey(pk);
  await unshielded.start();

  let unshieldedSynced = false;
  unshielded.state().subscribe(state => {
      console.log("Unshielded Balances:", state.balances);
      unshieldedSynced = true;
  });
  
  setTimeout(() => process.exit(0), 10000);
}

main().catch(console.error);
