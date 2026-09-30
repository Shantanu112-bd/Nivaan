import WebSocket from 'ws';
global.WebSocket = WebSocket;

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { nodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletBuilder } from '@midnight-ntwrk/wallet-api';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ZswapSecretKeys, DustSecretKey, DustAddress, MidnightBech32m } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import * as crypto from 'crypto';
import path from 'path';

import { Contract } from '../contracts/midnight/managed/contract/index.js';
import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';

const SEED = process.env.MIDNIGHT_WALLET_SEED;
if (!SEED) throw new Error("MIDNIGHT_WALLET_SEED is missing");

setNetworkId('preprod');

async function run() {
  const seedBytes = Buffer.from(SEED, 'utf-8');

  // Build the wallet facade
  const wallet = await WalletBuilder.buildFromSeed(
    'https://rpc.preprod.midnight.network',
    'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    'https://prover.preprod.midnight.network',
    'https://indexer.preprod.midnight.network/api/v4/graphql',
    seedBytes,
    getNetworkId(),
    'warn'
  );

  const state = await wallet.state();
  
  // Account ID must be the wallet's actual Bech32m address per the guide
  const target = String(DustAddress.encodePublicKey(getNetworkId(), state.dust.publicKey));
  const dustReceiver = MidnightBech32m.parse(target).decode(DustAddress, getNetworkId());
  const accountId = target; 

  // Generate a robust password meeting Midnight's 16+ char, 3+ class requirement
  const password = crypto.randomBytes(24).toString('base64');
  
  const privateStateProvider = await levelPrivateStateProvider({
    privateStateStoreName: `nivaan-preprod-privatestate`,
    accountId,
    password
  });

  const midnightProvider = await wallet.midnightProvider();
  
  const publicDataProvider = indexerPublicDataProvider(
    'https://indexer.preprod.midnight.network/api/v4/graphql',
    'wss://indexer.preprod.midnight.network/api/v4/graphql/ws'
  );

  const zkConfigProvider = nodeZkConfigProvider(
    path.resolve(process.cwd(), 'contracts/midnight/managed/keys')
  );

  const proofProvider = httpClientProofProvider('https://prover.preprod.midnight.network');

  const providers = {
    privateStateProvider,
    zkConfigProvider,
    midnightProvider,
    publicDataProvider,
    proofProvider,
    walletProvider: wallet,
  };

  const compiledContract = CompiledContract.withCompiledFileAssets(
    CompiledContract.withVacantWitnesses(
      CompiledContract.make('nivaan', Contract)
    ),
    path.resolve(process.cwd(), 'contracts/midnight/managed/zkir')
  );

  console.log('Deploying Nivaan credential contract to Preprod...');
  
  const deployTxData = await deployContract(
    providers,
    {
      privateStateProvider,
      zkConfigProvider,
    },
    compiledContract,
    {
      initialPrivateState: {
        ageYears: 0n,
        jurisdictionCode: 0n,
        nullifier: new Uint8Array(32)
      }
    }
  );

  console.log(`\nDeployment successful!`);
  console.log(`Contract Address: ${deployTxData.public.contractAddress}`);
}

run().catch(console.error);
