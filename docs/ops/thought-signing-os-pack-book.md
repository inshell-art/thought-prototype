# THOUGHT Signing OS Pack Book

This is the OPS contract for a THOUGHT Sepolia deploy pack. DEV should produce a pack that conforms to this document directly. OPS should validate and stage the pack, not convert an arbitrary DEV bundle after the fact.

## Goal

Produce a standalone Signing OS deploy pack for:

- Deploying THOUGHT contracts on Sepolia.
- Registering the pinned `THOUGHT.v1.md` spec.
- Configuring the already-deployed PATH contract so movement `THOUGHT` points to the new `ThoughtNFT`, quota is `1`, and the movement config is frozen.
- Producing postconditions, history, and FE handoff artifacts.

The pack must run on a clean Signing OS machine with no project checkout and no `npm` dependency.

## Authority Model

- THOUGHT deployer: `SEPOLIA_DEPLOY_SW_A`
- THOUGHT registry owner: `SEPOLIA_ADMIN_HW_A`
- PATH movement admin signer: `SEPOLIA_ADMIN_HW_A`
- PATH deploy dependency: already-qualified PATH Sepolia deployment.

The deployer keystore may deploy contracts, but it must not become final admin unless explicitly intended and documented. PATH admin actions must be signed by the Ledger-backed ADMIN signer.

## Signing OS Constraints

The pack must not require:

- `git checkout`
- `npm install`
- `npm run ...`
- browser wallets
- a local project tree under `~/Projects`

The pack may require:

- `sh`, `python3`, `jq`
- `cast` and `forge`, if installed through the Signing OS maintenance lane
- the canonical env file at `~/.opsec/path/env/sepolia.env`
- the ADMIN Ledger connected only for ADMIN-signed calls

## Canonical Env Contract

Scripts must load:

```sh
~/.opsec/path/env/sepolia.env
```

Required env:

- `SEPOLIA_RPC_URL`
- `SEPOLIA_DEPLOY_KEYSTORE_JSON`
- exactly one of `SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE` or `SEPOLIA_DEPLOY_KEYSTORE_PASSWORD`
- `SIGNING_OS_MARKER_FILE`

Forbidden env:

- `SEPOLIA_PRIVATE_KEY`

Expected signer:

- `SEPOLIA_DEPLOY_SW_A = 0x3e4fA9f09d8EDe66561145E1ef3bc127F80ED396`

The pack must not embed secrets.

## Required Pack Layout

```text
THOUGHT-SIGNING-OS-PACK/
  README.md
  RUNBOOK.md
  SHA256SUMS.txt
  PACK-MANIFEST.json
  READY-PACK-MANIFEST.json
  inputs.json
  path-dependency.json
  source/
    THOUGHT source snapshot at the exact deploy commit
  artifacts/
    compiled contract artifacts or reproducible build evidence
  bin/
    preflight
    verify
    approve
    apply
    postconditions
  tools/
    push-latest-result.sh
    push-deployment-history.sh
  templates/
    recovery-note.md
```

`source/` must be an exact snapshot of the deploy source commit, not a live git checkout requirement.

## Required Inputs

`inputs.json` must include:

- `network = sepolia`
- `chain_id = 11155111`
- `run_id`
- THOUGHT source commit
- PATH qualified run id
- PATH qualified repo commit
- PATH release source commit
- PATH NFT address
- PATH admin address
- PATH admin signer ref
- deploy signer ref
- registry owner address
- registry owner signer ref
- movement string `THOUGHT`
- movement bytes32
- movement quota `1`
- expected spec name, spec id, spec hash, byte length, and sha256

## Script Contract

Each script must:

- Create a timestamped result dir under `results/`.
- Write `SUMMARY.txt`.
- Write a detailed log.
- Exit non-zero on failure.
- Print `OVERALL_STATUS=PASS` or `OVERALL_STATUS=FAIL`.
- Print `NEXT=...` with the next safe operator step.

### `bin/preflight`

Must verify:

- canonical env exists and is readable
- no private key env is set
- deploy keystore and password material are readable
- deploy signer resolves to `SEPOLIA_DEPLOY_SW_A`
- `SIGNING_OS_MARKER_FILE` is readable
- RPC chain id is `11155111`
- required tools exist
- source/artifacts/checksums are intact
- PATH dependency addresses match `path-dependency.json`

### `bin/verify`

Must verify:

- `SHA256SUMS.txt`
- pack manifest hashes
- input schema
- expected PATH contract has code
- PATH admin has required authority
- PATH THOUGHT movement is not already configured unless the pack is explicitly marked as a recovery/corrective pack
- deployer and ADMIN balances are non-zero and sufficient for expected txs
- no secrets are present in the pack

### `bin/approve`

Must display deterministic human-readable inputs:

- run id
- network and chain id
- PATH dependency addresses
- deploy signer ref and resolved address
- ADMIN signer ref and address
- THOUGHT contracts to deploy
- spec name/id/hash/sha256
- movement config to apply

Approval must require exact typed confirmation, for example:

```text
APPROVE sepolia thought <short-bundle-hash> <short-input-hash>
```

### `bin/apply`

Must perform the deployment and write tx/address evidence.

Required tx groups:

- deploy `SeedGenerator`
- deploy `ColorFontV1`
- deploy `ThoughtPreviewer`
- deploy `ThoughtSpecRegistry(owner=ADMIN)`
- register `THOUGHT.v1.md` in registry using ADMIN Ledger signer
- deploy `ThoughtNFT(pathNft, registry, colorFont)`
- call PATH `setMovementConfig(THOUGHT, ThoughtNFT, 1)` using ADMIN Ledger signer
- call PATH `freezeMovementConfig(THOUGHT)` using ADMIN Ledger signer

The deployer txs must use the env keystore, not a raw private key.

The ADMIN txs must use Ledger signing by default:

```sh
--ledger --sender 0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981
```

If a different ADMIN signing mode is supported, it must be explicitly documented and must not be the default for serious runs.

`apply` must write:

```text
artifacts/
  deployment.sepolia-thought.json
  txs.json
  addresses.sepolia.json
```

### `bin/postconditions`

Must verify on-chain:

- PATH movement `THOUGHT` minter equals deployed `ThoughtNFT`
- PATH movement quota equals `1`
- PATH movement frozen equals `true`
- `ThoughtNFT.pathNft()` equals qualified PATH NFT
- `ThoughtNFT.thoughtSpecRegistry()` equals deployed registry
- registry owner equals ADMIN
- expected `THOUGHT.v1.md` spec is registered
- deployed contract code exists for all THOUGHT contracts

Must write:

```text
artifacts/
  postconditions.json
  checks.thought.post.json
  post_state.json
```

### `tools/push-latest-result.sh`

Must push the latest result dir back to Dev OS bridge incoming:

```text
/Users/bigu/Private/signing-os-bridge/incoming/<signing-os-host>/<result-dir>/
```

### `tools/push-deployment-history.sh`

Must create and push a qualified history folder after final postconditions pass.

## Required History Layout

```text
<run-id>/
  README.md
  SHA256SUMS.txt
  QUALIFICATION.md
  pack-manifests/
  canonical-artifacts/
    deployment.sepolia-thought.json
    txs.json
    post_state.json
    postconditions.json
    checks.thought.post.json
  results/
  recovery-notes/
  audit/
  fe-release/
```

`QUALIFICATION.md` must include:

- Run ID
- Network/lane
- Source commit
- Bundle hash
- Inputs SHA256
- Deploy signer alias/address
- ADMIN signer alias/address
- PATH dependency run id
- PATH NFT address
- ThoughtNFT address
- Registry address
- Final status
- Qualified for
- Not qualified for
- Canonical final result dirs
- Failed/intermediate result dirs
- Known deviations
- Recovery notes
- Required next stages

Required qualification checks:

1. `SHA256SUMS.txt` verifies.
2. Final postconditions pass.
3. PATH THOUGHT movement minter is deployed `ThoughtNFT`.
4. PATH THOUGHT movement quota is `1`.
5. PATH THOUGHT movement is frozen.
6. Registry owner is ADMIN.
7. Spec registration matches expected spec id/hash.
8. Tx count matches expected deploy/configure tx count.
9. Failed/retried steps are retained.
10. Every retry has a recovery note.
11. No secrets are present.
12. FE release artifacts exist if frontend integration is required.

## Required FE Release

After postconditions pass, export:

```text
fe-release/
  addresses.sepolia.json
  protocol-release.sepolia.json
  checksums.json
  abi/
    ThoughtNFT.json
    ThoughtSpecRegistry.json
    ThoughtPreviewer.json
    ColorFontV1.json
  env.sepolia.example
```

The release must include:

- PATH NFT address
- ThoughtNFT address
- registry address
- registry owner
- color font address
- previewer address
- movement name/bytes32/quota/frozen state
- spec id/hash/sha256
- deployment tx hashes
- deployment blocks
- code hashes

## DEV Validation Before Handoff

DEV must validate before handing the pack to OPS:

- THOUGHT EVM compile passes.
- THOUGHT EVM tests pass.
- Pack checksum verification passes.
- Pack leak scan passes.
- Dev OS dry-run/rehearsal passes where possible.
- Sepolia prestate check confirms PATH movement `THOUGHT` is not already configured.
- Scripts are shell-entrypoint based, not npm-entrypoint based.

## OPS Acceptance Gate

OPS accepts the pack only if:

- It is standalone for Signing OS.
- It does not require source control operations on Signing OS.
- It does not require npm on Signing OS.
- It uses canonical env for deployer secrets.
- It uses Ledger ADMIN signing for PATH admin actions.
- It produces result dirs and deployment history in the standard shape.
- It can push failed and successful results back to the Dev OS bridge.

## Current THOUGHT Bundle Gap

The current bundle at:

```text
/Users/bigu/Projects/THOUGHT/artifacts/sepolia/current/ops-bundles/sepolia-thought-deploy-20260515T031414Z/
```

is a valid repo/runbook bundle, but not yet a Signing OS pack. It still assumes:

- `/path/to/THOUGHT`
- `git checkout`
- `npm run build:evm`
- `npm run test:evm`
- Foundry named accounts like `--account SEPOLIA_ADMIN_HW_A`

DEV should convert this into the standalone pack shape above before OPS runs it on Signing OS.
