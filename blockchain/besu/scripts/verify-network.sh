#!/usr/bin/env bash
set -euo pipefail

# ANAGU Private Hyperledger Besu QBFT — Local Network Verification Script
# Verifies all 4 validators, peer mesh, Chain ID 13371, live block production,
# QBFT validator set, and optional persistence across validator restart.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RPC_URL="${BESU_LOCAL_RPC_URL:-http://127.0.0.1:8545}"
TEST_RESTART="${1:-}"

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  curl -sf -X POST \
    -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":1}" \
    "${RPC_URL}"
}

hex_to_dec() {
  local hex="${1#0x}"
  printf "%d" "$((16#${hex}))"
}

cd "${BESU_DIR}"

echo "[1/6] Checking Docker containers..."
for n in 1 2 3 4; do
  STATUS="$(docker inspect -f '{{.State.Running}}' "anagu-besu-validator${n}" 2>/dev/null || echo "false")"
  if [[ "${STATUS}" != "true" ]]; then
    echo "[FAIL] Container anagu-besu-validator${n} is not running." >&2
    exit 1
  fi
  echo "  - anagu-besu-validator${n}: running"
done

echo "[2/6] Querying eth_chainId on ${RPC_URL}..."
CHAIN_RESP="$(rpc_call "eth_chainId")"
CHAIN_HEX="$(echo "${CHAIN_RESP}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
if [[ "${CHAIN_HEX}" != "0x343b" ]]; then
  echo "[FAIL] Expected chainId 0x343b (13371), got: ${CHAIN_RESP}" >&2
  exit 1
fi
echo "  - eth_chainId = ${CHAIN_HEX} ($(hex_to_dec "${CHAIN_HEX}")) [OK]"

echo "[3/6] Querying net_peerCount..."
PEER_RESP="$(rpc_call "net_peerCount")"
PEER_HEX="$(echo "${PEER_RESP}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
PEER_DEC="$(hex_to_dec "${PEER_HEX:-0x0}")"
if [[ "${PEER_DEC}" -lt 3 ]]; then
  echo "[FAIL] Expected at least 3 connected peers on validator1, got ${PEER_DEC} (${PEER_RESP})" >&2
  exit 1
fi
echo "  - net_peerCount = ${PEER_HEX} (${PEER_DEC} peers connected) [OK]"

echo "[4/6] Querying qbft_getValidatorsByBlockNumber (latest)..."
VAL_RESP="$(rpc_call "qbft_getValidatorsByBlockNumber" '["latest"]')"
VAL_COUNT="$(echo "${VAL_RESP}" | grep -oE '0x[0-9a-fA-F]{40}' | wc -l | tr -d ' ')"
if [[ "${VAL_COUNT}" -ne 4 ]]; then
  echo "[FAIL] Expected 4 QBFT validators, got ${VAL_COUNT} (${VAL_RESP})" >&2
  exit 1
fi
echo "  - QBFT active validator count = ${VAL_COUNT} [OK]"

echo "[5/6] Verifying QBFT block production..."
B1_RESP="$(rpc_call "eth_blockNumber")"
B1_HEX="$(echo "${B1_RESP}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
B1_DEC="$(hex_to_dec "${B1_HEX:-0x0}")"
echo "  - Initial block height: ${B1_DEC} (${B1_HEX}); waiting 5 seconds..."
sleep 5
B2_RESP="$(rpc_call "eth_blockNumber")"
B2_HEX="$(echo "${B2_RESP}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
B2_DEC="$(hex_to_dec "${B2_HEX:-0x0}")"
if [[ "${B2_DEC}" -le "${B1_DEC}" ]]; then
  echo "[FAIL] Block height did not advance (${B1_DEC} -> ${B2_DEC})." >&2
  exit 1
fi
echo "  - Subsequent block height: ${B2_DEC} (${B2_HEX}) [ADVANCING OK]"

if [[ "${TEST_RESTART}" == "--test-restart" ]]; then
  echo "[6/6] Verifying persistent blockchain data across validator1 restart..."
  docker compose restart validator1 >/dev/null
  sleep 6
  B3_RESP="$(rpc_call "eth_blockNumber")"
  B3_HEX="$(echo "${B3_RESP}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
  B3_DEC="$(hex_to_dec "${B3_HEX:-0x0}")"
  if [[ "${B3_DEC}" -lt "${B2_DEC}" ]]; then
    echo "[FAIL] Block height regressed after restart (${B2_DEC} -> ${B3_DEC})." >&2
    exit 1
  fi
  echo "  - Post-restart block height: ${B3_DEC} (>= ${B2_DEC}) [PERSISTENCE OK]"
else
  echo "[6/6] Skipping restart persistence test (run with --test-restart to verify volume persistence)."
fi

echo ""
echo "[PASS] ANAGU Private Besu QBFT network verification succeeded."
