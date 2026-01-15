# Tick-Fuel Metering Spec (Contracts)

Goal
- Add a deterministic, explicit tick/fuel meter to the Cairo renderer so we can trace compute cost, cap work, and return a partial/diagnostic output instead of hitting Starknet step limits.
- Preserve determinism: same inputs + same tick budget => same output and same ticks_used.

Scope
- Contracts only, specifically `contracts/src/lib.cairo` entrypoints:
  - `ThoughtPreviewer.preview(account_address, index, text)`
  - `SeedGenerator.get_seed(account_address, index, text)`
- The SVG assembly is in-contract; the meter must cover both WFC compute and SVG output building.

Non-Goals
- No algorithm changes (WFC still N=2 overlapping model).
- No UI changes or FE fallback logic.
- No compression or refactoring of SVG content; meter is additive instrumentation.

Definitions
- Tick: unit of work used to approximate Starknet step usage.
- Fuel (tick budget): max ticks allowed for a call.
- Phase: coarse pipeline stage used to report where fuel was exhausted.

High-Level Pipeline (current)
1) truncate text (MAX_TEXT_LEN)
2) compute seeds (sample, wfc, visual)
3) build palette + sample
4) build patterns + weights (skip blank patterns)
5) build propagator
6) WFC loop: observe + propagate until complete or contradiction
7) build SVG: filters + per-iteration frames + title

Proposed API Options
- Option A (minimal change): add `preview_with_fuel(account_address, index, text, max_ticks)` returning:
  - `svg: ByteArray`
  - `ticks_used: u64`
  - `status: u8` (0=ok, 1=exhausted, 2=contradiction)
  - `phase: u8` (phase enum below)
- Option B (diagnostic entrypoint): `preview_metrics(account_address, index, text, max_ticks)` returning:
  - `ticks_used`, `phase`, `grid_size`, `pattern_count`, `frame_count`, `contradiction_cell?`
  - No SVG payload (lower output size; used for profiling)
- Option C (wrapper): keep `preview()` as a wrapper that calls `preview_with_fuel()` with a default budget.

Phase Enumeration (example)
0 = SeedAndNormalize
1 = PaletteAndSample
2 = PatternBuild
3 = PropagatorBuild
4 = WfcInit
5 = WfcObserve
6 = WfcPropagate
7 = FrameRender
8 = TitleRender
9 = SvgFinalize

Tick Accounting Design
- Maintain a `TickState` passed by ref to key functions:
  - `ticks_used: u64`
  - `max_ticks: u64`
  - `exhausted: bool`
  - `phase: u8`
- Use a helper:
  - `tick(state, amount: u64) -> bool`
  - increments `ticks_used` by `amount`
  - if `ticks_used > max_ticks`: set `exhausted=true`, preserve `phase`, return false
- On exhaustion:
  - stop current loops as soon as possible
  - return a valid SVG with an overlay label: "fuel exhausted" (or use `status` to let FE display error)

Close-Out Reserve And Guardrails
- Reserve a fixed budget for SVG closure: `SVG_CLOSEOUT_RESERVE_TICKS`.
  - If `remaining < reserve`, abort early and return a minimal exhausted SVG.
  - This prevents half-written SVGs and avoids RPC revert near the step limit.
- Pre-flight checks before heavy stages:
  - Before propagator build: require `remaining >= reserve + (4 * P^2)` (or conservative bound).
  - Before WFC init: require `remaining >= reserve + (cells * P * 5)` (approx).
  - Before each frame: require `remaining >= reserve + frame_cost` (see estimate below).
- Keep these checks deterministic and ordered so the same input + budget yields the same stop point.

Metering Points (per function)
- truncate_text
  - tick per byte: `+1` per copied byte
- compute_seed_u128
  - tick per byte: `+2` per hash step
- split_words
  - tick per byte: `+1`
- build_char_color_map
  - tick per character: `+2` (lookup + RNG color for new char)
- build_char_grid
  - tick per character placed: `+1`
- build_palette_and_sample
  - tick per output pixel (tile_px^2 per char): `+1` per pixel
  - tick per palette insertion: `+5`
- build_patterns
  - outer loop per sample window: `+1`
  - symmetry expansion: `+1` per symmetry (<=8)
  - pattern insert/update: `+2`
- build_propagator
  - tick per adjacency test: `+1` (4 * P * P)
- init_wfc_state
  - tick per wave entry: `+1` (cells * P)
  - tick per compat init: `+1` (cells * P * 4)
- observe_wfc
  - tick per cell scan: `+1`
  - tick per weight sum: `+1` (cells * P)
- propagate_wfc
  - tick per stack pop: `+1`
  - tick per neighbor candidate: `+1` (depends on propagator list length)
- append_filter
  - tick per filter: `+5`
- append_frame_group (dominant)
  - per cell: `+1`
  - if generation incomplete, per contributing pattern: `+1` (N^2 * P per cell)
  - per rect appended: `+2` (ByteArray writes)
- append_title
  - tick per title char: `+2`
- svg finalize
  - flat cost `+10`

Frame Cost Estimate (for guardrails)
- `cell_count = grid_size * grid_size`
- `per_cell_complete = 3` (cell tick + rect write ticks)
- `per_cell_incomplete = 3 + (N^2 * P)`
- `frame_cost = cell_count * per_cell_complete` if generation complete
- `frame_cost = cell_count * per_cell_incomplete` if not complete

Notes on Tick Cost Calibration
- Tick weights are placeholders; the spec requires a calibration pass.
- Use `preview_metrics()` to compare tick counts with actual Starknet step usage on devnet.
- Adjust weights so `ticks_used` is roughly proportional to observed steps across text lengths.

Calibration Results (devnet, RPC spec 0.9.0)
- Used `starknet_simulateTransactions` (Invoke v3, SKIP_VALIDATE) to collect `l2_gas` and compared to `preview_metrics.ticks_used`.
- Observed near-linear fit: `l2_gas ≈ 46,553 * ticks - 2,648,334` with R² ≈ 0.999.
- Sample points (text → ticks_used → l2_gas):
  - "h" → 173 → 9,011,200
  - "hi" → 1,236 → 62,811,200
  - "hi this" → 24,693 → 1,161,411,200
  - "ab cd" → 28,350 → 1,308,291,200
- RunResources limit observed for `"hi this is"` at `max_ticks >= 52,000` (revert); succeeds with `max_ticks = 50,000` (exhausted).
- Recommendation:
  - `DEFAULT_MAX_TICKS = 50,000` (safe on devnet for current contract)
  - `SVG_CLOSEOUT_RESERVE_TICKS = 5,000` (kept)

Fuel Exhaustion Behavior
- If exhausted before WFC completes:
  - Stop further WFC iterations.
  - Emit SVG with the frames computed so far, or a minimal placeholder.
  - Add a visible label (or return `status=1` + `phase`) to signal truncation.
- If exhausted during SVG assembly:
  - Return a minimal SVG with an explicit "fuel exhausted" label.

Determinism Requirements
- If `max_ticks` is the same, output must be deterministic.
- Exhaustion must happen at deterministic boundaries (tick checks must be in fixed order).

Data Returned For Profiling
- `ticks_used`
- `phase` where exhaustion occurred
- `grid_size`, `pattern_count`, `frame_count`
- optional `contradiction_cell` if contradiction occurred before exhaustion

Implementation Checklist (Cairo)
1) Add TickState struct + tick() helper.
2) Add new entrypoint `preview_with_fuel()` and (optional) `preview_metrics()`.
3) Thread TickState through pipeline functions and add tick() calls at defined points.
4) Add early-exit paths in loops when exhausted.
5) Ensure all returns are valid ByteArray (even when exhausted).
6) Add tests using small inputs to confirm deterministic ticks.

Open Decisions
- Exact tick weights (calibration required).
- Whether to return partial SVG vs minimal error SVG on exhaustion.
- Whether to expose debug-only entrypoints on mainnet.
