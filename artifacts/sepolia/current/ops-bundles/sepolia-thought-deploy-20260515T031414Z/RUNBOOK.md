# THOUGHT Sepolia Deploy Bundle

Run ID: `sepolia-thought-deploy-20260515T031414Z`

This bundle deploys THOUGHT against the already-qualified PATH Sepolia deployment. It does not redeploy PATH.

PATH release source commit: `e078ac33a354ae0783ba382fddb7ecde29d931de`
PATH qualified repo commit: `8ac1638e88f07ff2fb94745c20f081abb427aa7d`

## Authority Model

- PATH admin: `0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981` (`SEPOLIA_ADMIN_HW_A`)
- THOUGHT deploy signer: `SEPOLIA_DEPLOY_SW_A`
- THOUGHT registry owner: `0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981` (`SEPOLIA_ADMIN_HW_A`)
- PATH movement configured after THOUGHT deploy: `THOUGHT -> ThoughtNFT`, quota `1`, then frozen.

`ThoughtSpecRegistry` receives its immutable owner as a constructor argument. The deployer does not become registry owner unless it is explicitly passed as owner.

## Preflight

```bash
cd /path/to/THOUGHT
git checkout 5bce62a1b8909fe96e10a4fb283d3b934a5e367d
git rev-parse HEAD
# expected: 5bce62a1b8909fe96e10a4fb283d3b934a5e367d

npm run build:evm
npm run test:evm

cast chain-id --rpc-url "$SEPOLIA_RPC_URL"
# expected: 11155111

cast code --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D
cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "getAuthorizedMinter(bytes32)(address)" 0x54484f5547485400000000000000000000000000000000000000000000000000
cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "getMovementQuota(bytes32)(uint32)" 0x54484f5547485400000000000000000000000000000000000000000000000000
cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "isMovementFrozen(bytes32)(bool)" 0x54484f5547485400000000000000000000000000000000000000000000000000
# expected before config: zero address, 0, false
```

## Deploy THOUGHT

Set signer modes explicitly:

```bash
DEPLOY_SIGNER_ARGS=(--account SEPOLIA_DEPLOY_SW_A)
REGISTRY_OWNER_SIGNER_ARGS=(--account SEPOLIA_ADMIN_HW_A)
PATH_ADMIN_SIGNER_ARGS=(--account SEPOLIA_ADMIN_HW_A)

# Hardware examples:
# REGISTRY_OWNER_SIGNER_ARGS=(--ledger --sender 0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981)
# PATH_ADMIN_SIGNER_ARGS=(--ledger --sender 0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981)
```

Deploy the supporting contracts:

```bash
cd /path/to/THOUGHT/evm

forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "${DEPLOY_SIGNER_ARGS[@]}" --json src/SeedGenerator.sol:SeedGenerator | tee seed.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "${DEPLOY_SIGNER_ARGS[@]}" --json src/ColorFontV1.sol:ColorFontV1 | tee color-font.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "${DEPLOY_SIGNER_ARGS[@]}" --json src/ThoughtPreviewer.sol:ThoughtPreviewer | tee previewer.json
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "${DEPLOY_SIGNER_ARGS[@]}" --json \
  src/ThoughtSpecRegistry.sol:ThoughtSpecRegistry \
  --constructor-args 0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981 | tee registry.json

REGISTRY=$(jq -r .deployedTo registry.json)
COLOR_FONT=$(jq -r .deployedTo color-font.json)
```

Register the pinned THOUGHT spec bytes:

```bash
SPEC_BYTES=0x$(xxd -p -c 256 ../THOUGHT.v1.md | tr -d '\n')

cast send --rpc-url "$SEPOLIA_RPC_URL" "${REGISTRY_OWNER_SIGNER_ARGS[@]}" "$REGISTRY" \
  "registerThoughtSpec(string,string,bytes)" \
  "THOUGHT.v1.md" \
  "THOUGHT.v1.md" \
  "$SPEC_BYTES"

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" \
  "isRegisteredThoughtSpec(bytes32,bytes32)(bool)" \
  0xe201170ae183f114064f4492cbc4942f7d3d68b74a08d3dc4b4f61edec213d78 \
  0x1abb9da7ba36102726375510e66afe255f8c6e0d771b4c3b90c5d22a9b8eb909
# expected: true
```

Deploy `ThoughtNFT` against PATH:

```bash
forge create --broadcast --rpc-url "$SEPOLIA_RPC_URL" "${DEPLOY_SIGNER_ARGS[@]}" --json \
  src/ThoughtNFT.sol:ThoughtNFT \
  --constructor-args 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "$REGISTRY" "$COLOR_FONT" | tee thought-nft.json

THOUGHT_NFT=$(jq -r .deployedTo thought-nft.json)
```

## Configure PATH Movement

These calls must be signed by PATH admin `SEPOLIA_ADMIN_HW_A`, not by a random deployer.

```bash
cast send --rpc-url "$SEPOLIA_RPC_URL" "${PATH_ADMIN_SIGNER_ARGS[@]}" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D \
  "setMovementConfig(bytes32,address,uint32)" \
  0x54484f5547485400000000000000000000000000000000000000000000000000 \
  "$THOUGHT_NFT" \
  1

cast send --rpc-url "$SEPOLIA_RPC_URL" "${PATH_ADMIN_SIGNER_ARGS[@]}" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D \
  "freezeMovementConfig(bytes32)" \
  0x54484f5547485400000000000000000000000000000000000000000000000000
```

## Postconditions

```bash
cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "getAuthorizedMinter(bytes32)(address)" 0x54484f5547485400000000000000000000000000000000000000000000000000
# expected: $THOUGHT_NFT

cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "getMovementQuota(bytes32)(uint32)" 0x54484f5547485400000000000000000000000000000000000000000000000000
# expected: 1

cast call --rpc-url "$SEPOLIA_RPC_URL" 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D "isMovementFrozen(bytes32)(bool)" 0x54484f5547485400000000000000000000000000000000000000000000000000
# expected: true

cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" "pathNft()(address)"
# expected: 0x84915746a1f06850CF41a3E90C60c2DcA3fa116D

cast call --rpc-url "$SEPOLIA_RPC_URL" "$THOUGHT_NFT" "thoughtSpecRegistry()(address)"
# expected: $REGISTRY

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" "owner()(address)"
# expected: 0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981

cast call --rpc-url "$SEPOLIA_RPC_URL" "$REGISTRY" "isRegisteredThoughtSpec(bytes32,bytes32)(bool)" 0xe201170ae183f114064f4492cbc4942f7d3d68b74a08d3dc4b4f61edec213d78 0x1abb9da7ba36102726375510e66afe255f8c6e0d771b4c3b90c5d22a9b8eb909
# expected: true
```

## FE Handoff

After postconditions pass, export a THOUGHT FE release containing:

- `path_nft`: `0x84915746a1f06850CF41a3E90C60c2DcA3fa116D`
- `thought_nft`: `$THOUGHT_NFT`
- `thought_spec_registry`: `$REGISTRY`
- `thought_spec_registry_owner`: `0xa31Fe4bC2A9A4EeA01275A6c4b4be2Aa994A0981`
- `color_font_v1`: `$COLOR_FONT`
- `thought_previewer`: deployed previewer address
- `recommendedThoughtSpecName`: `THOUGHT.v1.md`
- `recommendedThoughtSpecId`: `0xe201170ae183f114064f4492cbc4942f7d3d68b74a08d3dc4b4f61edec213d78`
- `recommendedThoughtSpecHash`: `0x1abb9da7ba36102726375510e66afe255f8c6e0d771b4c3b90c5d22a9b8eb909`
