#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVM_DIR="$ROOT_DIR/evm"
ADDRESSES_FILE="$EVM_DIR/addresses.anvil.json"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
PATH_NFT_ADDRESS="${PATH_NFT_ADDRESS:-}"
CONFIGURE_PATH_MOVEMENT="${CONFIGURE_PATH_MOVEMENT:-1}"
THOUGHT_MOVEMENT_QUOTA="${THOUGHT_MOVEMENT_QUOTA:-1}"
THOUGHT_SPEC_NAME="${THOUGHT_SPEC_NAME:-THOUGHT.v1.md}"
THOUGHT_SPEC_FILE="${THOUGHT_SPEC_FILE:-$ROOT_DIR/$THOUGHT_SPEC_NAME}"
THOUGHT_SPEC_REF="${THOUGHT_SPEC_REF:-$THOUGHT_SPEC_NAME}"
MAX_THOUGHT_SPEC_BYTES="${MAX_THOUGHT_SPEC_BYTES:-20000}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd cast
require_cmd forge
require_cmd node
require_cmd python3

if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "Anvil RPC is not reachable at $RPC_URL" >&2
  echo "Start it with: anvil" >&2
  exit 1
fi

if [[ -z "$PATH_NFT_ADDRESS" ]]; then
  echo "PATH_NFT_ADDRESS is required." >&2
  echo "Deploy PATH first, then rerun with PATH_NFT_ADDRESS=<PathNFT address>." >&2
  exit 1
fi

tmp_spec="$(mktemp)"
tmp_seed="$(mktemp)"
tmp_color_font="$(mktemp)"
tmp_previewer="$(mktemp)"
tmp_registry="$(mktemp)"
tmp_token="$(mktemp)"
trap 'rm -f "$tmp_spec" "$tmp_seed" "$tmp_color_font" "$tmp_previewer" "$tmp_registry" "$tmp_token"' EXIT

node --input-type=module - "$THOUGHT_SPEC_NAME" "$THOUGHT_SPEC_FILE" "$THOUGHT_SPEC_REF" "$MAX_THOUGHT_SPEC_BYTES" >"$tmp_spec" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const [specName, specFile, specRef, maxBytesRaw] = process.argv.slice(2);
const maxBytes = Number(maxBytesRaw);
const filename = path.basename(specFile);
const match = /^THOUGHT\.v([1-9][0-9]*)\.md$/.exec(specName);

if (!match) {
  throw new Error(`invalid THOUGHT spec name: ${specName}`);
}
if (filename !== specName) {
  throw new Error(`THOUGHT spec filename/name mismatch: ${filename} != ${specName}`);
}

const bytes = fs.readFileSync(specFile);
if (bytes.length === 0) {
  throw new Error("THOUGHT spec file is empty");
}
if (bytes.length > maxBytes) {
  throw new Error(`THOUGHT spec file exceeds ${maxBytes} bytes`);
}
if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
  throw new Error("THOUGHT spec file has UTF-8 BOM");
}
if (bytes.includes(0x0d)) {
  throw new Error("THOUGHT spec file contains CR/CRLF line endings");
}

const text = bytes.toString("utf8");
if (!text.includes(`Version: v${match[1]}`)) {
  throw new Error(`THOUGHT spec file must contain Version: v${match[1]}`);
}

const payload = {
  name: specName,
  ref: specRef,
  id: ethers.id(specName),
  hash: ethers.keccak256(bytes),
  bytes: `0x${bytes.toString("hex")}`,
  byteLength: bytes.length,
};
process.stdout.write(`${JSON.stringify(payload)}\n`);
NODE

THOUGHT_SPEC_ID="$(python3 - "$tmp_spec" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["id"])
PY
)"
THOUGHT_SPEC_HASH="$(python3 - "$tmp_spec" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["hash"])
PY
)"
THOUGHT_SPEC_BYTES="$(python3 - "$tmp_spec" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["bytes"])
PY
)"
THOUGHT_SPEC_BYTE_LENGTH="$(python3 - "$tmp_spec" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["byteLength"])
PY
)"

(
  cd "$EVM_DIR"
  forge create \
    --broadcast \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json \
    src/SeedGenerator.sol:SeedGenerator >"$tmp_seed"

  forge create \
    --broadcast \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json \
    src/ColorFontV1.sol:ColorFontV1 >"$tmp_color_font"

  forge create \
    --broadcast \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json \
    src/ThoughtPreviewer.sol:ThoughtPreviewer >"$tmp_previewer"

  forge create \
    --broadcast \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json \
    src/ThoughtSpecRegistry.sol:ThoughtSpecRegistry >"$tmp_registry"
)

REGISTRY_ADDRESS="$(python3 - "$tmp_registry" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["deployedTo"])
PY
)"

COLOR_FONT_ADDRESS="$(python3 - "$tmp_color_font" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["deployedTo"])
PY
)"

cast send "$REGISTRY_ADDRESS" \
  "registerThoughtSpec(string,string,bytes)" \
  "$THOUGHT_SPEC_NAME" \
  "$THOUGHT_SPEC_REF" \
  "$THOUGHT_SPEC_BYTES" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" >/dev/null

REGISTERED_PAIR="$(cast call "$REGISTRY_ADDRESS" \
  "isRegisteredThoughtSpec(bytes32,bytes32)(bool)" \
  "$THOUGHT_SPEC_ID" \
  "$THOUGHT_SPEC_HASH" \
  --rpc-url "$RPC_URL")"
if [[ "$REGISTERED_PAIR" != "true" ]]; then
  echo "Registered THOUGHT spec ID/hash pair did not validate." >&2
  exit 1
fi

READBACK_HASH="$(cast call "$REGISTRY_ADDRESS" \
  "thoughtSpecBytes(bytes32)(bytes)" \
  "$THOUGHT_SPEC_ID" \
  --rpc-url "$RPC_URL" | node --input-type=module -e 'import { ethers } from "ethers"; let input = ""; process.stdin.on("data", c => input += c); process.stdin.on("end", () => console.log(ethers.keccak256(input.trim())));')"
if [[ "$READBACK_HASH" != "$THOUGHT_SPEC_HASH" ]]; then
  echo "THOUGHT spec readback hash mismatch." >&2
  exit 1
fi

(
  cd "$EVM_DIR"
  forge create \
    --broadcast \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json \
    src/ThoughtNFT.sol:ThoughtNFT \
    --constructor-args "$PATH_NFT_ADDRESS" "$REGISTRY_ADDRESS" "$COLOR_FONT_ADDRESS" >"$tmp_token"
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

TOKEN_ADDRESS="$(python3 - "$tmp_token" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["deployedTo"])
PY
)"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
THOUGHT_MOVEMENT="$(cast format-bytes32-string THOUGHT)"

if [[ "$CONFIGURE_PATH_MOVEMENT" == "1" ]]; then
  cast send "$PATH_NFT_ADDRESS" \
    "setMovementConfig(bytes32,address,uint32)" \
    "$THOUGHT_MOVEMENT" \
    "$TOKEN_ADDRESS" \
    "$THOUGHT_MOVEMENT_QUOTA" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" >/dev/null
  cast send "$PATH_NFT_ADDRESS" \
    "freezeMovementConfig(bytes32)" \
    "$THOUGHT_MOVEMENT" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" >/dev/null
fi

python3 - "$ADDRESSES_FILE" "$RPC_URL" "$CHAIN_ID" "$SEED_ADDRESS" "$COLOR_FONT_ADDRESS" "$PREVIEWER_ADDRESS" "$REGISTRY_ADDRESS" "$TOKEN_ADDRESS" "$PATH_NFT_ADDRESS" "$THOUGHT_MOVEMENT_QUOTA" "$THOUGHT_SPEC_NAME" "$THOUGHT_SPEC_ID" "$THOUGHT_SPEC_HASH" "$THOUGHT_SPEC_REF" "$THOUGHT_SPEC_BYTE_LENGTH" <<'PY'
import json, sys

out_path, rpc_url, chain_id, seed_address, color_font_address, previewer_address, registry_address, token_address, path_nft_address, thought_movement_quota, thought_spec_name, thought_spec_id, thought_spec_hash, thought_spec_ref, thought_spec_byte_length = sys.argv[1:]
payload = {
    "rpcUrl": rpc_url,
    "chainId": int(chain_id),
    "pathNft": {"address": path_nft_address},
    "pathMovement": {"name": "THOUGHT", "quota": int(thought_movement_quota)},
    "seedGenerator": {"address": seed_address},
    "colorFontV1": {"address": color_font_address},
    "thoughtPreviewer": {"address": previewer_address},
    "thoughtSpecRegistry": {"address": registry_address},
    "thoughtSpecs": [
        {
            "specName": thought_spec_name,
            "specId": thought_spec_id,
            "specHash": thought_spec_hash,
            "ref": thought_spec_ref,
            "byteLength": int(thought_spec_byte_length),
        }
    ],
    "recommendedThoughtSpecName": thought_spec_name,
    "recommendedThoughtSpecId": thought_spec_id,
    "recommendedThoughtSpecHash": thought_spec_hash,
    "thoughtSpec": {
        "specName": thought_spec_name,
        "id": thought_spec_id,
        "hash": thought_spec_hash,
        "ref": thought_spec_ref,
    },
    "thoughtNft": {"address": token_address},
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY

echo "SeedGenerator:   $SEED_ADDRESS"
echo "ColorFontV1:     $COLOR_FONT_ADDRESS"
echo "ThoughtPreviewer: $PREVIEWER_ADDRESS"
echo "ThoughtSpecRegistry: $REGISTRY_ADDRESS"
echo "ThoughtNFT:    $TOKEN_ADDRESS"
echo "PathNFT:         $PATH_NFT_ADDRESS"
if [[ "$CONFIGURE_PATH_MOVEMENT" == "1" ]]; then
  echo "Configured and froze PATH THOUGHT movement to $TOKEN_ADDRESS with quota $THOUGHT_MOVEMENT_QUOTA"
else
  echo "Skipped PATH movement config. Run PathNFT.setMovementConfig(THOUGHT, $TOKEN_ADDRESS, $THOUGHT_MOVEMENT_QUOTA), then PathNFT.freezeMovementConfig(THOUGHT)."
fi
echo "Wrote $ADDRESSES_FILE"
