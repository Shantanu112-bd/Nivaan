import { config } from 'dotenv';
config({ path: '.env.local' });
import { getChainAdapter } from '../lib/chains/index.js';
import { nowUnixSeconds } from '../lib/chains/attestation.js';

async function run() {
  const sepolia = getChainAdapter('SEPOLIA' as any);
  const soroban = getChainAdapter('SOROBAN' as any);

  const credentialId = 'did:nivaan:test:' + Date.now();
  const timestamp = nowUnixSeconds();

  try {
    console.log('Submitting to Sepolia...');
    const sepResult = await sepolia.submitAttestation({
      credentialId,
      chain: 'SEPOLIA' as any,
      result: true,
      timestamp
    });
    console.log('Sepolia tx:', sepResult.txHash);
    
    console.log('\nSubmitting to Soroban...');
    const sorResult = await soroban.submitAttestation({
      credentialId,
      chain: 'SOROBAN' as any,
      result: true,
      timestamp
    });
    console.log('Soroban tx:', sorResult.txHash);

    console.log('\nVerifying Sepolia read...');
    const sepRead = await sepolia.getResult(credentialId);
    console.log('Sepolia read:', sepRead);

    console.log('\nVerifying Soroban read...');
    const sorRead = await soroban.getResult(credentialId);
    console.log('Soroban read:', sorRead);
    
    process.exit(0);
  } catch (err) {
    console.error('Error during broadcast:', err);
    process.exit(1);
  }
}
run();
