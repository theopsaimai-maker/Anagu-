# ANAGU Private Hyperledger Besu QBFT Network (Local Development)

> **TEST-ONLY DEVELOPMENT NETWORK:** This 4-validator Hyperledger Besu QBFT setup is designed for local contract development, Remix IDE testing, and Phase 3.3 integration testing. Do **not** expose it publicly or reuse generated development validator keys for institutional production wallets.

---

## Architecture Summary

| Setting | Value |
| :--- | :--- |
| **Besu Docker Image** | `hyperledger/besu:24.12.2` (pinned) |
| **Consensus** | QBFT (`blockperiodseconds: 2`, `epochlength: 30000`, `requesttimeoutseconds: 4`) |
| **Chain ID** | `13371` (`0x343b`) |
| **Validators** | 4 (`validator1`–`validator4`) on private Docker bridge `172.26.0.0/24` |
| **EVM Fork** | `londonBlock: 0` with `zeroBaseFee: true` (100% compatible with `AnaguLandTitleNFT.sol` compiled with `solc 0.8.24` / `evmVersion: "paris"`) |
| **Local Host RPC** | `http://127.0.0.1:8545` (bound strictly to `127.0.0.1` on `validator1`; `ETH`, `NET`, `WEB3`, `QBFT` only) |
| **Persistent Storage** | Named Docker volumes `besu-validator1-data` through `besu-validator4-data` |

---

## Security Controls

- **Localhost-only RPC:** `docker-compose.yml` publishes `127.0.0.1:8545:8545` on `validator1` only; `validator2`–`validator4` disable HTTP RPC and publish zero host ports.
- **No unrestricted account unlocking:** `PERSONAL`, `ADMIN`, and `DEBUG` RPC namespaces are disabled; no wallet private keys are stored in Besu nodes or source files.
- **Closed validator mesh:** `discovery-enabled=false` forces peers strictly to `config/static-nodes.json`.
- **Git isolation:** `blockchain/besu/.gitignore` excludes `nodes/`, `networkFiles/`, `config/genesis.json`, and `config/static-nodes.json` so generated test-only keys are never committed.

---

## Startup, Verification, and Shutdown Commands

Run these commands from `blockchain/besu/` on a host machine with Docker Engine / Docker Desktop installed:

```bash
# 1. Make scripts executable (first time only)
chmod +x scripts/init-network.sh scripts/verify-network.sh

# 2. Generate 4 TEST-ONLY validator keypairs, QBFT genesis.json, and static-nodes.json
./scripts/init-network.sh

# 3. Start all four QBFT validators in detached mode
docker compose up -d

# 4. Wait ~10 seconds for peer mesh & first blocks, then run verification (including restart persistence check)
./scripts/verify-network.sh --test-restart
```

### Stopping & Resetting

```bash
# Stop containers while preserving blockchain data volumes and keys
docker compose down

# Restart later with all previously mined blocks intact
docker compose up -d

# Full destructive reset (wipes persistent blockchain volumes)
docker compose down -v
```

### Manual JSON-RPC Checks (Optional)

```bash
# Confirm Chain ID 13371 (0x343b)
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://127.0.0.1:8545

# Confirm active QBFT validator list (4 addresses)
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"qbft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
  http://127.0.0.1:8545

# Confirm latest block height
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:8545
```

---

## Running Without Installing Docker on Your Personal Computer

Because Google AI Studio runs inside an ephemeral gVisor web sandbox (no Docker daemon, no Java/Besu binary, no persistent multi-container volumes, and no port-8545 RPC exposure), the 4-validator Besu network must run on an external Docker-capable Linux host. If you do not want Docker on your personal computer, the two simplest genuine options are:

1. **Small Cloud Linux VM + SSH Tunnel (recommended for persistent testing & Phase 3.3 backend integration):**
   - Provision an Ubuntu 24.04 VM (minimum 2 vCPU / 4–8 GB RAM, e.g. Google Cloud Compute Engine `e2-standard-2`) with Docker Engine + Docker Compose plugin installed.
   - Clone/copy the repository, enter `blockchain/besu/`, and run:
     ```bash
     bash scripts/init-network.sh
     docker compose up -d
     bash scripts/verify-network.sh --test-restart
     ```
   - Keep port `8545` closed in the cloud firewall. From your personal computer, open a private SSH tunnel so MetaMask and Remix connect to `http://127.0.0.1:8545` over encrypted SSH:
     ```bash
     ssh -N -L 127.0.0.1:8545:127.0.0.1:8545 <vm-user>@<vm-ip-or-host>
     ```
2. **GitHub Codespaces (fastest zero-install browser VM for short test sessions):**
   - Push the repository to GitHub (generated keys are already gitignored) and launch a 4-core GitHub Codespace (Docker & Docker Compose are pre-installed).
   - Run the same 3 commands in `blockchain/besu/`. (Note: Codespaces stops idle VMs automatically; use a Cloud Linux VM for continuous persistence.)

