// Deploy the NIVAAN Sepolia Registry (docs/deployment.md; architecture.md §9, §12).
// The constructor bakes in the BACKEND attestation signer ADDRESS (ADR-001 root of
// trust) derived from BACKEND_ATTESTATION_SIGNING_KEY — NOT the deployer key. The
// deployer key (SEPOLIA_DEPLOYER_KEY, in hardhat.config.js) only pays gas.
const hre = require('hardhat');

async function main() {
  const raw = (process.env.BACKEND_ATTESTATION_SIGNING_KEY || '').trim();
  if (!raw) throw new Error('BACKEND_ATTESTATION_SIGNING_KEY is not set');
  const backendKey = raw.startsWith('0x') ? raw : `0x${raw}`;

  // The address the contract stores as `backendSigner`. Must match the key the
  // backend signs attestations with, or every submitAttestation reverts InvalidSignature.
  const backendSigner = new hre.ethers.Wallet(backendKey).address;
  console.log('Backend attestation signer (constructor arg):', backendSigner);

  const Registry = await hre.ethers.getContractFactory('Registry');
  const registry = await Registry.deploy(backendSigner);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log('Registry deployed to:', address);
  console.log(`→ set SEPOLIA_REGISTRY_ADDRESS=${address} in .env.local`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
