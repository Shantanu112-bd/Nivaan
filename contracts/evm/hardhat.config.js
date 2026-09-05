// NIVAAN EVM registry — Hardhat config (isolated package; docs/architecture.md §9).
// Solidity 0.8.24 (>= 0.8.20 required by OpenZeppelin Contracts v5). hardhat-ethers
// gives tests `require("hardhat").ethers`. Network config is intentionally absent:
// Phase 6 is author + local-test only; testnet deploy (Sepolia RPC) comes later.
require('@nomicfoundation/hardhat-ethers');

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
};
