#!/usr/bin/env bash
set -euo pipefail

# ANAGU Private Hyperledger Besu QBFT — Local Test-Only Network Initializer
# Generates 4 TEST-ONLY validator keypairs, QBFT genesis.json, and static-nodes.json.
# NEVER reuse generated development validator keys for institutional production wallets.
# NEVER commit generated keys/ or genesis.json containing dev keys to Git.

BESU_IMAGE="hyperledger/besu:24.12.2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FORCE="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH. Install Docker Desktop / Docker Engine first." >&2
  exit 1
fi

cd "${BESU_DIR}"

if [[ -f "config/genesis.json" || -d "nodes/validator1/keys" ]]; then
  if [[ "${FORCE}" != "--force" ]]; then
    echo "[ABORT] Existing generated Besu keys or config/genesis.json detected."
    echo "        To regenerate from scratch, stop containers, remove volumes (docker compose down -v),"
    echo "        and re-run: ./scripts/init-network.sh --force"
    exit 1
  fi
  echo "[WARN] --force supplied: removing previous generated TEST-ONLY keys and staging files..."
  rm -rf networkFiles nodes config/genesis.json config/static-nodes.json
fi

echo "[1/4] Generating 4 TEST-ONLY QBFT validator keys and genesis.json using ${BESU_IMAGE}..."
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${BESU_DIR}:/work" \
  -w /work \
  "${BESU_IMAGE}" \
  operator generate-blockchain-config \
  --config-file=qbftConfigFile.json \
  --to=networkFiles \
  --private-key-file-name=key

cp networkFiles/genesis.json config/genesis.json

echo "[2/4] Distributing TEST-ONLY validator keypairs to nodes/validator{1..4}/keys/..."
VALIDATOR_IPS=("172.26.0.11" "172.26.0.12" "172.26.0.13" "172.26.0.14")
KEY_DIRS=()
while IFS= read -r dir; do
  KEY_DIRS+=("${dir}")
done < <(find networkFiles/keys -mindepth 1 -maxdepth 1 -type d | sort)

if [[ "${#KEY_DIRS[@]}" -ne 4 ]]; then
  echo "[ERROR] Expected 4 generated validator key directories, found ${#KEY_DIRS[@]}." >&2
  exit 1
fi

HOST_UID="$(id -u)"
STATIC_NODES_ENTRIES=()
echo "[3/4] Writing config/static-nodes.json for internal private bridge mesh (172.26.0.11..14)..."
for i in 0 1 2 3; do
  NODE_NUM=$((i + 1))
  SRC_DIR="${KEY_DIRS[$i]}"
  VALIDATOR_ADDR="$(basename "${SRC_DIR}")"
  DEST_DIR="nodes/validator${NODE_NUM}/keys"
  mkdir -p "${DEST_DIR}"
  cp "${SRC_DIR}/key" "${DEST_DIR}/key"
  cp "${SRC_DIR}/key.pub" "${DEST_DIR}/key.pub"
  if [[ "${HOST_UID}" -eq 0 ]]; then
    # Running as root on a Linux VM: assign ownership to container besu user (UID 1000)
    chown 1000:1000 "${DEST_DIR}/key" "${DEST_DIR}/key.pub"
    chmod 600 "${DEST_DIR}/key"
  elif [[ "${HOST_UID}" -eq 1000 ]]; then
    chmod 600 "${DEST_DIR}/key"
  else
    # Non-root host UID differs from container besu UID (1000); allow read-only mount access for TEST-ONLY dev key
    chmod 644 "${DEST_DIR}/key"
  fi
  chmod 644 "${DEST_DIR}/key.pub"

  PUB_HEX="$(tr -d '[:space:]' < "${DEST_DIR}/key.pub" | sed 's/^0x//')"
  STATIC_NODES_ENTRIES+=("  \"enode://${PUB_HEX}@${VALIDATOR_IPS[$i]}:30303\"")
  echo "  - validator${NODE_NUM} (${VALIDATOR_IPS[$i]}): ${VALIDATOR_ADDR} [TEST-ONLY]"
done

{
  echo "["
  for i in 0 1 2 3; do
    if [[ "${i}" -lt 3 ]]; then
      echo "${STATIC_NODES_ENTRIES[$i]},"
    else
      echo "${STATIC_NODES_ENTRIES[$i]}"
    fi
  done
  echo "]"
} > config/static-nodes.json

echo "[4/4] Cleaning temporary networkFiles/ staging folder..."
rm -rf networkFiles

echo ""
echo "[OK] ANAGU Private Besu QBFT (Chain ID 13371) configuration initialized."
echo "     Start the 4-validator network with: docker compose up -d"
echo "     Verify RPC and block production:    ./scripts/verify-network.sh"
