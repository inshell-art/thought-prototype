# THOUGHT

## Notice: SVG text uses system monospace
- Title glyphs are emitted as `<text font-family="monospace">` in the SVG.
- Rendering depends on the viewer environment (OS/browser fonts).

## v0.0.2 release scope
- This release is the run-only LAN testing build.
- The front page has no mint path.
- The page can override bundled `THOUGHT.md` with an uploaded local markdown file per browser session.

## Local EVM flow
- This path is intentionally transitional and should be treated as deprecated once the next renderer/contract refactor starts.
- Solidity contracts live in `evm/`.
- Start a local chain with `anvil`.
- Deploy the contracts and write frontend addresses with `npm run deploy:evm-local`.
- Run the browser app with `npm run dev -- --host 127.0.0.1 --port 5178`.
- `contracts.html` now calls the EVM `ThoughtPreviewer.preview(uint256,uint64,string)` entrypoint over `eth_call`.

## Local model flow
- Install and run Ollama locally.
- Pull a model, for example `ollama pull llama3.2:1b`.
- Run the browser app with `npm run dev:lan`.
- Open `http://<your-lan-ip>:5178` from another machine on the same LAN.
- In the front page mode rail, choose `local`.
- Use the `upload THOUGHT.md` button if you want to test a local instruction file without editing the bundled repo copy.
- The uploaded markdown stays in that browser tab session only. `use bundled` reverts to the repo copy.
- The page sends the current `THOUGHT.md` plus your prompt directly to `http://127.0.0.1:11434/api/generate`.
- The model selector is provider-scoped. Ollama and OpenRouter try to load live model catalogs; OpenAI and Anthropic use curated browser-side fallback lists for now. The custom model option is only an escape hatch.
- The frontend normalizes every provider response before rendering: uppercase A-Z, non-English/non-letter runs become one space, repeated spaces collapse, and output is clipped to 120 characters.

## Modes
- `connect`: browser-only OpenRouter OAuth PKCE flow. The page stores the returned OpenRouter credential in `sessionStorage` and uses it for OpenRouter model calls.
- `direct`: advanced browser-side provider key path for OpenAI, OpenRouter, and Anthropic only.
- `local`: Ollama on `localhost`, no cloud call and no key field.
- No THOUGHT backend receives or stores provider keys in any mode.
