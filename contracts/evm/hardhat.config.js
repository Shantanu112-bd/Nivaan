// NIVAAN EVM registry — Hardhat config (isolated package; docs/architecture.md §9, §12).
// Solidity 0.8.24 (>= 0.8.20 required by OpenZeppelin Contracts v5). hardhat-ethers
// gives tests `require("hardhat").ethers`.
require('@nomicfoundation/hardhat-ethers');
// Load the repo-root .env.local so SEPOLIA_* / BACKEND_* are available to the deploy
// (keeps secrets out of shell history).
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { SEPOLIA_RPC_URL, SEPOLIA_DEPLOYER_KEY } = process.env;
const sepoliaAccounts = SEPOLIA_DEPLOYER_KEY
  ? [SEPOLIA_DEPLOYER_KEY.startsWith('0x') ? SEPOLIA_DEPLOYER_KEY : `0x${SEPOLIA_DEPLOYER_KEY}`]
  : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Sepolia has run the Cancun EVM since the Dencun upgrade; OpenZeppelin v5.4+
      // uses the `mcopy` (Cancun) opcode, so compile for cancun.
      evmVersion: 'cancun',
    },
  },
  networks: {
    // Registered only when configured — keeps `npx hardhat test` local-only otherwise.
    ...(SEPOLIA_RPC_URL && sepoliaAccounts.length
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: sepoliaAccounts } }
      : {}),
  },
};
