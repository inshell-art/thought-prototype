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
- `ThoughtSpecRegistry` is the source of truth for valid THOUGHT.md spec ids and spec bytes.
- `ThoughtNFT.activeSpecMeta()` must reflect the active registry-backed `THOUGHT.v1.md` metadata.
- Color Font v1 is a standalone immutable contract dependency. ABI must remain stable: id, version, 26 glyphs, glyph lookup, data string, and hash.
- `tokenURI` must remain marketplace-compatible: ERC721 metadata interface, data URL JSON, embedded SVG image, path id, prompt hash, provenance hash, spec id, and provenance payload.
- PATH movement setup must be frozen by deployment scripts after configuring `THOUGHT` movement quota.

## SVG text rendering
- Title text is emitted as `<text font-family="monospace">` in the SVG.
- Output rendering depends on the viewer environment fonts.

## Security
- Do not add secrets, live RPC keys, private keys, mnemonics, or real operator material.
- Treat local deployment addresses as generated state unless deliberately reviewed.
- Before commit, inspect staged diff and run `gitleaks detect --no-git --redact` when available.
