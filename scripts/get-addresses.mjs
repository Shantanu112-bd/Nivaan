import { NetworkId, createKeystore } from '@midnight-ntwrk/wallet-sdk';
import { PublicKey } from '@midnight-ntwrk/wallet-sdk';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { config } from 'dotenv';

config({ path: '.env.local' });
const seedStr = process.env.MIDNIGHT_WALLET_SEED;
if (!seedStr) throw new Error("Missing seed");

const entropy = mnemonicToEntropy(seedStr, wordlist);

const networkId = NetworkId.TestNet;
const keystore = createKeystore(entropy, networkId);
const pk = PublicKey.fromKeyStore(keystore);
console.log(pk);
