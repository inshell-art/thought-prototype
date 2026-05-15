# THOUGHT Signing OS Pack OPS Review

Pack reviewed:

```text
/Users/bigu/Projects/THOUGHT/artifacts/sepolia/current/signing-os-packs/sepolia-thought-signing-os-pack-20260515T043323Z
```

Commit reviewed:

```text
407a9305f68df71b159d7243668cc528ff25f6a9
```

## Result

OPS does not accept this pack for Signing OS deployment yet.

The pack is close, but it has two blocker issues that would likely fail or lose evidence on the real Signing OS.

## Passed

- Repo is clean at `407a9305f68df71b159d7243668cc528ff25f6a9`.
- `SHA256SUMS.txt` verifies.
- `bin/*` and `tools/*` are executable.
- Shell syntax checks pass for all pack scripts.
- Pack leak scan passes with `gitleaks detect --no-git --redact`.
- THOUGHT EVM build/test previously passed: `56 passed, 0 failed`.
- Sepolia prestate checked separately by OPS:
  - chain id is `11155111`
  - PATH `THOUGHT` movement minter is zero
  - PATH `THOUGHT` quota is `0`
  - PATH `THOUGHT` frozen is `false`
  - deployer balance is non-zero
  - ADMIN balance is non-zero

## Blocker 1: deploy keystore address resolution is wrong

`lib/common.sh` currently resolves the deployer address with:

```sh
jq -r '.address' "$SEPOLIA_DEPLOY_KEYSTORE_JSON"
```

The actual canonical keystore on Dev/Signing OS is Foundry-compatible but does not contain a top-level `.address`. Its keys are:

```json
["crypto", "id", "version"]
```

Local rehearsal fails with:

```text
ERROR: deploy keystore address 0xnull != expected 0x3e4fA9f09d8EDe66561145E1ef3bc127F80ED396
```

Required fix:

Resolve the keystore address through Foundry instead of JSON shape assumptions:

```sh
deploy_keystore_address() {
  if [ -n "${SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE:-}" ]; then
    cast wallet address \
      --keystore "$SEPOLIA_DEPLOY_KEYSTORE_JSON" \
      --password-file "$SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE"
  else
    cast wallet address \
      --keystore "$SEPOLIA_DEPLOY_KEYSTORE_JSON" \
      --password "$SEPOLIA_DEPLOY_KEYSTORE_PASSWORD"
  fi
}
```

After this change, `bin/preflight` and `bin/verify` should pass on Dev OS using the canonical env.

## Blocker 2: push scripts do not push back to Dev OS

Current push scripts copy into a local absolute path:

```sh
/Users/bigu/Private/signing-os-bridge/incoming/$HOST
```

On Signing OS the operator account is `3kg`, and the Dev OS bridge is remote. These scripts would not push evidence back to Dev OS.

Required fix:

Use rsync over SSH, matching the existing PATH pack bridge shape:

```sh
DEV_OS_SSH="${DEV_OS_SSH:-bigu@192.168.0.104}"
DEV_OS_BRIDGE_INCOMING="${DEV_OS_BRIDGE_INCOMING:-/Users/bigu/Private/signing-os-bridge/incoming}"
HOST="$(hostname -s 2>/dev/null || hostname)"

rsync -a --delete "$LATEST/" "$DEV_OS_SSH:$DEV_OS_BRIDGE_INCOMING/$HOST/$(basename "$LATEST")/"
```

For deployment history:

```sh
rsync -a --delete "$HISTORY/" "$DEV_OS_SSH:$DEV_OS_BRIDGE_INCOMING/$HOST/$RUN_ID/"
```

Do not write directly to `/Users/bigu/Private/...` on Signing OS.

## Risk: source snapshot is curated, not a full archive

`source/` contains the deploy-relevant subset, not a full git archive of the source commit.

This can be acceptable, but the manifest should explicitly say it is a curated deploy source snapshot, not an exact full repository snapshot. If OPS requires exact source provenance, include a full `git archive` snapshot or a tarball hash.

## Risk: ADMIN Ledger signs large spec registration calldata

`bin/apply` asks the ADMIN Ledger to sign:

```text
registerThoughtSpec(string,string,bytes)
```

The spec bytes are about 8.5 KB. This may work with Ledger blind signing enabled, but it is a real operator risk.

If this is not rehearsed, consider either:

- documenting the expected Ledger prompt and failure recovery, or
- changing the contract/deploy design so the initial pinned spec is set during deployment while the immutable registry owner remains ADMIN.

## Required DEV Action

1. Patch `lib/common.sh` deploy keystore address resolution.
2. Patch both push scripts to rsync back to Dev OS.
3. Regenerate the Signing OS pack, including `SHA256SUMS.txt`, `PACK-MANIFEST.json`, and `READY-PACK-MANIFEST.json`.
4. Rerun:

```sh
npm run build:evm
npm run test:evm
gitleaks detect --no-git --redact
shasum -a 256 -c SHA256SUMS.txt
bash -n bin/preflight bin/verify bin/approve bin/apply bin/postconditions tools/push-latest-result.sh tools/push-deployment-history.sh
```

5. Rehearse `bin/preflight` and `bin/verify` on Dev OS against the canonical env, or document why that cannot be done.

OPS can stage the next pack after these blockers are fixed.
