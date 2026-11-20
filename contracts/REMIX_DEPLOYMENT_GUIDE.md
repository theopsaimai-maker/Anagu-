# ANAGU Land Title NFT — Remix IDE & Hyperledger Besu QBFT Deployment Guide

This guide explains how to start the local private **ANAGU Hyperledger Besu QBFT** network (`blockchain/besu/`), connect **MetaMask** and **Remix IDE**, and prepare deployment of `AnaguLandTitleNFT.sol` onto Chain ID `13371`.

> **Security notice:** Never paste private keys into source code, scripts, or shared documents. Perform all signing through an authorized institutional wallet (or clearly labeled test-only local MetaMask accounts when testing against the local Besu development network). Never reuse development accounts for institutional production wallets.

---

## 1. Contract & Besu EVM Compatibility (Verified)

| Parameter | Value |
| :--- | :--- |
| **Contract Source File** | `contracts/contracts/AnaguLandTitleNFT.sol` |
| **Contract Name** | `AnaguLandTitleNFT` |
| **Solidity Compiler** | `0.8.24` (exact pragma `pragma solidity 0.8.24;`) |
| **OpenZeppelin Contracts** | `v5.0.2` (pinned in `contracts/package.json` for `paris` / `london` EVM compatibility) |
| **Optimization** | Enabled, `200` runs |
| **Solidity EVM Target** | `paris` (verified opcode scan: `0` `PUSH0`, `0` `MCOPY`, `0` `TLOAD`/`TSTORE`, `0` `PREVRANDAO`) |
| **Local Besu QBFT Image** | `hyperledger/besu:24.12.2` |
| **Local Besu EVM Fork** | `londonBlock: 0` + `zeroBaseFee: true` (fully compatible with the verified `paris` bytecode) |
| **Exported ABI** | `contracts/abi/AnaguLandTitleNFT.abi.json` |
| **Build Metadata** | `contracts/abi/AnaguLandTitleNFT.build-info.json` (`12,467` bytes deployed runtime) |

### Important Remix Note on OpenZeppelin v5 & EVM Version

- OpenZeppelin `5.6.x` uses Cancun's `mcopy` opcode in `Bytes.sol`, which fails on pre-Cancun EVM versions (`london`/`paris`).
- When compiling in Remix for the ANAGU Besu QBFT network (`londonBlock: 0`), use **Solidity `0.8.24`**, **Optimization `200` runs**, **EVM Version = `paris`**, and pin OpenZeppelin imports to `@openzeppelin/contracts@5.0.2/...` if Remix auto-resolves a `5.6.x` release.

---

## 2. Start & Verify the Local Besu QBFT Network

From `blockchain/besu/` on a machine with Docker installed:

```bash
chmod +x scripts/init-network.sh scripts/verify-network.sh
./scripts/init-network.sh
docker compose up -d
./scripts/verify-network.sh --test-restart
```

Confirm:
- All 4 validators (`anagu-besu-validator1`–`4`) are running.
- Local RPC endpoint is bound strictly to `http://127.0.0.1:8545`.
- `eth_chainId` returns `0x343b` (`13371`).
- `eth_blockNumber` is increasing every ~2 seconds.
- `qbft_getValidatorsByBlockNumber` returns 4 validator addresses.

*(For remote/institutional staging or production Besu networks, obtain the authorized RPC URL from your infrastructure operator rather than using localhost.)*

---

## 3. Add the ANAGU Besu Network to MetaMask

1. Open MetaMask → **Settings → Networks → Add a network manually**.
2. Enter:
   - **Network Name:** `ANAGU Besu Registry (Local QBFT)`
   - **New RPC URL:** `http://127.0.0.1:8545` *(for the local Docker network started in Step 2; replace with your organization's Besu RPC URL for non-local environments)*
   - **Chain ID:** `13371`
   - **Currency Symbol:** `ANAGU` *(or `ETH`; this private network uses `zeroBaseFee: true` and `min-gas-price=0`)*
3. Save and switch MetaMask to `ANAGU Besu Registry (Local QBFT)`.
4. Confirm Chain ID `13371` is active (no chain mismatch warning in MetaMask).

> **Note on zero-gas private Besu & MetaMask:** Because the local genesis sets `"zeroBaseFee": true` and `min-gas-price=0`, transactions require `0` gas cost. If MetaMask requires a non-zero test balance before letting you click Confirm, you may add your own local **test-only** MetaMask address to `"alloc"` in `blockchain/besu/qbftConfigFile.json` before running `./scripts/init-network.sh --force` (never put production keys or real mainnet addresses there).

---

## 4. Compile & Connect in Remix IDE

1. Open **Remix IDE** (`https://remix.ethereum.org`).
   - Note: `blockchain/besu/config/validator1.toml` explicitly allows `https://remix.ethereum.org` and `http://remix.ethereum.org` in `rpc-http-cors-origins` for local development.
2. Upload `contracts/contracts/AnaguLandTitleNFT.sol` into Remix.
3. Open the **Solidity Compiler** tab:
   - **Compiler:** `0.8.24+commit.e11b9ed9`
   - **Enable optimization:** checked, `200` runs
   - **EVM Version:** `paris`
   - Click **Compile AnaguLandTitleNFT.sol** and confirm zero errors.
4. Open the **Deploy & Run Transactions** tab:
   - **Environment:** `Injected Provider - MetaMask`
   - Confirm Remix displays **`Custom (13371) network`** and your selected MetaMask deployer account.

---

## 5. Constructor Parameters & Least-Privilege Role Setup

`AnaguLandTitleNFT` requires **4 constructor parameters**:

```solidity
constructor(
    address initialAdmin,
    address initialRegistrar,
    address initialOracle,
    address initialGovernor
)
```

| Parameter | Required | Role Granted | Institutional Responsibility |
| :--- | :--- | :--- | :--- |
| `initialAdmin` | **Yes** (non-zero) | `DEFAULT_ADMIN_ROLE` | Role administration only (cannot attest, mint, transfer, or revoke) |
| `initialRegistrar` | Optional (`0x000...000` allowed) | `REGISTRAR_ROLE` | Mints attested titles (`mintTitle`) and executes approved transfers (`registryTransfer`) |
| `initialOracle` | Optional (`0x000...000` allowed) | `ORACLE_ROLE` | Records pre-mint attestations (`recordOracleAttestation`) |
| `initialGovernor` | Optional (`0x000...000` allowed) | `GOVERNOR_ROLE` | Records Section 28 statutory revocations (`revokeTitle`) |

### Assigning the First Registrar, Oracle, and Governor Accounts

- **Option A (Recommended — assign all four segregated addresses at deploy time):** Provide four distinct wallet addresses for `initialAdmin`, `initialRegistrar`, `initialOracle`, and `initialGovernor` in Remix before clicking **Deploy**.
- **Option B (Deferred assignment via `grantRole`):** Deploy with `initialAdmin` set and `0x0000000000000000000000000000000000000000` for the three operational roles; then read `REGISTRAR_ROLE()`, `ORACLE_ROLE()`, and `GOVERNOR_ROLE()` from the deployed contract and call `grantRole(roleHash, accountAddress)` from `initialAdmin`.

---

## 6. Post-Deployment Verification Checklist (Phase 3.3 Prerequisite)

After deploying via Remix (do **not** execute during Phase 3.2):
1. Record the deployed contract address and deployment transaction hash.
2. Verify read calls in Remix: `name()` → `"ANAGU Land Title NFT"`, `symbol()` → `"ANAGU-TITLE"`, `totalMintedTitles()` → `0`, and `hasRole(...)` for each segregated role.
3. Verify on one test parcel: `recordOracleAttestation` (`ORACLE_ROLE`) → `mintTitle` (`REGISTRAR_ROLE`) → confirm P2P `transferFrom` reverts (`PeerToPeerTransferBlocked`) → `registryTransfer` (`REGISTRAR_ROLE`) → `revokeTitle` (`GOVERNOR_ROLE`).
