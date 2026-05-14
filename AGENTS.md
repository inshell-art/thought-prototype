# AGENTS

## Scope
- THOUGHT contains the frontend and EVM contracts for minting one THOUGHT from one PATH movement unit.
- Contract code lives in `evm/`.
- Do not change PATH or Pulse contracts from this repo. Coordinate those changes in `path/` and `pulse/`.

## Commands
- Frontend tests: `npm test`.
- EVM build: `npm run build:evm`.
- EVM tests: `npm run test:evm`.
- Local EVM deploy: `npm run deploy:evm-local`.

## Publish-Ready Contract Invariants
- `ThoughtNFT.pathNft` and `ThoughtNFT.thoughtSpecRegistry` are immutable constructor dependencies.
- `ThoughtNFT.mint` consumes exactly one PATH `THOUGHT` movement unit atomically before minting a THOUGHT.
- Failed THOUGHT mints must not consume PATH, reserve text hashes, or increment supply.
- Canonical text is uppercase A-Z plus single spaces. Non-canonical text must be rejected before PATH consumption.
- Canonical text hashes are globally unique; the same canonical text cannot mint twice even with different provenance.
- `ThoughtSpecRegistry` is the append-only source of truth for valid registered `THOUGHT.vN.md` spec names, ids, hashes, refs, and exact bytes.
- There is no active/frozen/pinned THOUGHT spec at contract level. Do not reintroduce `activeSpecId`, `freezeActiveSpec`, `specAdmin`, or a required/latest spec gate in `ThoughtNFT`.
- `ThoughtNFT.mint` must require and store both `thoughtSpecId` and `thoughtSpecHash`; mint validates the exact registered pair before PATH consumption.
- Multiple registered THOUGHT spec versions may coexist and remain mintable in one collection.
- Deploy scripts must read `THOUGHT.vN.md` as raw bytes, reject BOM/CRLF/name/header mismatches, hash the exact bytes, register with `registerThoughtSpec`, verify registry metadata/readback, and write `recommendedThoughtSpec*` release fields.
- Color Font v1 is a standalone immutable contract dependency. ABI must remain stable: id, version, 26 glyphs, glyph lookup, data string, and hash.
- `tokenURI` must remain marketplace-compatible: ERC721 metadata interface, data URL JSON, embedded SVG image, path id, prompt hash, provenance hash, spec id, and provenance payload.
- `tokenURI` must not embed full spec text. Use compact spec ID/hash metadata and `thoughtSpecOf(tokenId)` / registry readback for name/ref/full bytes.
- PATH movement setup must be frozen by deployment scripts after configuring `THOUGHT` movement quota.

## SVG text rendering
- Title text is emitted as `<text font-family="monospace">` in the SVG.
- Output rendering depends on the viewer environment fonts.

## Security
- Do not add secrets, live RPC keys, private keys, mnemonics, or real operator material.
- Treat local deployment addresses as generated state unless deliberately reviewed.
- Before commit, inspect staged diff and run `gitleaks detect --no-git --redact` when available.
