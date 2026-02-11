# Tick Metering Implementation Summary

Purpose
- Prevent Starknet step-limit reverts by adding a deterministic, explicit tick (fuel) meter to the Cairo renderer.
- Keep outputs deterministic: same inputs + same max_ticks => same output, same ticks_used, same stop point.
- Make failure graceful: return a valid SVG or status instead of a revert.

Mental Model
- The renderer is a pipeline (sample -> WFC -> SVG). Each stage has a predictable growth driver (text length, pattern count, grid size, frames).
- A tick is an internal work unit, not a Starknet step. It is a consistent, deterministic proxy for cost.
- The tick budget is enforced in-contract. When ticks run out, we stop computation and return a minimal SVG with a status/phase.
- A close-out reserve is always kept so the SVG can be closed even when fuel is low.

Pipeline (where ticks are charged)
1) Input normalization and seed derivation
2) Sample/palette generation
3) Pattern extraction and propagator build
4) WFC loop (observe -> propagate)
5) SVG assembly (filters + per-iteration frames + title)

Implementation Summary (contracts/src/lib.cairo)
- TickState
  - ticks_used: u64
  - max_ticks: u64
  - exhausted: bool
  - phase: u8
- tick(ref state, amount) increments ticks_used and flags exhausted if > max_ticks.
- ticks_remaining(ref state) + ensure_budget(ref state, needed)
  - Used for preflight guardrails and close-out reserve.
- SVG_CLOSEOUT_RESERVE_TICKS
  - Reserved budget to ensure the SVG is always properly closed.
- estimate_frame_cost(grid_size, pattern_count, generation_complete)
  - Predicts per-frame tick cost for guardrails.

Guardrails (preflight checks)
- Before heavy stages:
  - Propagator build: remaining >= reserve + 4 * P^2
  - WFC init: remaining >= reserve + cells * P * 5
  - Each frame: remaining >= reserve + frame_cost
- If reserve cannot be maintained, return exhausted SVG immediately.

Exhaustion Behavior
- If ticks are exhausted mid-pipeline:
  - Stop loops as soon as possible.
  - Return a minimal SVG via render_exhausted_svg(text, phase).
  - preview_metrics returns status=1 (exhausted) and the last phase reached.

Determinism
- All tick checks are deterministic and ordered.
- Randomness is still split (WFC RNG vs visual RNG), but tick use is stable for identical inputs.

Entry Points
- preview(account_address, index, text)
  - Uses DEFAULT_MAX_TICKS and returns SVG.
- preview_with_fuel(account_address, index, text, max_ticks)
  - Returns (svg, ticks_used, status, phase).
- preview_metrics(account_address, index, text, max_ticks)
  - Returns ticks_used + phase + grid_size + pattern_count + frame_count + contradiction_cell + status.

Tick Weights (current final values)
- truncate_text: +1 per byte
- compute_seed_u128: +2 per byte
- split_words: +1 per byte
- build_char_color_map: +2 per char
- build_char_grid: +1 per char
- build_palette_and_sample: +1 per pixel, +5 per palette insert
- build_patterns: +1 per window, +1 per symmetry, +2 per insert/update
- build_propagator: +1 per adjacency test (4 * P * P)
- init_wfc_state: +1 per wave entry, +1 per compat entry
- observe_wfc: +1 per cell scan, +1 per weight sum
- propagate_wfc: +1 per stack pop, +1 per neighbor candidate
- append_filter: +5 per filter
- append_frame_group: +1 per cell + (N^2 * P per cell when incomplete) +2 per rect
- append_title: +2 per char
- svg finalize: +10 flat

Calibration Approach (devnet)
- Used preview_metrics for ticks_used and starknet_simulateTransactions (invoke v3, SKIP_VALIDATE) for l2_gas.
- Fits computed on status=0 (non-exhausted) samples only.
- max_ticks=30,000 (40 texts): l2_gas ~= 43,935.1 * ticks + 8,894,586.3 (R^2=0.9893); 0 reverts.
- max_ticks=30,000 (200 texts): l2_gas ~= 42,703.7 * ticks + 21,510,370.0 (R^2=0.9857); 0 reverts.
- max_ticks=32,000 (200 texts): l2_gas ~= 42,374.5 * ticks + 23,624,777.9 (R^2=0.9858); 0 reverts.
- max_ticks=34,000 (200 texts): l2_gas ~= 42,374.5 * ticks + 23,624,777.9 (R^2=0.9858); 0 reverts.
- max_ticks=35,000 (200 texts): l2_gas ~= 42,345.9 * ticks + 23,824,935.3 (R^2=0.9870); 1 RunResources revert.
- max_ticks=36,000 (200 texts): l2_gas ~= 42,345.9 * ticks + 23,824,935.3 (R^2=0.9870); 2 RunResources reverts.
- max_ticks=38,000 (200 texts): l2_gas ~= 42,345.9 * ticks + 23,824,935.3 (R^2=0.9870); 5 RunResources reverts.
- max_ticks=40,000 (40 texts): l2_gas ~= 43,048.5 * ticks + 14,046,719.5 (R^2=0.9880); 2 RunResources reverts.
- max_ticks=40,000 (200 texts): l2_gas ~= 42,345.9 * ticks + 23,824,935.3 (R^2=0.9870); 8 RunResources reverts.
- This validates tick weights as a stable proxy within a devnet-configured budget.

Budget Decision (devnet)
- Budget sweep (200 texts, len<=23) shows max_ticks=34,000 as the highest tested value with 0 RunResources reverts.
- RunResources starts at max_ticks=35,000 (1 revert) and grows through 36k/38k/40k.
- A safer global budget avoids reverts while still delivering partial output.
- Final default:
  - DEFAULT_MAX_TICKS = 30,000
  - SVG_CLOSEOUT_RESERVE_TICKS = 5,000

Why 30,000
- In random sampling (40 texts, len<=23) and a larger set (200 texts, len<=23), max_ticks=30,000 produced zero RPC reverts.
- Budget sweep indicates 32k and 34k also avoid reverts on the same 200-text set, but 35k already reverts; 30k keeps a conservative buffer.
- Many cases exhaust as expected (status=1), which is correct behavior and avoids revert risk.

What This Enables
- Deterministic cost control for on-chain rendering.
- A clear profiling path (preview_metrics) to iterate on optimization levels.
- A safe fallback path (render_exhausted_svg) to avoid invalid or reverted SVG outputs.

Notes for Future Work
- Re-deploy contracts when constants (DEFAULT_MAX_TICKS) change, or FE will still use older deployed logic.
- For tighter budgets, reduce frame count or pattern complexity (optimization ladder).
- For more accurate calibration, expand the sample set and repeat the l2_gas vs ticks regression.
