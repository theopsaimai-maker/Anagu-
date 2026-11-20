import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Configurable EVM version for Hyperledger Besu QBFT compatibility.
// Defaulting to "paris" avoids PUSH0 (Shanghai) and TSTORE/MCOPY (Cancun),
// which can revert with INVALID_OPCODE on Besu networks whose genesis stops
// at Berlin/London/Paris. Operators should verify their actual Besu genesis
// fork configuration and override BESU_EVM_VERSION if needed.
const BESU_EVM_VERSION = process.env.BESU_EVM_VERSION || "paris";

// Optional Besu RPC & gas price configuration loaded exclusively from env vars.
// Never commit private keys or live RPC endpoints to source control.
const BESU_RPC_URL = process.env.BESU_RPC_URL || "";
const BESU_GAS_PRICE =
  process.env.BESU_GAS_PRICE !== undefined && process.env.BESU_GAS_PRICE !== ""
    ? Number(process.env.BESU_GAS_PRICE)
    : 0;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: BESU_EVM_VERSION,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 13371,
    },
    ...(BESU_RPC_URL
      ? {
          besu: {
            url: BESU_RPC_URL,
            chainId: 13371,
            gasPrice: Number.isFinite(BESU_GAS_PRICE) ? BESU_GAS_PRICE : 0,
            accounts: process.env.BESU_DEPLOYER_PRIVATE_KEY
              ? [process.env.BESU_DEPLOYER_PRIVATE_KEY]
              : [],
          },
        }
      : {}),
  },
};

export default config;
