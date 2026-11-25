# Deploying ANAGU Smart Contracts to Polygon Amoy Testnet (Chain ID 80002)

This repository includes both smart contracts required by the ANAGU Land Administration due-process workflow:

1. **`contracts/contracts/AnaguToken.sol`** (`ANAGU` ERC-20) — Statutory land registration filing fee (`payLandRegistrationFee`), Registrar-controlled purchase escrow (`openPurchaseEscrow` / `releasePurchaseEscrow` / `refundPurchaseEscrow`), and testnet faucet (`claimTestnetFaucet`).
2. **`contracts/contracts/AnaguLandTitleNFT.sol`** (`ANAGU-TITLE` ERC-721) — Mandatory Community Oracle attestation (`recordOracleAttestation`), Registrar title issuance (`mintTitle`), P2P transfer lock + Registrar-controlled `registryTransfer`, and Section 28 Governor revocation (`revokeTitle`).

> **Note:** Polygon Mumbai Testnet is deprecated. **Polygon Amoy Testnet (`Chain ID 80002` / `0x13882`)** is the official Polygon PoS testnet.

---

## Option A — One-Command Hardhat Deployment (Recommended)

### 1. Fund a Polygon Amoy Testnet Wallet
Get free testnet `POL` gas tokens at https://faucet.polygon.technology/ (select **Polygon Amoy**).

### 2. Set Environment Variables (in `.env` at repo root or `contracts/.env`)
```bash
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_AMOY_DEPLOYER_PRIVATE_KEY=0xYOUR_FUNDED_AMOY_TESTNET_PRIVATE_KEY
```

### 3. Install, Test, and Deploy Both Contracts
```bash
cd contracts
npm install
npm run compile
npm test
npm run deploy:amoy
```

`npm run deploy:amoy` automatically deploys both **`AnaguToken`** and **`AnaguLandTitleNFT`** to Polygon Amoy Testnet and writes the live deployed addresses directly into:
- `contracts/deployments/polygon-amoy.json`
- `src/config/polygonAmoyDeployment.json` (read automatically by the web app)

### 4. Add Addresses to Vercel (Optional Override)
In your Vercel Project Settings → Environment Variables, set:
- `VITE_ANAGU_TOKEN_ADDRESS=<deployed AnaguToken 0x address>`
- `VITE_ANAGU_LAND_TITLE_NFT_ADDRESS=<deployed AnaguLandTitleNFT 0x address>`

You can also paste both deployed addresses directly inside the **Admin Portal → Polygon Amoy Smart Contracts** card to activate them immediately in your browser without rebuilding.

---

## Option B — Browser Deployment via Remix IDE + MetaMask

1. Open https://remix.ethereum.org and switch MetaMask to **Polygon Amoy Testnet** (Chain ID `80002`, RPC `https://rpc-amoy.polygon.technology`).
2. Upload `contracts/contracts/AnaguToken.sol` and `contracts/contracts/AnaguLandTitleNFT.sol`.
3. Compile with **Solidity `0.8.24`**, **EVM Version `paris`**, Optimization enabled (`200` runs).
4. In **Deploy & Run Transactions**, choose **Injected Provider - MetaMask**:
   - Deploy `AnaguToken`:
     - `initialAdmin`: your wallet `0x...`
     - `initialRegistrar`: your wallet `0x...`
     - `initialTreasury`: your wallet `0x...`
     - `initialSupply`: `10000000000000000000000000` (10,000,000 ANAGU)
     - `initialRegFee`: `50000000000000000000` (50 ANAGU)
     - `enableFaucet`: `true`
   - Deploy `AnaguLandTitleNFT`:
     - `initialAdmin`: your wallet `0x...`
     - `initialRegistrar`: your wallet `0x...`
     - `initialOracle`: your wallet `0x...`
     - `initialGovernor`: your wallet `0x...`
5. Paste the two deployed Polygon Amoy addresses into `src/config/polygonAmoyDeployment.json` (or `.env` / Admin Portal Contract Configuration).
