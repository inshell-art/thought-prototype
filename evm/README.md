# THOUGHT EVM Contracts

This directory contains the Ethereum/Foundry port of the THOUGHT contracts.

## Contracts
- `SeedGenerator.sol`: deterministic `getSeed(uint256,uint64,string)` helper.
- `ColorFontV1.sol`: immutable A-Z color glyph mapping contract plus the renderer data library.
- `ThoughtPreviewer.sol`: `preview`, `previewWithFuel`, and `previewMetrics`.
- `ThoughtSpecRegistry.sol`: owner-managed append-only `THOUGHT.vN.md` registry. Spec ids are computed from canonical spec names, spec hashes are computed from exact raw markdown bytes, and stored bytes are exposed through hash-validated read helpers.
- `ThoughtNFT.sol`: ERC-721 mint contract for front-page THOUGHT outputs. Each mint stores compact provenance JSON, typed hashes, the registered `thoughtSpecId`/`thoughtSpecHash` pair declared for that work, and Color Font v1 identity/hash; it enforces unique canonical text and consumes one PATH `THOUGHT` movement unit atomically before minting. THOUGHT mint is non-payable; movement permission comes from PATH.

## Commands
- `forge build`
- `forge test`
- `forge snapshot --offline`
- `PATH_NFT_ADDRESS=<PathNFT address> ../scripts/deploy-evm-local.sh`

## Local frontend wiring
- Deployment writes `addresses.anvil.json`.
- Deployment stores raw bundled `THOUGHT.v1.md` bytes in `ThoughtSpecRegistry`, verifies returned id/hash/readback, and writes the registry address plus `recommendedThoughtSpecName`, `recommendedThoughtSpecId`, and `recommendedThoughtSpecHash`.
- The deploy script configures `PathNFT.setMovementConfig(bytes32("THOUGHT"), thoughtNft, 1)` and then freezes that movement config by default. Set `CONFIGURE_PATH_MOVEMENT=0` to skip those admin calls.
- `src/contracts-main.ts` reads that file and calls the preview contract over JSON-RPC.
- Frontend code may use the recommended spec from deploy artifacts as a default, but the contract does not require active/latest spec semantics.

## Release Invariants

- `ThoughtNFT` is pinned to one PATH contract, one `ThoughtSpecRegistry`, and one `ColorFontV1` contract at construction.
- `ThoughtNFT` is not pinned to any THOUGHT spec version. Each mint must provide a nonzero registered `(thoughtSpecId, thoughtSpecHash)` pair, and older registered versions remain mintable after newer versions are registered.
- A successful THOUGHT mint consumes one PATH `THOUGHT` movement unit and records the returned PATH serial.
- THOUGHT mint is non-payable. There is no `mintPrice`, `setMintPrice`, or `withdraw` path.
- Failed mints must not consume PATH or reserve the canonical text hash.
- `ThoughtSpecRegistry` must contain any spec version the frontend or raw caller intends to use. There is no contract-level active spec.
- The deploy script should configure PATH `THOUGHT` movement quota to `1` and freeze that movement before public use.
- Token metadata is on-chain JSON with embedded SVG image data and compact provenance/spec fields. It must not embed full `THOUGHT.vN.md` text.
- Color Font v1 is exposed through the standalone `ColorFontV1` contract ABI. `ThoughtNFT` also forwards read helpers to the pinned Color Font contract for compatibility.

## Sepolia Readiness Contract

Constructor params:

- `pathNft`: deployed `PathNFT` address. It must contain the `THOUGHT` movement config pointing at the deployed `ThoughtNFT`.
- `thoughtSpecRegistry`: deployed `ThoughtSpecRegistry` address containing registered raw `THOUGHT.vN.md` bytes for the spec versions intended at launch.
- `colorFont`: deployed standalone `ColorFontV1` address. `ThoughtNFT` verifies its id, version, and hash in the constructor.

Authorization and freeze assumptions:

- `ThoughtNFT` has no owner, no spec admin, and no economic/admin mint path.
- `ThoughtSpecRegistry` is owner-managed by its deployer and append-only. Register `THOUGHT.v1.md` with exact raw bytes before public minting; later `THOUGHT.vN.md` versions may be appended without changing prior mints.
- PATH admin configures `PathNFT.setMovementConfig(bytes32("THOUGHT"), thoughtNft, quota)` and freezes it before public use.
- The launch quota for THOUGHT movement is currently `1` per PATH token unless a later movement policy explicitly changes it.

PATH consumption flow:

1. User owns or is approved for the PATH token.
2. User signs the PATH `ConsumeAuthorization` payload for movement `THOUGHT`, executor `ThoughtNFT`, nonce, and deadline.
3. User calls `ThoughtNFT.mint(...)` with canonical text, provenance, PATH id, registered spec id, registered spec hash, deadline, and PATH signature.
4. `ThoughtNFT` validates canonical text, uniqueness, provenance size, and exact registered spec ID/hash pair before touching PATH.
5. `ThoughtNFT` calls `PathNFT.consumeUnit(pathId, THOUGHT, msg.sender, deadline, signature)`.
6. `PathNFT` verifies signature/owner/approval/minter/quota/order, consumes one unit, emits `MetadataUpdate` and `MovementConsumed`, and returns the movement serial.
7. `ThoughtNFT` records the PATH id and serial, mints the THOUGHT NFT, and emits `PathThoughtConsumed` and `ThoughtMinted`.

Irreversible actions:

- A successful THOUGHT mint permanently consumes one PATH `THOUGHT` movement unit.
- Canonical text hashes are globally unique and cannot be reminted.
- Registered spec bytes are stored in immutable contract code pointers. The registry can append versions but cannot mutate a registered name/hash/ref/pointer/length.
- There is no `ThoughtNFT` spec freeze or later spec switch. Spec selection is a per-mint typed declaration validated against the registry.
- Color Font v1 data is contract-defined and immutable for the deployed `ColorFontV1`.

Metadata and indexer expectations:

- `ThoughtMinted` is the canonical mint event.
- `PathThoughtConsumed` links a THOUGHT token to PATH consumption.
- `tokenURI` returns marketplace-shaped JSON with embedded SVG, PATH id, PATH serial, text hash, prompt hash, provenance hash, spec id/hash, color font id/version/hash, and provenance payload.
- `thoughtSpecOf(tokenId)` resolves a minted token's typed spec id/hash to registry name/ref when the pair still matches registry metadata.
