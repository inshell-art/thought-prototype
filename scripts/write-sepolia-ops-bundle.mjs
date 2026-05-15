import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const defaultPathFeRelease = path.resolve(root, "../path/artifacts/sepolia/current/fe-release");
const defaultOutRoot = path.resolve(root, "artifacts/sepolia/current/ops-bundles");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return ethers.sha256(fs.readFileSync(file));
}

function gitCommit(repo) {
  return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function gitCommitOrNull(repo) {
  try {
    return gitCommit(repo);
  } catch {
    return null;
  }
}

function gitRemote(repo) {
  try {
    return execFileSync("git", ["-C", repo, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function validateSpec(specName, specFile, maxBytes) {
  const match = /^THOUGHT\.v([1-9][0-9]*)\.md$/.exec(specName);
  if (!match) throw new Error(`Invalid spec name: ${specName}`);
  if (path.basename(specFile) !== specName) {
    throw new Error(`Spec filename/name mismatch: ${path.basename(specFile)} != ${specName}`);
  }
  const bytes = fs.readFileSync(specFile);
  if (bytes.length === 0) throw new Error("Spec file is empty");
  if (bytes.length > maxBytes) throw new Error(`Spec exceeds ${maxBytes} bytes`);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("Spec has UTF-8 BOM");
  }
  if (bytes.includes(0x0d)) throw new Error("Spec has CR/CRLF line endings");
  const text = bytes.toString("utf8");
  if (!text.includes(`Version: v${match[1]}`)) {
    throw new Error(`Spec must contain Version: v${match[1]}`);
  }
  return {
    name: specName,
    ref: argValue("--spec-ref") ?? process.env.THOUGHT_SPEC_REF ?? specName,
    id: ethers.id(specName),
    hash: ethers.keccak256(bytes),
    byteLength: bytes.length,
    sha256: ethers.sha256(bytes),
    file: path.relative(root, specFile)
  };
}

function requireAddress(value, label) {
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${label}: ${value}`);
  return ethers.getAddress(value);
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
    addressesFile,
    releaseFile,
    addresses,
    release,
    pathNft: requireAddress(addresses.path_nft, "path_nft"),
    pathPulseAdapter: requireAddress(addresses.path_pulse_adapter, "path_pulse_adapter"),
    pulseAuction: requireAddress(addresses.pulse_auction, "pulse_auction"),
    admin: requireAddress(release.admin, "release.admin"),
    network: release.network,
    chainId: Number(release.chain_id),
    pathRunId: release.deploy_run_id,
    pathReleaseRepoCommit: release.repo_commit,
    pathQualifiedRepoCommit: gitCommitOrNull(pathRepoRoot)
  };
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function renderRunbook({ run, inputs }) {
  return `# THOUGHT Sepolia Deploy Bundle

Run ID: \`${run.run_id}\`

This bundle deploys THOUGHT against the already-qualified PATH Sepolia deployment. It does not redeploy PATH.

PATH release source commit: \`${inputs.path.releaseRepoCommit}\`
PATH qualified repo commit: \`${inputs.path.qualifiedRepoCommit ?? "not available"}\`

## Authority Model

- PATH admin: \`${inputs.path.admin}\` (\`${inputs.path.adminSignerRef}\`)
- THOUGHT deploy signer: \`${inputs.thought.deploySignerRef}\`
- THOUGHT registry owner: \`${inputs.thought.registryOwner}\` (\`${inputs.thought.registryOwnerSignerRef}\`)
- PATH movement configured after THOUGHT deploy: \`THOUGHT -> ThoughtNFT\`, quota \`${inputs.path.movementQuota}\`, then frozen.

\`ThoughtSpecRegistry\` receives its immutable owner as a constructor argument. The deployer does not become registry owner unless it is explicitly passed as owner.

## Preflight

\`\`\`bash
cd /path/to/THOUGHT
git checkout ${run.repo_commit}
git rev-parse HEAD
# expected: ${run.repo_commit}

npm run build:evm
npm run test:evm

cast chain-id --rpc-url "$SEPOLIA_RPC_URL"
# expected: 11155111

cast code --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft}
cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "getAuthorizedMinter(bytes32)(address)" ${inputs.path.movementBytes32}
cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "getMovementQuota(bytes32)(uint32)" ${inputs.path.movementBytes32}
cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "isMovementFrozen(bytes32)(bool)" ${inputs.path.movementBytes32}
# expected before config: zero address, 0, false
\`\`\`

## Deploy THOUGHT

Set signer modes explicitly:

\`\`\`bash
DEPLOY_SIGNER_ARGS=(--account ${inputs.thought.deploySignerRef})
REGISTRY_OWNER_SIGNER_ARGS=(--account ${inputs.thought.registryOwnerSignerRef})
PATH_ADMIN_SIGNER_ARGS=(--account ${inputs.path.adminSignerRef})

# Hardware examples:
# REGISTRY_OWNER_SIGNER_ARGS=(--ledger --sender ${inputs.thought.registryOwner})
# PATH_ADMIN_SIGNER_ARGS=(--ledger --sender ${inputs.path.admin})
\`\`\`

Deploy the supporting contracts:

\`\`\`bash
cd /path/to/THOUGHT/evm

forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_SIGNER_ARGS[@]}" --json src/SeedGenerator.sol:SeedGenerator | tee seed.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_SIGNER_ARGS[@]}" --json src/ColorFontV1.sol:ColorFontV1 | tee color-font.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_SIGNER_ARGS[@]}" --json src/ThoughtPreviewer.sol:ThoughtPreviewer | tee previewer.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_SIGNER_ARGS[@]}" --json \\
  src/ThoughtSpecRegistry.sol:ThoughtSpecRegistry \\
  --constructor-args ${inputs.thought.registryOwner} | tee registry.json

REGISTRY=$(jq -r .deployedTo registry.json)
COLOR_FONT=$(jq -r .deployedTo color-font.json)
\`\`\`

Register the pinned THOUGHT spec bytes:

\`\`\`bash
SPEC_BYTES=0x$(xxd -p -c 256 ../${inputs.thought.spec.file} | tr -d '\\n')

cast send --rpc-url "$SEPOLIA_RPC_URL" "\${REGISTRY_OWNER_SIGNER_ARGS[@]}" "$REGISTRY" \\
  "registerThoughtSpec(string,string,bytes)" \\
  "${inputs.thought.spec.name}" \\
  "${inputs.thought.spec.ref}" \\
  "$SPEC_BYTES"

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" \\
  "isRegisteredThoughtSpec(bytes32,bytes32)(bool)" \\
  ${inputs.thought.spec.id} \\
  ${inputs.thought.spec.hash}
# expected: true
\`\`\`

Deploy \`ThoughtNFT\` against PATH:

\`\`\`bash
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "\${DEPLOY_SIGNER_ARGS[@]}" --json \\
  src/ThoughtNFT.sol:ThoughtNFT \\
  --constructor-args ${inputs.path.pathNft} "$REGISTRY" "$COLOR_FONT" | tee thought-nft.json

THOUGHT_NFT=$(jq -r .deployedTo thought-nft.json)
\`\`\`

## Configure PATH Movement

These calls must be signed by PATH admin \`${inputs.path.adminSignerRef}\`, not by a random deployer.

\`\`\`bash
cast send --rpc-url "$SEPOLIA_RPC_URL" "\${PATH_ADMIN_SIGNER_ARGS[@]}" ${inputs.path.pathNft} \\
  "setMovementConfig(bytes32,address,uint32)" \\
  ${inputs.path.movementBytes32} \\
  "$THOUGHT_NFT" \\
  ${inputs.path.movementQuota}

cast send --rpc-url "$SEPOLIA_RPC_URL" "\${PATH_ADMIN_SIGNER_ARGS[@]}" ${inputs.path.pathNft} \\
  "freezeMovementConfig(bytes32)" \\
  ${inputs.path.movementBytes32}
\`\`\`

## Postconditions

\`\`\`bash
cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "getAuthorizedMinter(bytes32)(address)" ${inputs.path.movementBytes32}
# expected: $THOUGHT_NFT

cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "getMovementQuota(bytes32)(uint32)" ${inputs.path.movementBytes32}
# expected: ${inputs.path.movementQuota}

cast call --rpc-url "$SEPOLIA_RPC_URL" ${inputs.path.pathNft} "isMovementFrozen(bytes32)(bool)" ${inputs.path.movementBytes32}
# expected: true

cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" "pathNft()(address)"
# expected: ${inputs.path.pathNft}

cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" "thoughtSpecRegistry()(address)"
# expected: $REGISTRY

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" "owner()(address)"
# expected: ${inputs.thought.registryOwner}

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" "isRegisteredThoughtSpec(bytes32,bytes32)(bool)" ${inputs.thought.spec.id} ${inputs.thought.spec.hash}
# expected: true
\`\`\`

## FE Handoff

After postconditions pass, export a THOUGHT FE release containing:

- \`path_nft\`: \`${inputs.path.pathNft}\`
- \`thought_nft\`: \`$THOUGHT_NFT\`
- \`thought_spec_registry\`: \`$REGISTRY\`
- \`thought_spec_registry_owner\`: \`${inputs.thought.registryOwner}\`
- \`color_font_v1\`: \`$COLOR_FONT\`
- \`thought_previewer\`: deployed previewer address
- \`recommendedThoughtSpecName\`: \`${inputs.thought.spec.name}\`
- \`recommendedThoughtSpecId\`: \`${inputs.thought.spec.id}\`
- \`recommendedThoughtSpecHash\`: \`${inputs.thought.spec.hash}\`
`;
}

function main() {
  const pathFeRelease = path.resolve(argValue("--path-fe-release") ?? process.env.PATH_FE_RELEASE_DIR ?? defaultPathFeRelease);
  const outRoot = path.resolve(argValue("--out-root") ?? process.env.OUT_ROOT ?? defaultOutRoot);
  const runId = argValue("--run-id") ?? process.env.RUN_ID ?? `sepolia-thought-deploy-${nowStamp()}`;
  const specName = argValue("--spec-name") ?? process.env.THOUGHT_SPEC_NAME ?? "THOUGHT.v1.md";
  const specFile = path.resolve(argValue("--spec-file") ?? process.env.THOUGHT_SPEC_FILE ?? path.join(root, specName));
  const movementQuota = Number(argValue("--movement-quota") ?? process.env.THOUGHT_MOVEMENT_QUOTA ?? "1");
  const maxSpecBytes = Number(argValue("--max-spec-bytes") ?? process.env.MAX_THOUGHT_SPEC_BYTES ?? "20000");
  const deploySignerRef = argValue("--deploy-signer-ref") ?? process.env.THOUGHT_DEPLOY_SIGNER_REF ?? "SEPOLIA_DEPLOY_SW_A";
  const registryOwnerSignerRef = argValue("--registry-owner-signer-ref") ?? process.env.THOUGHT_REGISTRY_OWNER_SIGNER_REF ?? "SEPOLIA_ADMIN_HW_A";
  const registryOwnerRaw = argValue("--registry-owner") ?? process.env.THOUGHT_REGISTRY_OWNER;
  const pathAdminSignerRef = argValue("--path-admin-signer-ref") ?? process.env.PATH_ADMIN_SIGNER_REF ?? "SEPOLIA_ADMIN_HW_A";
  const pathQualifiedRepoCommitOverride =
    argValue("--path-qualified-repo-commit") ?? process.env.PATH_QUALIFIED_REPO_COMMIT;

  if (!Number.isInteger(movementQuota) || movementQuota <= 0) throw new Error("movement quota must be a positive integer");
  const pathRelease = loadPathRelease(pathFeRelease);
  if (pathQualifiedRepoCommitOverride) {
    pathRelease.pathQualifiedRepoCommit = pathQualifiedRepoCommitOverride;
  }
  if (pathRelease.network !== "sepolia" || pathRelease.chainId !== 11155111) {
    throw new Error(`PATH release is not Sepolia: ${pathRelease.network}/${pathRelease.chainId}`);
  }
  const registryOwner = requireAddress(registryOwnerRaw ?? pathRelease.admin, "thought.registryOwner");

  const spec = validateSpec(specName, specFile, maxSpecBytes);
  const repoCommit = gitCommit(root);
  const movementBytes32 = ethers.encodeBytes32String("THOUGHT");

  const run = {
    schema_version: 1,
    run_id: runId,
    network: "sepolia",
    chain_id: 11155111,
    operation: "thought.deploy_and_configure_path_movement",
    created_at: new Date().toISOString(),
    repo: "THOUGHT",
    repo_commit: repoCommit,
    repo_remote: gitRemote(root),
    path_release_dir: path.relative(root, pathFeRelease),
    path_release_repo_commit: pathRelease.pathReleaseRepoCommit,
    path_qualified_repo_commit: pathRelease.pathQualifiedRepoCommit,
    path_run_id: pathRelease.pathRunId
  };

  const inputs = {
    schema_version: 1,
    network: "sepolia",
    chain_id: 11155111,
    run_id: runId,
    path: {
      releaseDir: path.relative(root, pathFeRelease),
      runId: pathRelease.pathRunId,
      releaseRepoCommit: pathRelease.pathReleaseRepoCommit,
      qualifiedRepoCommit: pathRelease.pathQualifiedRepoCommit,
      pathNft: pathRelease.pathNft,
      pathPulseAdapter: pathRelease.pathPulseAdapter,
      pulseAuction: pathRelease.pulseAuction,
      admin: pathRelease.admin,
      adminSignerRef: pathAdminSignerRef,
      movement: "THOUGHT",
      movementBytes32,
      movementQuota
    },
    thought: {
      repoCommit,
      deploySignerRef,
      registryOwner,
      registryOwnerSignerRef,
      spec
    }
  };

  const outDir = path.join(outRoot, runId);
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, "run.json"), run);
  writeJson(path.join(outDir, "inputs.json"), inputs);
  writeJson(path.join(outDir, "path-config-template.json"), {
    pathNft: inputs.path.pathNft,
    movement: inputs.path.movement,
    movementBytes32: inputs.path.movementBytes32,
    calls: [
      {
        signerRef: inputs.path.adminSignerRef,
        function: "setMovementConfig(bytes32,address,uint32)",
        args: [inputs.path.movementBytes32, "<THOUGHT_NFT_ADDRESS>", inputs.path.movementQuota]
      },
      {
        signerRef: inputs.path.adminSignerRef,
        function: "freezeMovementConfig(bytes32)",
        args: [inputs.path.movementBytes32]
      }
    ]
  });
  fs.writeFileSync(path.join(outDir, "RUNBOOK.md"), renderRunbook({ run, inputs }), "utf8");

  const manifest = {
    schema_version: 1,
    run_id: runId,
    network: "sepolia",
    generated_at: new Date().toISOString(),
    files: ["run.json", "inputs.json", "path-config-template.json", "RUNBOOK.md"],
    source: {
      repo_commit: repoCommit,
      path_release_repo_commit: pathRelease.pathReleaseRepoCommit,
      path_qualified_repo_commit: pathRelease.pathQualifiedRepoCommit,
      spec_sha256: spec.sha256
    }
  };
  writeJson(path.join(outDir, "bundle_manifest.json"), manifest);

  const checksums = {};
  for (const name of [...manifest.files, "bundle_manifest.json"]) {
    checksums[name] = sha256(path.join(outDir, name));
  }
  writeJson(path.join(outDir, "checksums.json"), checksums);

  console.log(`THOUGHT OPS bundle written: ${outDir}`);
  console.log(`run_id=${runId}`);
  console.log(`path_nft=${inputs.path.pathNft}`);
  console.log(`spec_id=${spec.id}`);
  console.log(`spec_hash=${spec.hash}`);
}

main();
