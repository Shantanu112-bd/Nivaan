import { NetworkId, createKeystore } from '@midnight-ntwrk/wallet-sdk';
import { UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk/unshielded';
import { PublicKey } from '@midnight-ntwrk/wallet-sdk';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk';
import { mnemonicToWords } from '@midnight-ntwrk/wallet-sdk';
import { config } from 'dotenv';
config({ path: '.env.local' });

const seedStr = process.env.MIDNIGHT_WALLET_SEED;
if (!seedStr) throw new Error("Missing seed");

// If seed is mnemonic, convert to hex seed. Or createKeystore might take mnemonic words.
// Wait, createKeystore might take Uint8Array seed.
// Let's print out what createKeystore expects.
console.log("Imports succeeded.");
