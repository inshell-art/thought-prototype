# THOUGHT EVM Contracts

This directory contains the Ethereum/Foundry port of the THOUGHT contracts.

## Contracts
- `SeedGenerator.sol`: deterministic `getSeed(uint256,uint64,string)` helper.
- `ColorFontV1.sol`: immutable A-Z color glyph mapping contract plus the renderer data library.
- `ThoughtPreviewer.sol`: `preview`, `previewWithFuel`, and `previewMetrics`.
- `ThoughtSpecRegistry.sol`: owner-managed active `THOUGHT.md` registry. Spec bytes are stored once in contract code storage and exposed through hash-validated read helpers.
- `ThoughtNFT.sol`: ERC-721 mint contract for front-page THOUGHT outputs. Each mint stores compact provenance JSON, typed hashes, registry-backed `THOUGHT.md` spec id, and Color Font v1 identity/hash; it enforces unique canonical text and consumes one PATH `THOUGHT` movement unit atomically before minting. THOUGHT mint is non-payable; movement permission comes from PATH.

## Commands
- `forge build`
- `forge test`
- `forge snapshot --offline`
- `PATH_NFT_ADDRESS=<PathNFT address> ../scripts/deploy-evm-local.sh`

## Local frontend wiring
- Deployment writes `addresses.anvil.json`.
- Deployment stores bundled `THOUGHT.v1.md` in `ThoughtSpecRegistry`, marks it active, and writes the registry address plus active spec id/hash/ref.
- The deploy script configures `PathNFT.setMovementConfig(bytes32("THOUGHT"), thoughtNft, 1)` and then freezes that movement config by default. Set `CONFIGURE_PATH_MOVEMENT=0` to skip those admin calls.
- `src/contracts-main.ts` reads that file and calls the preview contract over JSON-RPC.
- `src/main.ts` fetches the active spec text from `ThoughtSpecRegistry`, validates its hash, caches it by chain/registry/spec/hash, and uses it for generation and mint provenance.

## Release Invariants

- `ThoughtNFT` is pinned to one PATH contract, one `ThoughtSpecRegistry`, and one `ColorFontV1` contract at construction.
- A successful THOUGHT mint consumes one PATH `THOUGHT` movement unit and records the returned PATH serial.
- THOUGHT mint is non-payable. There is no `mintPrice`, `setMintPrice`, or `withdraw` path.
- Failed mints must not consume PATH or reserve the canonical text hash.
- `ThoughtSpecRegistry` must contain the active `THOUGHT.v1.md` spec before public minting.
- The deploy script should configure PATH `THOUGHT` movement quota to `1` and freeze that movement before public use.
- Token metadata is on-chain JSON with embedded SVG image data and provenance fields.
- Color Font v1 is exposed through the standalone `ColorFontV1` contract ABI. `ThoughtNFT` also forwards read helpers to the pinned Color Font contract for compatibility.

## Sepolia Readiness Contract

Constructor params:

- `pathNft`: deployed `PathNFT` address. It must contain the `THOUGHT` movement config pointing at the deployed `ThoughtNFT`.
- `thoughtSpecRegistry`: deployed `ThoughtSpecRegistry` address with active `THOUGHT.v1.md`.
- `colorFont`: deployed standalone `ColorFontV1` address. `ThoughtNFT` verifies its id, version, and hash in the constructor.

Authorization and freeze assumptions:

- `ThoughtNFT` has no owner and no post-deploy admin path.
- `ThoughtSpecRegistry` is owner-managed by its deployer. Register the launch `THOUGHT.v1.md` spec before public minting.
- PATH admin configures `PathNFT.setMovementConfig(bytes32("THOUGHT"), thoughtNft, quota)` and freezes it before public use.
- The launch quota for THOUGHT movement is currently `1` per PATH token unless a later movement policy explicitly changes it.

PATH consumption flow:

1. User owns or is approved for the PATH token.
2. User signs the PATH `ConsumeAuthorization` payload for movement `THOUGHT`, executor `ThoughtNFT`, nonce, and deadline.
3. User calls `ThoughtNFT.mint(...)` with canonical text, provenance, PATH id, spec id, deadline, and PATH signature.
4. `ThoughtNFT` validates spec registration, canonical text, uniqueness, and provenance size before touching PATH.
5. `ThoughtNFT` calls `PathNFT.consumeUnit(pathId, THOUGHT, msg.sender, deadline, signature)`.
6. `PathNFT` verifies signature/owner/approval/minter/quota/order, consumes one unit, emits `MetadataUpdate` and `MovementConsumed`, and returns the movement serial.
7. `ThoughtNFT` records the PATH id and serial, mints the THOUGHT NFT, and emits `PathThoughtConsumed` and `ThoughtMinted`.

Irreversible actions:

- A successful THOUGHT mint permanently consumes one PATH `THOUGHT` movement unit.
- Canonical text hashes are globally unique and cannot be reminted.
- Registered spec bytes are stored in immutable contract code pointers; the registry can add/set active specs only through its owner.
- Color Font v1 data is contract-defined and immutable for the deployed `ColorFontV1`.

Metadata and indexer expectations:

- `ThoughtMinted` is the canonical mint event.
- `PathThoughtConsumed` links a THOUGHT token to PATH consumption.
- `tokenURI` returns marketplace-shaped JSON with embedded SVG, PATH id, PATH serial, text hash, prompt hash, provenance hash, spec id, spec ref/hash, color font id/version/hash, and provenance payload.
