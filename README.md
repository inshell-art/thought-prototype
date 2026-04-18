# Thought Prototype

## Notice: SVG text uses system monospace
- Title glyphs are emitted as `<text font-family="monospace">` in the SVG.
- Rendering depends on the viewer environment (OS/browser fonts).

## Local EVM flow
- This path is intentionally transitional and should be treated as deprecated once the next renderer/contract refactor starts.
- Solidity contracts live in `evm/`.
- Start a local chain with `anvil`.
- Deploy the contracts and write frontend addresses with `npm run deploy:evm-local`.
- Run the browser app with `npm run dev -- --host 127.0.0.1 --port 5178`.
- `contracts.html` now calls the EVM `ThoughtPreviewer.preview(uint256,uint64,string)` entrypoint over `eth_call`.
