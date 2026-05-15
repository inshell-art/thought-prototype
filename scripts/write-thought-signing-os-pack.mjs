import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const defaultPathFeRelease = path.resolve(root, "../path/artifacts/sepolia/current/fe-release");
const defaultOutRoot = path.resolve(root, "artifacts/sepolia/current/signing-os-packs");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  if (mode) fs.chmodSync(file, mode);
}

function writeJson(file, value) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256HexBytes(bytes) {
  return `0x${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function gitCommit(repo) {
  return run("git", ["-C", repo, "rev-parse", "HEAD"]);
}

function gitRemote(repo) {
  try {
    return run("git", ["-C", repo, "remote", "get-url", "origin"]);
  } catch {
    return null;
  }
}

function requireAddress(value, label) {
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${label}: ${value}`);
  return ethers.getAddress(value);
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function loadPathRelease(dir) {
  const addressesFile = path.join(dir, "addresses.sepolia.json");
  const releaseFile = path.join(dir, "protocol-release.sepolia.json");
  if (!fs.existsSync(addressesFile)) throw new Error(`Missing PATH FE addresses: ${addressesFile}`);
  if (!fs.existsSync(releaseFile)) throw new Error(`Missing PATH FE release: ${releaseFile}`);
  const addresses = readJson(addressesFile);
  const release = readJson(releaseFile);
  const pathRepoRoot = path.resolve(dir, "../../../..");
  return {
    dir,
    addresses,
    release,
    pathNft: requireAddress(addresses.path_nft, "path_nft"),
    pathPulseAdapter: requireAddress(addresses.path_pulse_adapter, "path_pulse_adapter"),
    pulseAuction: requireAddress(addresses.pulse_auction, "pulse_auction"),
    admin: requireAddress(release.admin, "release.admin"),
    network: release.network,
    chainId: Number(release.chain_id),
    runId: release.deploy_run_id,
    releaseRepoCommit: release.repo_commit,
    qualifiedRepoCommit: fs.existsSync(pathRepoRoot) ? gitCommit(pathRepoRoot) : null
  };
}

function validateSpec(specName, specFile, maxBytes) {
  const match = /^THOUGHT\.v([1-9][0-9]*)\.md$/.exec(specName);
  if (!match) throw new Error(`Invalid spec name: ${specName}`);
  if (path.basename(specFile) !== specName) throw new Error(`Spec filename/name mismatch: ${path.basename(specFile)} != ${specName}`);
  const bytes = fs.readFileSync(specFile);
  if (bytes.length === 0) throw new Error("Spec file is empty");
  if (bytes.length > maxBytes) throw new Error(`Spec exceeds ${maxBytes} bytes`);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("Spec has UTF-8 BOM");
  if (bytes.includes(0x0d)) throw new Error("Spec has CR/CRLF line endings");
  const text = bytes.toString("utf8");
  if (!text.includes(`Version: v${match[1]}`)) throw new Error(`Spec must contain Version: v${match[1]}`);
  return {
    name: specName,
    ref: argValue("--spec-ref") ?? process.env.THOUGHT_SPEC_REF ?? specName,
    id: ethers.id(specName),
    hash: ethers.keccak256(bytes),
    byteLength: bytes.length,
    sha256: sha256HexBytes(bytes),
    file: specName
  };
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const mode = fs.statSync(src).mode & 0o777;
  fs.chmodSync(dst, mode);
}

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (!filter(from, entry)) continue;
    if (entry.isDirectory()) copyDir(from, to, filter);
    else if (entry.isFile()) copyFile(from, to);
  }
}

function sourceSnapshot(dst) {
  fs.mkdirSync(dst, { recursive: true });
  const archive = spawnSync("git", ["-C", root, "archive", "--format=tar", "HEAD", "--", ".", ":(exclude)artifacts"], {
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 1024 * 1024 * 200
  });
  if (archive.status !== 0) throw new Error(`git archive failed with status ${archive.status}`);
  const tar = spawnSync("tar", ["-x", "-C", dst], {
    input: archive.stdout,
    stdio: ["pipe", "inherit", "inherit"],
    maxBuffer: 1024 * 1024 * 200
  });
  if (tar.status !== 0) throw new Error(`tar extract failed with status ${tar.status}`);
}

function copyContractArtifact(contract, dstDir) {
  const src = path.join(root, "evm/out", `${contract}.sol`, `${contract}.json`);
  if (!fs.existsSync(src)) throw new Error(`Missing compiled artifact for ${contract}: ${src}. Run npm run build:evm first.`);
  copyFile(src, path.join(dstDir, `${contract}.json`));
}

function listFiles(dir) {
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (rel === "SHA256SUMS.txt") continue;
      if (rel.startsWith("results/") || rel.startsWith("history/")) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(rel);
    }
  }
  walk(dir);
  return out;
}

function unixScript(text) {
  return text.trimStart().replace(/\r\n/g, "\n");
}

function commonSh() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail

PACK_ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
INPUTS_JSON="$PACK_ROOT/inputs.json"
PATH_DEPENDENCY_JSON="$PACK_ROOT/path-dependency.json"
RUN_ID="$(jq -r '.run_id' "$INPUTS_JSON")"
ADMIN_ADDRESS="$(jq -r '.path.admin' "$INPUTS_JSON")"
DEPLOYER_EXPECTED="0x3e4fA9f09d8EDe66561145E1ef3bc127F80ED396"
ENV_FILE="\${SEPOLIA_ENV_FILE:-$HOME/.opsec/path/env/sepolia.env}"
RESULT_DIR=""
LOG_FILE=""
SUMMARY_FILE=""

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
short_hash() { printf '%s' "$1" | cut -c1-12; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

sha256_check() {
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$PACK_ROOT" && sha256sum -c SHA256SUMS.txt)
  else
    (cd "$PACK_ROOT" && shasum -a 256 -c SHA256SUMS.txt)
  fi
}

start_result() {
  local step="$1"
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  RESULT_DIR="$PACK_ROOT/results/\${RUN_ID}-\${step}-\${ts}"
  mkdir -p "$RESULT_DIR"
  LOG_FILE="$RESULT_DIR/\${step}.log"
  SUMMARY_FILE="$RESULT_DIR/SUMMARY.txt"
  exec > >(tee -a "$LOG_FILE") 2>&1
  echo "RUN_ID=$RUN_ID"
  echo "STEP=$step"
  echo "RESULT_DIR=$RESULT_DIR"
}

finish() {
  local status="$1"
  local next="$2"
  {
    echo "RUN_ID=$RUN_ID"
    echo "OVERALL_STATUS=$status"
    echo "NEXT=$next"
    echo "RESULT_DIR=$RESULT_DIR"
  } | tee "$SUMMARY_FILE"
  echo "OVERALL_STATUS=$status"
  echo "NEXT=$next"
  if [ "$status" = "PASS" ]; then exit 0; fi
  exit 1
}

fail() {
  echo "ERROR: $*"
  finish "FAIL" "inspect $RESULT_DIR"
}

need_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required tool: $1"
}

load_env() {
  [ -r "$ENV_FILE" ] || fail "canonical env is not readable: $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
  [ -z "\${SEPOLIA_PRIVATE_KEY:-}" ] || fail "SEPOLIA_PRIVATE_KEY must not be set"
  [ -n "\${SEPOLIA_RPC_URL:-}" ] || fail "SEPOLIA_RPC_URL missing"
  [ -n "\${SEPOLIA_DEPLOY_KEYSTORE_JSON:-}" ] || fail "SEPOLIA_DEPLOY_KEYSTORE_JSON missing"
  [ -r "$SEPOLIA_DEPLOY_KEYSTORE_JSON" ] || fail "deploy keystore not readable"
  if [ -n "\${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE:-}" ]; then
    [ -r "$SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE" ] || fail "deploy password file not readable"
  elif [ -z "\${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD:-}" ]; then
    fail "set exactly one deploy keystore password source"
  fi
  if [ -n "\${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE:-}" ] && [ -n "\${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD:-}" ]; then
    fail "set only one of SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE or SEPOLIA_DEPLOY_KEYSTORE_PASSWORD"
  fi
  [ -n "\${SIGNING_OS_MARKER_FILE:-}" ] || fail "SIGNING_OS_MARKER_FILE missing"
  [ -r "$SIGNING_OS_MARKER_FILE" ] || fail "SIGNING_OS_MARKER_FILE not readable: $SIGNING_OS_MARKER_FILE"
}

deploy_keystore_address() {
  jq -r '.address' "$SEPOLIA_DEPLOY_KEYSTORE_JSON" | sed 's/^0x//; s/^/0x/'
}

assert_deployer_address() {
  local actual
  actual="$(deploy_keystore_address)"
  [ "$(lower "$actual")" = "$(lower "$DEPLOYER_EXPECTED")" ] || fail "deploy keystore address $actual != expected $DEPLOYER_EXPECTED"
}

assert_chain() {
  local chain_id
  chain_id="$(cast chain-id --rpc-url "$SEPOLIA_RPC_URL")"
  [ "$chain_id" = "11155111" ] || fail "wrong chain id: $chain_id"
}

assert_path_dependency() {
  local inputs_path dep_path inputs_admin dep_admin
  inputs_path="$(jq -r '.path.pathNft' "$INPUTS_JSON")"
  dep_path="$(jq -r '.path_nft' "$PATH_DEPENDENCY_JSON")"
  inputs_admin="$(jq -r '.path.admin' "$INPUTS_JSON")"
  dep_admin="$(jq -r '.admin' "$PATH_DEPENDENCY_JSON")"
  [ "$(lower "$inputs_path")" = "$(lower "$dep_path")" ] || fail "PATH NFT mismatch between inputs and dependency"
  [ "$(lower "$inputs_admin")" = "$(lower "$dep_admin")" ] || fail "PATH admin mismatch between inputs and dependency"
}

require_approval() {
  [ -r "$PACK_ROOT/.approval/\${RUN_ID}.approved" ] || fail "approval marker missing; run bin/approve first"
}

hex_file() {
  python3 - "$1" <<'PY'
import pathlib, sys
print('0x' + pathlib.Path(sys.argv[1]).read_bytes().hex())
PY
}
`);
}

function preflightScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"
start_result preflight
need_tool python3
need_tool jq
need_tool cast
need_tool forge
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then fail "missing sha256sum or shasum"; fi
load_env
assert_deployer_address
assert_chain
sha256_check
assert_path_dependency
[ -d "$PACK_ROOT/source/evm/src" ] || fail "source snapshot missing"
[ -r "$PACK_ROOT/artifacts/contracts/ThoughtNFT.json" ] || fail "compiled ThoughtNFT artifact missing"
echo "deploy signer: $(deploy_keystore_address)"
echo "admin signer: $ADMIN_ADDRESS"
finish PASS "run bin/verify"
`);
}

function verifyScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"
start_result verify
need_tool python3
need_tool jq
need_tool cast
load_env
assert_deployer_address
assert_chain
sha256_check
assert_path_dependency
jq -e '.network == "sepolia" and .chain_id == 11155111 and .path.movement == "THOUGHT" and .path.movementQuota == 1' "$INPUTS_JSON" >/dev/null || fail "inputs schema check failed"
PATH_NFT="$(jq -r '.path.pathNft' "$INPUTS_JSON")"
MOVEMENT="$(jq -r '.path.movementBytes32' "$INPUTS_JSON")"
CODE="$(cast code --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT")"
[ "$CODE" != "0x" ] || fail "no code at PATH NFT $PATH_NFT"
DEFAULT_ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"
ADMIN_HAS_ROLE="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'hasRole(bytes32,address)(bool)' "$DEFAULT_ADMIN_ROLE" "$ADMIN_ADDRESS")"
[ "$ADMIN_HAS_ROLE" = "true" ] || fail "PATH admin $ADMIN_ADDRESS does not hold DEFAULT_ADMIN_ROLE"
MINTER="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'getAuthorizedMinter(bytes32)(address)' "$MOVEMENT")"
QUOTA="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'getMovementQuota(bytes32)(uint32)' "$MOVEMENT")"
FROZEN="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'isMovementFrozen(bytes32)(bool)' "$MOVEMENT")"
if [ "\${ALLOW_RECOVERY_PACK:-0}" != "1" ]; then
  [ "$(lower "$MINTER")" = "0x0000000000000000000000000000000000000000" ] || fail "PATH THOUGHT movement already has minter: $MINTER"
  [ "$QUOTA" = "0" ] || fail "PATH THOUGHT movement already has quota: $QUOTA"
  [ "$FROZEN" = "false" ] || fail "PATH THOUGHT movement already frozen: $FROZEN"
fi
DEPLOYER="$(deploy_keystore_address)"
DEPLOYER_BALANCE="$(cast balance --rpc-url "$SEPOLIA_RPC_URL" "$DEPLOYER")"
ADMIN_BALANCE="$(cast balance --rpc-url "$SEPOLIA_RPC_URL" "$ADMIN_ADDRESS")"
MIN_DEPLOYER_BALANCE_WEI="\${MIN_DEPLOYER_BALANCE_WEI:-100000000000000000}"
MIN_ADMIN_BALANCE_WEI="\${MIN_ADMIN_BALANCE_WEI:-1000000000000000}"
python3 - "$DEPLOYER_BALANCE" "$MIN_DEPLOYER_BALANCE_WEI" "$ADMIN_BALANCE" "$MIN_ADMIN_BALANCE_WEI" <<'PY' || exit 1
import sys
bal, min_bal, admin_bal, min_admin = map(int, sys.argv[1:])
if bal < min_bal:
    raise SystemExit(f"deployer balance too low: {bal} < {min_bal}")
if admin_bal < min_admin:
    raise SystemExit(f"admin balance too low: {admin_bal} < {min_admin}")
PY
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-git --redact --source "$PACK_ROOT"
else
  if find "$PACK_ROOT" -type f \\( -name '*.env' -o -name '*.pem' -o -name '*.key' \\) | grep -q .; then
    fail "secret-like files present in pack"
  fi
fi
echo "PATH admin role: $ADMIN_HAS_ROLE"
echo "PATH prestate: minter=$MINTER quota=$QUOTA frozen=$FROZEN"
echo "balances: deployer=$DEPLOYER_BALANCE admin=$ADMIN_BALANCE"
finish PASS "run bin/approve"
`);
}

function approveScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"
start_result approve
sha256_check
BUNDLE_HASH="$(jq -r '.pack_hash' "$PACK_ROOT/PACK-MANIFEST.json")"
INPUT_HASH="$(sha256_file "$INPUTS_JSON")"
SHORT_BUNDLE="$(short_hash "$BUNDLE_HASH")"
SHORT_INPUT="$(short_hash "$INPUT_HASH")"
EXPECTED="APPROVE sepolia thought $SHORT_BUNDLE $SHORT_INPUT"
cat <<EOF2
run id: $RUN_ID
network: sepolia / 11155111
PATH NFT: $(jq -r '.path.pathNft' "$INPUTS_JSON")
PATH admin: $(jq -r '.path.admin' "$INPUTS_JSON") ($(jq -r '.path.adminSignerRef' "$INPUTS_JSON"))
deploy signer: $(jq -r '.thought.deploySignerRef' "$INPUTS_JSON") -> $DEPLOYER_EXPECTED
registry owner: $(jq -r '.thought.registryOwner' "$INPUTS_JSON") ($(jq -r '.thought.registryOwnerSignerRef' "$INPUTS_JSON"))
contracts: SeedGenerator, ColorFontV1, ThoughtPreviewer, ThoughtSpecRegistry, ThoughtNFT
spec: $(jq -r '.thought.spec.name' "$INPUTS_JSON")
spec id: $(jq -r '.thought.spec.id' "$INPUTS_JSON")
spec hash: $(jq -r '.thought.spec.hash' "$INPUTS_JSON")
spec sha256: $(jq -r '.thought.spec.sha256' "$INPUTS_JSON")
movement: THOUGHT -> ThoughtNFT, quota 1, freeze after config

Type exactly:
$EXPECTED
EOF2
printf '> '
read -r CONFIRMATION
[ "$CONFIRMATION" = "$EXPECTED" ] || fail "approval phrase mismatch"
mkdir -p "$PACK_ROOT/.approval"
printf '%s\n' "$CONFIRMATION" > "$PACK_ROOT/.approval/\${RUN_ID}.approved"
finish PASS "run bin/apply"
`);
}

function applyScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"
start_result apply
need_tool jq
need_tool cast
need_tool forge
need_tool python3
load_env
assert_deployer_address
assert_chain
require_approval
sha256_check
PATH_NFT="$(jq -r '.path.pathNft' "$INPUTS_JSON")"
MOVEMENT="$(jq -r '.path.movementBytes32' "$INPUTS_JSON")"
SPEC_NAME="$(jq -r '.thought.spec.name' "$INPUTS_JSON")"
SPEC_REF="$(jq -r '.thought.spec.ref' "$INPUTS_JSON")"
SPEC_FILE="$PACK_ROOT/source/$SPEC_NAME"
ADMIN="$ADMIN_ADDRESS"
DEPLOY_AUTH=(--keystore "$SEPOLIA_DEPLOY_KEYSTORE_JSON")
if [ -n "\${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE:-}" ]; then
  DEPLOY_AUTH+=(--password-file "$SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE")
else
  DEPLOY_AUTH+=(--password "$SEPOLIA_DEPLOY_KEYSTORE_PASSWORD")
fi
ADMIN_AUTH=(--ledger --sender "$ADMIN")
cd "$PACK_ROOT/source/evm"

deploy_contract() {
  local name="$1"
  local target="$2"
  shift 2
  echo "deploying $name"
  forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_AUTH[@]}" --json "$target" "$@" | tee "$RESULT_DIR/\${name}.json"
}

deploy_contract seed-generator src/SeedGenerator.sol:SeedGenerator
SEED_GENERATOR="$(jq -r '.deployedTo' "$RESULT_DIR/seed-generator.json")"
deploy_contract color-font-v1 src/ColorFontV1.sol:ColorFontV1
COLOR_FONT="$(jq -r '.deployedTo' "$RESULT_DIR/color-font-v1.json")"
deploy_contract thought-previewer src/ThoughtPreviewer.sol:ThoughtPreviewer
THOUGHT_PREVIEWER="$(jq -r '.deployedTo' "$RESULT_DIR/thought-previewer.json")"
deploy_contract thought-spec-registry src/ThoughtSpecRegistry.sol:ThoughtSpecRegistry --constructor-args "$ADMIN"
REGISTRY="$(jq -r '.deployedTo' "$RESULT_DIR/thought-spec-registry.json")"
SPEC_BYTES="$(hex_file "$SPEC_FILE")"
echo "registering spec with ADMIN Ledger"
cast send --json --rpc-url "$SEPOLIA_RPC_URL" "\${ADMIN_AUTH[@]}" "$REGISTRY" \
  'registerThoughtSpec(string,string,bytes)' "$SPEC_NAME" "$SPEC_REF" "$SPEC_BYTES" | tee "$RESULT_DIR/register-spec.json"
deploy_contract thought-nft src/ThoughtNFT.sol:ThoughtNFT --constructor-args "$PATH_NFT" "$REGISTRY" "$COLOR_FONT"
THOUGHT_NFT="$(jq -r '.deployedTo' "$RESULT_DIR/thought-nft.json")"
echo "configuring PATH movement with ADMIN Ledger"
cast send --json --rpc-url "$SEPOLIA_RPC_URL" "\${ADMIN_AUTH[@]}" "$PATH_NFT" \
  'setMovementConfig(bytes32,address,uint32)' "$MOVEMENT" "$THOUGHT_NFT" 1 | tee "$RESULT_DIR/path-set-movement.json"
cast send --json --rpc-url "$SEPOLIA_RPC_URL" "\${ADMIN_AUTH[@]}" "$PATH_NFT" \
  'freezeMovementConfig(bytes32)' "$MOVEMENT" | tee "$RESULT_DIR/path-freeze-movement.json"
cd "$PACK_ROOT"
mkdir -p artifacts
python3 - "$RESULT_DIR" "$PATH_NFT" "$ADMIN" "$SEED_GENERATOR" "$COLOR_FONT" "$THOUGHT_PREVIEWER" "$REGISTRY" "$THOUGHT_NFT" <<'PY'
import json, pathlib, sys
result = pathlib.Path(sys.argv[1])
path_nft, admin, seed, color, previewer, registry, thought = sys.argv[2:]
def load(name):
    return json.loads((result / name).read_text())
def tx(name):
    data = load(name)
    return data.get('transactionHash') or data.get('hash') or data.get('txHash') or data.get('tx_hash')
addresses = {
  'network': 'sepolia',
  'chain_id': 11155111,
  'path_nft': path_nft,
  'admin': admin,
  'seed_generator': seed,
  'color_font_v1': color,
  'thought_previewer': previewer,
  'thought_spec_registry': registry,
  'thought_spec_registry_owner': admin,
  'thought_nft': thought,
}
txs = {
  'seed_generator': tx('seed-generator.json'),
  'color_font_v1': tx('color-font-v1.json'),
  'thought_previewer': tx('thought-previewer.json'),
  'thought_spec_registry': tx('thought-spec-registry.json'),
  'register_spec': tx('register-spec.json'),
  'thought_nft': tx('thought-nft.json'),
  'path_set_movement': tx('path-set-movement.json'),
  'path_freeze_movement': tx('path-freeze-movement.json'),
}
art = pathlib.Path('artifacts')
(art / 'addresses.sepolia.json').write_text(json.dumps(addresses, indent=2) + '\\n')
(art / 'txs.json').write_text(json.dumps(txs, indent=2) + '\\n')
(art / 'deployment.sepolia-thought.json').write_text(json.dumps({'addresses': addresses, 'txs': txs}, indent=2) + '\\n')
PY
finish PASS "run bin/postconditions"
`);
}

function postconditionsScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"
start_result postconditions
need_tool jq
need_tool cast
need_tool python3
load_env
assert_chain
PATH_NFT="$(jq -r '.path.pathNft' "$INPUTS_JSON")"
MOVEMENT="$(jq -r '.path.movementBytes32' "$INPUTS_JSON")"
EXPECTED_SPEC_ID="$(jq -r '.thought.spec.id' "$INPUTS_JSON")"
EXPECTED_SPEC_HASH="$(jq -r '.thought.spec.hash' "$INPUTS_JSON")"
ADDRESSES="$PACK_ROOT/artifacts/addresses.sepolia.json"
TXS="$PACK_ROOT/artifacts/txs.json"
[ -r "$ADDRESSES" ] || fail "missing deployment addresses: $ADDRESSES"
THOUGHT_NFT="$(jq -r '.thought_nft' "$ADDRESSES")"
REGISTRY="$(jq -r '.thought_spec_registry' "$ADDRESSES")"
COLOR_FONT="$(jq -r '.color_font_v1' "$ADDRESSES")"
PREVIEWER="$(jq -r '.thought_previewer' "$ADDRESSES")"
SEED="$(jq -r '.seed_generator' "$ADDRESSES")"
MINTER="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'getAuthorizedMinter(bytes32)(address)' "$MOVEMENT")"
QUOTA="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'getMovementQuota(bytes32)(uint32)' "$MOVEMENT")"
FROZEN="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$PATH_NFT" 'isMovementFrozen(bytes32)(bool)' "$MOVEMENT")"
NFT_PATH="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" 'pathNft()(address)')"
NFT_REGISTRY="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" 'thoughtSpecRegistry()(address)')"
REGISTRY_OWNER="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" 'owner()(address)')"
SPEC_REGISTERED="$(cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" 'isRegisteredThoughtSpec(bytes32,bytes32)(bool)' "$EXPECTED_SPEC_ID" "$EXPECTED_SPEC_HASH")"
[ "$(lower "$MINTER")" = "$(lower "$THOUGHT_NFT")" ] || fail "PATH movement minter mismatch: $MINTER != $THOUGHT_NFT"
[ "$QUOTA" = "1" ] || fail "PATH movement quota mismatch: $QUOTA"
[ "$FROZEN" = "true" ] || fail "PATH movement not frozen"
[ "$(lower "$NFT_PATH")" = "$(lower "$PATH_NFT")" ] || fail "ThoughtNFT.pathNft mismatch"
[ "$(lower "$NFT_REGISTRY")" = "$(lower "$REGISTRY")" ] || fail "ThoughtNFT registry mismatch"
[ "$(lower "$REGISTRY_OWNER")" = "$(lower "$ADMIN_ADDRESS")" ] || fail "registry owner mismatch"
[ "$SPEC_REGISTERED" = "true" ] || fail "expected THOUGHT spec is not registered"
for addr in "$SEED" "$COLOR_FONT" "$PREVIEWER" "$REGISTRY" "$THOUGHT_NFT"; do
  code="$(cast code --rpc-url "$SEPOLIA_RPC_URL" "$addr")"
  [ "$code" != "0x" ] || fail "no code at deployed THOUGHT address $addr"
done
mkdir -p "$PACK_ROOT/artifacts/fe-release/abi"
python3 - "$PACK_ROOT" "$MINTER" "$QUOTA" "$FROZEN" "$NFT_PATH" "$NFT_REGISTRY" "$REGISTRY_OWNER" "$SPEC_REGISTERED" <<'PY'
import hashlib, json, pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
minter, quota, frozen, nft_path, nft_registry, owner, spec_registered = sys.argv[2:]
inputs = json.loads((root / 'inputs.json').read_text())
addresses = json.loads((root / 'artifacts/addresses.sepolia.json').read_text())
txs = json.loads((root / 'artifacts/txs.json').read_text())
post = {
  'network': 'sepolia',
  'chain_id': 11155111,
  'path_movement_minter': minter,
  'path_movement_quota': int(quota),
  'path_movement_frozen': frozen == 'true',
  'thought_nft_path_nft': nft_path,
  'thought_nft_registry': nft_registry,
  'registry_owner': owner,
  'spec_registered': spec_registered == 'true',
  'overall_status': 'PASS',
}
art = root / 'artifacts'
(art / 'postconditions.json').write_text(json.dumps(post, indent=2) + '\\n')
(art / 'checks.thought.post.json').write_text(json.dumps({'checks': post}, indent=2) + '\\n')
(art / 'post_state.json').write_text(json.dumps({'addresses': addresses, 'txs': txs, 'postconditions': post}, indent=2) + '\\n')
fe = art / 'fe-release'
fe.mkdir(exist_ok=True)
(fe / 'abi').mkdir(exist_ok=True)
fe_addresses = {
  'network': 'sepolia',
  'chain_id': 11155111,
  'path_nft': addresses['path_nft'],
  'thought_nft': addresses['thought_nft'],
  'thought_spec_registry': addresses['thought_spec_registry'],
  'thought_spec_registry_owner': addresses['thought_spec_registry_owner'],
  'color_font_v1': addresses['color_font_v1'],
  'thought_previewer': addresses['thought_previewer'],
  'seed_generator': addresses['seed_generator'],
}
(fe / 'addresses.sepolia.json').write_text(json.dumps(fe_addresses, indent=2) + '\\n')
protocol = {
  'schema_version': 1,
  'protocol': 'thought',
  'network': 'sepolia',
  'chain_id': 11155111,
  'release_tier': 'candidate',
  'path_dependency': inputs['path'],
  'contracts': fe_addresses,
  'movement': {
    'name': inputs['path']['movement'],
    'bytes32': inputs['path']['movementBytes32'],
    'quota': inputs['path']['movementQuota'],
    'frozen': True,
  },
  'recommended_thought_spec': inputs['thought']['spec'],
  'deploy_txs': txs,
}
(fe / 'protocol-release.sepolia.json').write_text(json.dumps(protocol, indent=2) + '\\n')
(fe / 'env.sepolia.example').write_text('VITE_NETWORK=sepolia\\nVITE_EXPECTED_CHAIN_ID=0xaa36a7\\n# Set VITE_ETH_RPC outside this public artifact.\\n')
for contract in ['ThoughtNFT', 'ThoughtSpecRegistry', 'ThoughtPreviewer', 'ColorFontV1']:
    artifact = json.loads((root / f'artifacts/contracts/{contract}.json').read_text())
    (fe / f'abi/{contract}.json').write_text(json.dumps({'abi': artifact['abi']}, indent=2) + '\\n')
checksums = {}
for p in sorted(fe.rglob('*')):
    if p.is_file() and p.name != 'checksums.json':
        checksums[str(p.relative_to(fe))] = '0x' + hashlib.sha256(p.read_bytes()).hexdigest()
(fe / 'checksums.json').write_text(json.dumps(checksums, indent=2) + '\\n')
PY
finish PASS "run tools/push-deployment-history.sh after review"
`);
}

function pushLatestScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
PACK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="$(hostname -s 2>/dev/null || hostname)"
BRIDGE="/Users/bigu/Private/signing-os-bridge/incoming/$HOST"
LATEST="$(ls -td "$PACK_ROOT"/results/* 2>/dev/null | head -1 || true)"
[ -n "$LATEST" ] || { echo "no results found"; exit 1; }
mkdir -p "$BRIDGE"
DEST="$BRIDGE/$(basename "$LATEST")"
rm -rf "$DEST"
cp -R "$LATEST" "$DEST"
echo "pushed latest result to $DEST"
`);
}

function pushHistoryScript() {
  return unixScript(`#!/usr/bin/env bash
set -euo pipefail
PACK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_ID="$(jq -r '.run_id' "$PACK_ROOT/inputs.json")"
HOST="$(hostname -s 2>/dev/null || hostname)"
BRIDGE="/Users/bigu/Private/signing-os-bridge/incoming/$HOST/history"
POST="$PACK_ROOT/artifacts/postconditions.json"
[ -r "$POST" ] || { echo "missing postconditions; run bin/postconditions first"; exit 1; }
STATUS="$(jq -r '.overall_status' "$POST")"
[ "$STATUS" = "PASS" ] || { echo "postconditions not PASS"; exit 1; }
HISTORY="$PACK_ROOT/history/$RUN_ID"
rm -rf "$HISTORY"
mkdir -p "$HISTORY/pack-manifests" "$HISTORY/canonical-artifacts" "$HISTORY/results" "$HISTORY/recovery-notes" "$HISTORY/audit" "$HISTORY/fe-release"
cp "$PACK_ROOT/PACK-MANIFEST.json" "$PACK_ROOT/READY-PACK-MANIFEST.json" "$PACK_ROOT/SHA256SUMS.txt" "$HISTORY/pack-manifests/"
for f in deployment.sepolia-thought.json txs.json post_state.json postconditions.json checks.thought.post.json; do cp "$PACK_ROOT/artifacts/$f" "$HISTORY/canonical-artifacts/"; done
cp -R "$PACK_ROOT/results/." "$HISTORY/results/"
cp -R "$PACK_ROOT/artifacts/fe-release/." "$HISTORY/fe-release/"
cat > "$HISTORY/README.md" <<EOF2
# THOUGHT Sepolia Deployment History

Run ID: $RUN_ID
EOF2
cat > "$HISTORY/QUALIFICATION.md" <<EOF2
# Qualification

Run ID: $RUN_ID
Network/lane: sepolia
Source commit: $(jq -r '.thought.repoCommit' "$PACK_ROOT/inputs.json")
Bundle hash: $(jq -r '.pack_hash' "$PACK_ROOT/PACK-MANIFEST.json")
Inputs SHA256: $(if command -v sha256sum >/dev/null 2>&1; then sha256sum "$PACK_ROOT/inputs.json"; else shasum -a 256 "$PACK_ROOT/inputs.json"; fi | awk '{print $1}')
Deploy signer: $(jq -r '.thought.deploySignerRef' "$PACK_ROOT/inputs.json")
ADMIN signer: $(jq -r '.path.adminSignerRef' "$PACK_ROOT/inputs.json") / $(jq -r '.path.admin' "$PACK_ROOT/inputs.json")
PATH dependency run id: $(jq -r '.path.runId' "$PACK_ROOT/inputs.json")
PATH NFT: $(jq -r '.path.pathNft' "$PACK_ROOT/inputs.json")
ThoughtNFT: $(jq -r '.thought_nft' "$PACK_ROOT/artifacts/addresses.sepolia.json")
Registry: $(jq -r '.thought_spec_registry' "$PACK_ROOT/artifacts/addresses.sepolia.json")
Final status: PASS
Qualified for: FE Sepolia candidate handoff
Not qualified for: mainnet
Known deviations: none recorded
Required next stages: sync FE release into inshell.art and run FE smoke tests
EOF2
(cd "$HISTORY" && find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS.txt)
mkdir -p "$BRIDGE"
DEST="$BRIDGE/$RUN_ID"
rm -rf "$DEST"
cp -R "$HISTORY" "$DEST"
echo "pushed deployment history to $DEST"
`);
}

function renderReadme(runId) {
  return `# THOUGHT Signing OS Pack\n\nRun ID: \`${runId}\`\n\nStandalone Sepolia deploy pack for THOUGHT. It deploys THOUGHT contracts, registers \`THOUGHT.v1.md\`, configures the existing PATH movement \`THOUGHT\` to the deployed \`ThoughtNFT\`, and freezes that PATH movement config.\n\nThis pack is designed for Signing OS. It does not require a git checkout or npm install on Signing OS.\n\nUse \`RUNBOOK.md\` for the operator sequence.\n`;
}

function renderRunbook(runId) {
  return `# THOUGHT Signing OS Runbook\n\nRun ID: \`${runId}\`\n\n## Sequence\n\n1. Put this whole pack directory on Signing OS.\n2. Ensure \`~/.opsec/path/env/sepolia.env\` exists and points to the Sepolia deploy keystore.\n3. Run \`bin/preflight\`.\n4. Run \`bin/verify\`.\n5. Connect ADMIN Ledger only for ADMIN actions.\n6. Run \`bin/approve\` and type the exact approval phrase.\n7. Run \`bin/apply\`.\n8. Run \`bin/postconditions\`.\n9. Run \`tools/push-latest-result.sh\` or \`tools/push-deployment-history.sh\` as needed.\n\n## Signers\n\n- Deployer: \`SEPOLIA_DEPLOY_SW_A\` from canonical keystore env.\n- Registry owner/admin: \`SEPOLIA_ADMIN_HW_A\` Ledger.\n- PATH movement admin: \`SEPOLIA_ADMIN_HW_A\` Ledger.\n\nThe deployer does not become registry owner. \`ThoughtSpecRegistry\` is deployed with the ADMIN address as immutable owner.\n`;
}

function main() {
  const pathFeRelease = path.resolve(argValue("--path-fe-release") ?? process.env.PATH_FE_RELEASE_DIR ?? defaultPathFeRelease);
  const outRoot = path.resolve(argValue("--out-root") ?? process.env.OUT_ROOT ?? defaultOutRoot);
  const runId = argValue("--run-id") ?? process.env.RUN_ID ?? `sepolia-thought-signing-os-pack-${nowStamp()}`;
  const specName = argValue("--spec-name") ?? process.env.THOUGHT_SPEC_NAME ?? "THOUGHT.v1.md";
  const specFile = path.resolve(argValue("--spec-file") ?? process.env.THOUGHT_SPEC_FILE ?? path.join(root, specName));
  const maxSpecBytes = Number(argValue("--max-spec-bytes") ?? process.env.MAX_THOUGHT_SPEC_BYTES ?? "20000");
  const movementQuota = Number(argValue("--movement-quota") ?? process.env.THOUGHT_MOVEMENT_QUOTA ?? "1");
  const deploySignerRef = argValue("--deploy-signer-ref") ?? process.env.THOUGHT_DEPLOY_SIGNER_REF ?? "SEPOLIA_DEPLOY_SW_A";
  const registryOwnerSignerRef = argValue("--registry-owner-signer-ref") ?? process.env.THOUGHT_REGISTRY_OWNER_SIGNER_REF ?? "SEPOLIA_ADMIN_HW_A";
  const pathAdminSignerRef = argValue("--path-admin-signer-ref") ?? process.env.PATH_ADMIN_SIGNER_REF ?? "SEPOLIA_ADMIN_HW_A";
  const registryOwnerRaw = argValue("--registry-owner") ?? process.env.THOUGHT_REGISTRY_OWNER;
  const pathQualifiedRepoCommitOverride = argValue("--path-qualified-repo-commit") ?? process.env.PATH_QUALIFIED_REPO_COMMIT;
  if (!Number.isInteger(movementQuota) || movementQuota !== 1) throw new Error("Signing OS pack currently requires THOUGHT movement quota 1");
  const pathRelease = loadPathRelease(pathFeRelease);
  if (pathQualifiedRepoCommitOverride) pathRelease.qualifiedRepoCommit = pathQualifiedRepoCommitOverride;
  if (pathRelease.network !== "sepolia" || pathRelease.chainId !== 11155111) throw new Error(`PATH release is not Sepolia: ${pathRelease.network}/${pathRelease.chainId}`);
  const registryOwner = requireAddress(registryOwnerRaw ?? pathRelease.admin, "thought.registryOwner");
  const spec = validateSpec(specName, specFile, maxSpecBytes);
  const repoCommit = gitCommit(root);
  const packRoot = path.join(outRoot, runId);
  rmrf(packRoot);
  fs.mkdirSync(packRoot, { recursive: true });

  const inputs = {
    schema_version: 1,
    network: "sepolia",
    chain_id: 11155111,
    run_id: runId,
    path: {
      runId: pathRelease.runId,
      releaseRepoCommit: pathRelease.releaseRepoCommit,
      qualifiedRepoCommit: pathRelease.qualifiedRepoCommit,
      pathNft: pathRelease.pathNft,
      pathPulseAdapter: pathRelease.pathPulseAdapter,
      pulseAuction: pathRelease.pulseAuction,
      admin: pathRelease.admin,
      adminSignerRef: pathAdminSignerRef,
      movement: "THOUGHT",
      movementBytes32: ethers.encodeBytes32String("THOUGHT"),
      movementQuota
    },
    thought: {
      repoCommit,
      repoRemote: gitRemote(root),
      deploySignerRef,
      deploySignerExpectedAddress: "0x3e4fA9f09d8EDe66561145E1ef3bc127F80ED396",
      registryOwner,
      registryOwnerSignerRef,
      spec
    }
  };

  const pathDependency = {
    schema_version: 1,
    network: "sepolia",
    chain_id: 11155111,
    path_run_id: pathRelease.runId,
    path_release_repo_commit: pathRelease.releaseRepoCommit,
    path_qualified_repo_commit: pathRelease.qualifiedRepoCommit,
    path_nft: pathRelease.pathNft,
    path_pulse_adapter: pathRelease.pathPulseAdapter,
    pulse_auction: pathRelease.pulseAuction,
    admin: pathRelease.admin,
    movement_to_configure: inputs.path.movement,
    movement_bytes32: inputs.path.movementBytes32,
    movement_quota: movementQuota
  };

  write(path.join(packRoot, "README.md"), renderReadme(runId));
  write(path.join(packRoot, "RUNBOOK.md"), renderRunbook(runId));
  writeJson(path.join(packRoot, "inputs.json"), inputs);
  writeJson(path.join(packRoot, "path-dependency.json"), pathDependency);
  write(path.join(packRoot, "templates/recovery-note.md"), `# Recovery Note\n\nRun ID: ${runId}\n\nStep:\n\nFailure:\n\nDecision:\n\nRetry command:\n\nOperator:\n\nTimestamp UTC:\n`);

  sourceSnapshot(path.join(packRoot, "source"));
  const contractArtifactDir = path.join(packRoot, "artifacts/contracts");
  for (const contract of ["SeedGenerator", "ColorFontV1", "ThoughtPreviewer", "ThoughtSpecRegistry", "ThoughtNFT"]) copyContractArtifact(contract, contractArtifactDir);
  writeJson(path.join(packRoot, "artifacts/build-evidence.json"), {
    schema_version: 1,
    source_commit: repoCommit,
    foundry_profile: "default",
    contracts: ["SeedGenerator", "ColorFontV1", "ThoughtPreviewer", "ThoughtSpecRegistry", "ThoughtNFT"]
  });

  write(path.join(packRoot, "lib/common.sh"), commonSh(), 0o755);
  write(path.join(packRoot, "bin/preflight"), preflightScript(), 0o755);
  write(path.join(packRoot, "bin/verify"), verifyScript(), 0o755);
  write(path.join(packRoot, "bin/approve"), approveScript(), 0o755);
  write(path.join(packRoot, "bin/apply"), applyScript(), 0o755);
  write(path.join(packRoot, "bin/postconditions"), postconditionsScript(), 0o755);
  write(path.join(packRoot, "tools/push-latest-result.sh"), pushLatestScript(), 0o755);
  write(path.join(packRoot, "tools/push-deployment-history.sh"), pushHistoryScript(), 0o755);

  const payloadFiles = listFiles(packRoot).filter((rel) => !["PACK-MANIFEST.json", "READY-PACK-MANIFEST.json", "SHA256SUMS.txt"].includes(rel));
  const fileHashes = Object.fromEntries(payloadFiles.map((rel) => [rel, `0x${sha256File(path.join(packRoot, rel))}`]));
  const packHashInput = payloadFiles.map((rel) => `${fileHashes[rel]}  ${rel}\n`).join("");
  const packHash = `0x${crypto.createHash("sha256").update(packHashInput).digest("hex")}`;
  writeJson(path.join(packRoot, "PACK-MANIFEST.json"), {
    schema_version: 1,
    kind: "THOUGHT_SIGNING_OS_PACK",
    run_id: runId,
    network: "sepolia",
    chain_id: 11155111,
    created_at: new Date().toISOString(),
    source_commit: repoCommit,
    path_release_repo_commit: pathRelease.releaseRepoCommit,
    path_qualified_repo_commit: pathRelease.qualifiedRepoCommit,
    pack_hash: packHash,
    files: fileHashes
  });
  writeJson(path.join(packRoot, "READY-PACK-MANIFEST.json"), {
    schema_version: 1,
    run_id: runId,
    ready_for: "signing-os-sepolia-ops-review",
    pack_hash: packHash,
    inputs_sha256: `0x${sha256File(path.join(packRoot, "inputs.json"))}`,
    authority_model: {
      deployer: deploySignerRef,
      registry_owner: registryOwnerSignerRef,
      path_admin: pathAdminSignerRef
    },
    required_sequence: ["bin/preflight", "bin/verify", "bin/approve", "bin/apply", "bin/postconditions"]
  });
  const sums = listFiles(packRoot).map((rel) => `${sha256File(path.join(packRoot, rel))}  ${rel}`).join("\n") + "\n";
  write(path.join(packRoot, "SHA256SUMS.txt"), sums);
  console.log(`THOUGHT Signing OS pack written: ${packRoot}`);
  console.log(`run_id=${runId}`);
  console.log(`pack_hash=${packHash}`);
  console.log(`inputs_sha256=0x${sha256File(path.join(packRoot, "inputs.json"))}`);
}

main();
