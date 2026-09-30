import { env } from '../lib/config/env';
import { WalletBuilder } from '@midnight-ntwrk/wallet-sdk';
import { IndexerClient } from '@midnight-ntwrk/wallet-sdk-indexer-client';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

async function main() {
  console.log('Restoring wallet...');
  const seed = env.midnightWalletSeed;
  const rpc = env.midnightTestnetRpc;
  const proofServer = env.proofServerUrl;

  try {
    console.log('Using seed:', seed.substring(0, 20) + '...');
    const walletBuilder = WalletBuilder.build({
      seed,
      networkId: NetworkId.TestNet,
      // For some wallet SDKs we just need the RPC or indexer
      // I'll try to build it normally or explore the API if it fails.
    });

    console.log(Object.keys(WalletBuilder));
  } catch (e) {
    console.error(e);
  }
}

main().catch(console.error);
