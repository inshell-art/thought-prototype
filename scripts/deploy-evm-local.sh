#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVM_DIR="$ROOT_DIR/evm"
ADDRESSES_FILE="$EVM_DIR/addresses.anvil.json"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd cast
require_cmd forge
require_cmd python3

if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "Anvil RPC is not reachable at $RPC_URL" >&2
  echo "Start it with: anvil" >&2
  exit 1
fi

tmp_seed="$(mktemp)"
tmp_previewer="$(mktemp)"
trap 'rm -f "$tmp_seed" "$tmp_previewer"' EXIT

(
  cd "$EVM_DIR"
  forge create src/SeedGenerator.sol:SeedGenerator \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --json >"$tmp_seed"

  forge create src/ThoughtPreviewer.sol:ThoughtPreviewer \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --json >"$tmp_previewer"
)

SEED_ADDRESS="$(python3 - "$tmp_seed" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["deployedTo"])
PY
)"

PREVIEWER_ADDRESS="$(python3 - "$tmp_previewer" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["deployedTo"])
PY
)"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"

python3 - "$ADDRESSES_FILE" "$RPC_URL" "$CHAIN_ID" "$SEED_ADDRESS" "$PREVIEWER_ADDRESS" <<'PY'
import json, sys

out_path, rpc_url, chain_id, seed_address, previewer_address = sys.argv[1:]
payload = {
    "rpcUrl": rpc_url,
    "chainId": int(chain_id),
    "seedGenerator": {"address": seed_address},
    "thoughtPreviewer": {"address": previewer_address},
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY

echo "SeedGenerator:   $SEED_ADDRESS"
echo "ThoughtPreviewer: $PREVIEWER_ADDRESS"
echo "Wrote $ADDRESSES_FILE"
