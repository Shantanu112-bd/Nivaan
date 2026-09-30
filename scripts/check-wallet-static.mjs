import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
setNetworkId('preview');

import { NetworkId, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { config } from 'dotenv';
config({ path: '.env.local' });

const seedStr = process.env.MIDNIGHT_WALLET_SEED;
const entropy = mnemonicToEntropy(seedStr, wordlist);
const keystore = createKeystore(entropy, NetworkId.Preview);
const pk = PublicKey.fromKeyStore(keystore);
console.log("Unshielded Address:", pk.address);
