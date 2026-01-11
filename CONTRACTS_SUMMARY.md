# Thought Prototype: Code Summary + Contract Plan

## Purpose
This repo is a Vite-based prototype that renders a "thought look" image from text by:
1) converting text into a colored sample grid,
2) running a Wave Function Collapse (WFC) solver to generate a grid,
3) rendering the grid into SVG with filters and a bottom legend strip.

The next goal is to port the logic to Starknet contracts and decide how much rendering should happen on-chain (especially full SVG vs. hash/metrics).

## Current Code Structure (key layers)
- Sample layer: `src/domain/sample/analyze-for-wfc.ts`
  - Parses text into a word grid (rows split by spaces/newlines).
  - Assigns deterministic colors per character via PRNG.
  - Outputs `ThoughtData` with `chars`, `wordMaxLength`, `wordCount`.

- WFC core: `src/domain/wfc/wfc-algorithm.ts`
  - Overlapping model with `N=2` patterns.
  - Builds a propagator (allowed neighbor patterns).
  - Iteration loop: observe -> ban -> propagate.
  - Tracks per-cell entropy and contradictions.
  - Contradiction = any cell with zero possible patterns (records `blackHoleCell`).

- Render layer: `src/domain/render/*`
  - `layout-svg.ts`: orchestrates WFC + SVG assembly + legend strip.
  - `pixels.ts`: builds RGBA pixel buffer from `ThoughtData`.
  - `frames.ts`: generates per-iteration rects + frame timing.
  - `filters.ts`: wobble filter defs for each frame.
  - `colors.ts`: rgba helpers.
  - `svg-utils.ts`: svg embed + text clamp/escape helpers.
  - `preview.ts`: legend mini previews.

- App entry: `src/main.ts`
  - Inputs: `token_id` + text.
  - Seeds RNG, runs sample + render.
  - Splits RNG streams: WFC RNG and visual RNG.
  - Provides a "Copy SVG" button and preview panels.

## Pipeline Summary
1) **Text -> Sample Grid**
   - Characters get deterministic colors based on seed.
   - Result is a small RGBA grid (sample image).
2) **Sample Grid -> WFC**
   - Overlapping WFC with `N=2`.
   - Select lowest entropy cell, collapse, propagate bans to neighbors.
   - Frames captured per iteration for animated render.
3) **WFC -> SVG**
   - Frames are converted into rect grids and wrapped in timed groups.
   - A bottom "strip" renders: text, source preview, output preview, pattern preview.
   - Visuals use wobble filters (per-frame turbulence).

## Contradiction ("Black Hole")
- A contradiction occurs when a cell has zero possible patterns.
- The model records `blackHoleCell` and `contradiction`.
- Current behavior: the WFC loop stops on contradiction, and a black cell overlay is shown at the recorded frame.
- Note: The domain intent is to treat contradiction as a *cell state* while letting the grid iteration continue; current code stops the grid, which may not match intended semantics.

## Determinism
- RNG is deterministic from `seedKey = token_id + text`.
- RNG streams are split:
  - WFC randomness (collapses).
  - Visual randomness (filters/opacity) so the harness aligns with UI.

## Harness
- `scripts/contradiction-harness.ts` finds token_id + text that trigger contradictions.
- Uses the same sample + WFC setup.
- Useful for on-chain step-limit profiling and debugging.

## Contract Goal (High-Level)
We want two main contracts:
1) **Seed generator** (text + account + index -> seed)
2) **Thought renderer** (text + seed -> output)

The renderer should implement a reduced or optimized WFC and return either:
- a full SVG, or
- a hash/metric for debugging (lighter on steps).

## Proposed Contract Structure (Cairo)
- `seed_generator.cairo`
  - `get_seed(text: ByteArray, account: ContractAddress, index: u64) -> felt252`
  - Pure hash-based, no storage required.

- `thought_renderer.cairo`
  - `render(text: ByteArray, seed: felt252) -> ByteArray` (full SVG)
  - `render_hash(text: ByteArray, seed: felt252) -> felt252` (debug/harness)
  - Optional `render_metrics(...) -> (hash, steps, contradictions)`

- `lib/`
  - `prng.cairo`: deterministic RNG
  - `text.cairo`: parsing/tokenizing
  - `sample.cairo`: build sample grid (text -> colored cells)
  - `wfc.cairo`: overlapping model and propagation
  - `svg.cairo`: SVG assembly or minimal data encoding
  - `types.cairo`: RGBA/grid/config structs

## Key Question (On-chain SVG vs. Hash)
**Question 2:** Should the renderer return full SVG on-chain *now*, or return only a hash/metric until step limits are proven safe?

Tradeoffs:
- **Full SVG on-chain**
  - Pros: self-contained, matches the prototype output directly.
  - Cons: high step costs (loops over grid, patterns, filters, string ops), likely to hit Starknet step limits with realistic text lengths.

- **Hash/metric entrypoint first**
  - Pros: fast, deterministic, low step usage; ideal for benchmarking optimization ladder and detecting contradictions.
  - Cons: no direct visual output; requires off-chain rendering for preview.

Recommended path:
- Implement `render_hash` (or `render_metrics`) first to establish limits and optimization progress.
- Add full SVG later once step limits are validated for a minimal effect level.

## Open Decisions
- Do we treat contradiction as a cell state (continue iterations) or terminate generation (current code)?
- Do we cap grid size for on-chain viability?
- Do we omit/limit filters on-chain, or move them off-chain?

