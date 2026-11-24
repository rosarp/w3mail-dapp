require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

// Polkadot Hub TestNet (Paseo Next Asset Hub) EVM RPC endpoints.
// `paseo-fallback1` / `paseo-fallback2` networks below exist for the
// orchestrator's retry pattern; all three currently point to the same
// canonical public endpoint.
const PASEO_RPC_ENDPOINTS = [
  process.env.PASEO_RPC_URL || "https://eth-rpc-paseo-next.polkadot.io",
  "https://eth-rpc-paseo-next.polkadot.io",
  "https://eth-rpc-paseo-next.polkadot.io",
];

/** @type {import("hardhat/config").HardhatUserConfig} */
const config = {
  typechain: { dontOverrideCompile: true },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // viaIR is MANDATORY for PolkaVM/Revive compilation.
      viaIR: true,
      // OpenZeppelin v5.x emits `mcopy` (Cancun opcode); without this the
      // compiler errors with `DeclarationError: Function "mcopy" not found`.
      evmVersion: "cancun",
    },
  },
  networks: {
    // DEFAULT: Polkadot Hub TestNet (Paseo) - chainId 420420417
    paseo: {
      url: PASEO_RPC_ENDPOINTS[0],
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto",
      timeout: 120000,
    },
    // Fallback: same chain, different RPC endpoint
    "paseo-fallback1": {
      url: PASEO_RPC_ENDPOINTS[1],
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto",
      timeout: 120000,
    },
    "paseo-fallback2": {
      url: PASEO_RPC_ENDPOINTS[2],
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto",
      timeout: 120000,
    },
    local: {
      url: process.env.LOCAL_ETH_RPC || "http://127.0.0.1:8545",
      chainId: Number(process.env.LOCAL_CHAIN_ID || 420420421),
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 120000,
    },
  },
};
module.exports = config;
