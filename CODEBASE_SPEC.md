# CODEBASE_SPEC

## Project map (files -> responsibilities, exports)
- `src/main.ts` (no exports): entrypoint that builds `seedKey`, calls `AnalyzeForWFC`, then `layoutSVG` to produce the SVG string (`triggerFromInput`, `render`). See `triggerFromInput` and `render` in `src/main.ts:75-107`.
- `src/helpers/prng.ts`: deterministic hash + RNG stream (`PRNG`) and numeric mapping (`remap`). See `PRNG`, `remap`, `hashSeed` in `src/helpers/prng.ts:1-42`.
- `src/domain/sample/analyze-for-wfc.ts`: text -> grid sample conversion and color assignment (`AnalyzeForWFC`, `ThoughtData`, `CharData`, `RGBA`). See `AnalyzeForWFC` and interfaces in `src/domain/sample/analyze-for-wfc.ts:54-111`.
- `src/domain/render/pixels.ts`: converts `ThoughtData` to RGBA pixel buffer used by WFC (`rectsToPixels`). See `rectsToPixels` in `src/domain/render/pixels.ts:4-31`.
- `src/domain/wfc/wfc-algorithm.ts`: WFC core implementation (`Model`, `OverlappingModel`, `WFCCfgProps`). See `Model`/`OverlappingModel` in `src/domain/wfc/wfc-algorithm.ts:17-623`.
- `src/domain/render/frames.ts`: frame representation and per-frame rect string generation (`frameProps`, `iterationsToRectBodies`, `collapseSVG`). See `src/domain/render/frames.ts:3-60`.
- `src/domain/render/filters.ts`: builds SVG filter definitions (`gridFilter`). See `src/domain/render/filters.ts:3-14`.
- `src/domain/render/colors.ts`: color conversion helpers (`rgbaToHex`, `rgbaTuple`). See `src/domain/render/colors.ts:1-13`.
- `src/domain/render/layout-svg.ts`: main SVG assembly; builds WFC model, captures frames, builds filters, and emits SVG (`layoutSVG`). See `layoutSVG` in `src/domain/render/layout-svg.ts:11-243`.
- `scripts/contradiction-harness.ts`: batch runner to find contradiction cases (`findContradictions`, `runOnce`). See `findContradictions` and `runOnce` in `scripts/contradiction-harness.ts:80-152`.
- `scripts/find-contradiction.ts`: single-run contradiction search utility (`runOnce`, `main`). See `runOnce` and `main` in `scripts/find-contradiction.ts:72-154`.

## Determinism contract (seedKey, PRNG, RNG stream splits, RNG consumption order)
- `seedKey` is `\`${token_id}:${index}:${thoughtStr}\`` in `triggerFromInput`/`render` (`src/main.ts:75-103`). `token_id` and `index` are digit-sanitized before use (`src/main.ts:58-86`).
- RNG streams:
  - `trnd = PRNG(seedKey)` for sample color assignment in `AnalyzeForWFC` (`src/main.ts:92-93`, `src/domain/sample/analyze-for-wfc.ts:54-76`).
  - `wfcRnd = PRNG(seedKey)` for WFC decisions (`src/main.ts:101-103`, `src/domain/wfc/wfc-algorithm.ts:108-187`).
  - `visualRnd = PRNG(\`${seedKey}|visual\`)` for visual parameters and filter seeds (`src/main.ts:103-104`, `src/domain/render/layout-svg.ts:27-30`, `src/domain/render/filters.ts:3-13`).
- RNG consumption order:
  - `AnalyzeForWFC` consumes `trnd` only for *new non-space* characters, in first-occurrence order; each new non-space character calls `randomCol` (3 draws: r/g/b). Whitespace uses a fixed white color and does not consume RNG (`randomCol` and `AnalyzeForWFC` in `src/domain/sample/analyze-for-wfc.ts:47-76`).
  - `layoutSVG` consumes `visualRnd` three times for `opacity`, `filterFreq`, `filterScale` (`src/domain/render/layout-svg.ts:27-30`), then once per frame to seed each filter in `gridFilter` (`src/domain/render/filters.ts:3-13`).
  - WFC consumes `wfcRnd` inside `observe`:
    - Per-cell tie-breaking noise uses `rng()` when `amount > 1 && entropy <= min` (`src/domain/wfc/wfc-algorithm.ts:126-132`).
    - `randomIndice` uses `rng()` once per collapse (`src/domain/wfc/wfc-algorithm.ts:155-181`).
  - Because the number of candidate cells and the iteration path depend on current wave state, the exact count of RNG draws per iteration varies, but is deterministic for a fixed `seedKey` and algorithm version (`observe`/`propagate` in `src/domain/wfc/wfc-algorithm.ts:108-227`).

## Data structures (ThoughtData, WfcState, Pattern, Propagator, Frame, SvgBuilder) with sizes and what drives growth
- `ThoughtData` (`src/domain/sample/analyze-for-wfc.ts:98-104`):
  - `thoughtStr`: input text.
  - `chars: CharData[]`: one entry per character in split tokens; size ~ `textLen` (including spaces) (`splitWords` and `AnalyzeForWFC` in `src/domain/sample/analyze-for-wfc.ts:1-76`).
  - `wordMaxLength`: longest token length; drives sample width (`src/domain/sample/analyze-for-wfc.ts:80-86`).
  - `wordCount`: number of tokens from `splitWords`; drives sample height (`src/domain/sample/analyze-for-wfc.ts:80-86`).
  - Growth drivers: `textLen`, tokenization by spaces/newlines (`splitWords` in `src/domain/sample/analyze-for-wfc.ts:1-42`).
- `WfcState` (implicit in `Model` fields, `src/domain/wfc/wfc-algorithm.ts:17-51`):
  - `wave: boolean[C][P]`, `compatible: number[C][P][4]`, `entropies: number[C]`,
    `sumsOfOnes: number[C]`, `sumsOfWeights: number[C]`, `observed: number[C]`,
    `stack: Array<[cell, tile]>` up to `C * P`.
  - `C = gridW * gridH`, `P = T` patterns. Growth drivers: grid size and pattern count (`cfg.outputWidth/Height` in `src/domain/render/layout-svg.ts:65-72`, `T` in `src/domain/wfc/wfc-algorithm.ts:498-505`).
- `Pattern` (`OverlappingModel.patterns`, `src/domain/wfc/wfc-algorithm.ts:353-506`):
  - Each pattern is `number[N*N]` indices into `colors`, with `N=2` from `layoutSVG` (`src/domain/render/layout-svg.ts:65-74`).
  - Pattern count `P` equals number of unique indices produced by symmetry-expanded sampling, excluding patterns that contain the blank color index (`patternHasBlank` and weights build in `src/domain/wfc/wfc-algorithm.ts:411-495`).
  - Growth drivers: sample width/height (`dataWidth`/`dataHeight` in `src/domain/render/layout-svg.ts:65-68`), `N` (`src/domain/render/layout-svg.ts:65-74`), number of distinct colors `K` (`src/domain/wfc/wfc-algorithm.ts:397-408`).
- `Propagator` (`OverlappingModel.propagator`, `src/domain/wfc/wfc-algorithm.ts:522-535`):
  - Shape `[4][P][<=P]`, mapping direction -> tile -> allowed neighbor tiles.
  - Growth drivers: `P`, `N`, sample diversity (`OverlappingModel` build in `src/domain/wfc/wfc-algorithm.ts:522-535`).
- `Frame` (`frameProps`, `src/domain/render/frames.ts:3-7`):
  - `uint8ClampedArray` size `C*4` (RGBA), `entropies` size `C`, `sumsOfOnes` size `C`.
  - `frames.length = F`, where `F` is number of WFC iterations captured (`src/domain/render/layout-svg.ts:94-120`).
- `SvgBuilder` (implicit in `layoutSVG` string assembly, `src/domain/render/layout-svg.ts:210-243`):
  - `frameBodies: string[F]`, each containing `C` `<rect>` nodes (`iterationsToRectBodies`, `src/domain/render/frames.ts:9-47`).
  - `frameStack: string` with `F` `<g>` layers (`collapseSVG`, `src/domain/render/frames.ts:50-59`).
  - `titleRects: string` containing up to `textLen` `<rect>` + `<text>` pairs (`src/domain/render/layout-svg.ts:158-208`).
  - Growth drivers: `F`, `C`, `textLen` (`layoutSVG` loop in `src/domain/render/layout-svg.ts:110-205`).

## Call graph from main.ts -> sample -> wfc -> render -> svg (include execution order)
1. `triggerFromInput` (`src/main.ts:75-97`):
   - Sanitizes `token_id`/`index`, builds `seedKey`, calls `AnalyzeForWFC` (`src/main.ts:76-95`).
2. `AnalyzeForWFC` (`src/domain/sample/analyze-for-wfc.ts:54-86`):
   - Tokenizes text, assigns per-character colors using `trnd`, returns `ThoughtData` (`src/domain/sample/analyze-for-wfc.ts:54-86`).
3. `render` (`src/main.ts:100-107`):
   - Builds `wfcRnd` and `visualRnd`, then calls `layoutSVG` (`src/main.ts:101-105`).
4. `layoutSVG` (`src/domain/render/layout-svg.ts:11-243`):
   - Computes grid size `n`, `opacity`, filter params (`src/domain/render/layout-svg.ts:25-30`).
   - `rectsToPixels` builds sample RGBA buffer (`src/domain/render/layout-svg.ts:56-59`, `src/domain/render/pixels.ts:4-31`).
   - Constructs `OverlappingModel` and calls `initialize`/`clear` (`src/domain/render/layout-svg.ts:65-89`, `src/domain/wfc/wfc-algorithm.ts:369-536`).
   - Iteration loop: `model.iterate(1, wfcRnd)` and `pushFrame` capture (`src/domain/render/layout-svg.ts:98-116`).
     - `iterate` -> `singleIteration` -> `observe` -> `propagate` (WFC core).
   - `iterationsToRectBodies` builds `frameBodies` (`src/domain/render/layout-svg.ts:127-128`, `src/domain/render/frames.ts:9-47`).
   - `collapseSVG` builds stacked `<g>` timeline (`src/domain/render/layout-svg.ts:129-130`, `src/domain/render/frames.ts:50-59`).
   - `gridFilter` builds `<filter>` definitions (`src/domain/render/layout-svg.ts:215-218`, `src/domain/render/filters.ts:3-14`).
   - Title line built from `ThoughtData` (`src/domain/render/layout-svg.ts:158-208`).
   - Returns SVG string assembled in `layoutSVG` (`src/domain/render/layout-svg.ts:210-243`).

## Hot loops inventory: list every loop with bound expression and growth drivers (text length, P patterns, Q queue, F frames, C cells)
Definitions used below:
- `textLen` = `thoughtStr.length` (`src/main.ts:88-90`, `src/domain/render/layout-svg.ts:18-26`).
- `gridW`, `gridH` = `outputWidth/outputHeight` (`layoutSVG`, `src/domain/render/layout-svg.ts:65-72`).
- `C = gridW * gridH`.
- `P = T` pattern count (`OverlappingModel` in `src/domain/wfc/wfc-algorithm.ts:498-505`).
- `F = frames.length` (`src/domain/render/layout-svg.ts:94-120`).
- `SMX = dataWidth`, `SMY = dataHeight` (`src/domain/render/layout-svg.ts:65-68`, `src/domain/wfc/wfc-algorithm.ts:388-389`).
- `tilePx = 2` (`src/domain/render/layout-svg.ts:56-58`), so `SMX <= textLen * tilePx` and `SMY <= textLen * tilePx` in the worst case (`AnalyzeForWFC` sets `wordMaxLength`/`wordCount` in `src/domain/sample/analyze-for-wfc.ts:80-86`).
- `Q` = total `stack` pops during propagation, bounded by `C * P` (`Model.propagate` and `ban` in `src/domain/wfc/wfc-algorithm.ts:193-314`).
- `K = colors.length`, with `K <= textLen` in the worst case (`palette` build in `src/domain/wfc/wfc-algorithm.ts:397-408`).

Loops:
- `hashSeed` (`src/helpers/prng.ts:4-7`): `for i < str.length` -> `O(textLen)`.
- `splitWords` (`src/domain/sample/analyze-for-wfc.ts:11-33`): `while i < input.length` + inner `while j < input.length` -> `O(textLen)`.
- `AnalyzeForWFC` (`src/domain/sample/analyze-for-wfc.ts:61-76`):
  - `wordsRaw.forEach` over tokens; inner `[...word].forEach` over chars -> `O(textLen)`.
  - `longest` reduce (`src/domain/sample/analyze-for-wfc.ts:45`) -> `O(textLen)`.
- `rectsToPixels` (`src/domain/render/pixels.ts:12-27`):
  - `chars.forEach` with nested `dy < tilePx`, `dx < tilePx` loops -> `O(textLen * tilePx^2) = O(textLen)`.
- `layoutSVG` frame capture (`src/domain/render/layout-svg.ts:110-116`):
  - `while !isGenerationComplete` -> `O(F)`, with per-iteration costs in WFC/graphics loops below.
- `layoutSVG` title sizing (`src/domain/render/layout-svg.ts:163-171`):
  - `for rows <= totalTitleChars` -> `O(textLen)`.
- `layoutSVG` title color map (`src/domain/render/layout-svg.ts:175-179`):
  - `for (chars)` -> `O(textLen)`.
- `layoutSVG` title rects (`src/domain/render/layout-svg.ts:181-204`):
  - `map` over `titleChars` -> `O(textLen)`.
- `iterationsToRectBodies` (`src/domain/render/frames.ts:19-45`):
  - Outer `iterations.map` -> `F`; inner `for y < h`, `for x < w` -> `C` per frame.
  - Total `O(F * C) = O(F * gridW * gridH)`.
- `collapseSVG` (`src/domain/render/frames.ts:50-59`): `bodies.map` -> `O(F)`.
- `gridFilter` (`src/domain/render/filters.ts:9-13`): `bodies.map` -> `O(F)`.
- `Model.initialize` (`src/domain/wfc/wfc-algorithm.ts:70-86`):
  - `for i < C`, `for t < P`, `for d < 4` -> `O(C * P) = O(gridW * gridH * P)`.
  - `for t < P` for weights -> `O(P)`.
- `Model.observe` (`src/domain/wfc/wfc-algorithm.ts:112-185`):
  - `for i < C` scan -> `O(C)`.
  - If solved: `for i < C`, `for t < P` to fill `observed` -> `O(C * P)`.
  - Distribution fill + `randomIndice` -> `O(P)`.
  - Collapse loop: `for t < P` calling `ban` -> `O(P)`.
  - Worst-case for `observe`: `O(C * P) = O(gridW * gridH * P)`.
- `Model.propagate` (`src/domain/wfc/wfc-algorithm.ts:193-227`):
  - `while stackSize > 0` with `Q` pops; for each pop, `for d < 4`, `for l < p.length` (`p.length <= P`) -> `O(Q * P)`.
- `Model.clear` (`src/domain/wfc/wfc-algorithm.ts:319-332`):
  - `for i < C`, `for t < P`, `for d < 4` -> `O(C * P) = O(gridW * gridH * P)`.
- `OverlappingModel` constructor (`src/domain/wfc/wfc-algorithm.ts:369-535`):
  - Sample grid allocation: `for i < SMX` -> `O(SMX) <= O(textLen)` (`src/domain/wfc/wfc-algorithm.ts:391-392`).
  - Palette build: `for y < SMY`, `for x < SMX` -> `O(SMX * SMY) <= O(textLen^2)` (`src/domain/wfc/wfc-algorithm.ts:398-408`).
  - `patternHasBlank` uses `p.some` over `N^2` -> `O(1)` per candidate (`src/domain/wfc/wfc-algorithm.ts:413-414`, `N=2` at `src/domain/render/layout-svg.ts:65-74`).
  - `pattern` helper + `indexOf` -> `O(N^2) = O(1)` per call (`src/domain/wfc/wfc-algorithm.ts:419-446`).
  - `patternFromIndex`: `for i < N^2`, inner `while residue >= power` -> `O(N^2 * K)`, with `K <= textLen`, so `O(textLen)` (`src/domain/wfc/wfc-algorithm.ts:448-461`, palette build at `src/domain/wfc/wfc-algorithm.ts:397-408`).
  - Weights scan: `for y < maxY`, `for x < maxX`, inner `for k < symmetry (<=8)` -> `O(maxX * maxY) <= O(textLen^2)` (`src/domain/wfc/wfc-algorithm.ts:471-495`).
  - Pattern/weight build: `for i < P` -> `O(P)` (`src/domain/wfc/wfc-algorithm.ts:502-506`).
  - Propagator build: `for d < 4`, `for t < P`, `for t2 < P` -> `O(P^2)` (`src/domain/wfc/wfc-algorithm.ts:522-535`).
- `graphicsComplete` (`src/domain/wfc/wfc-algorithm.ts:559-577`):
  - `for y < gridH`, `for x < gridW` -> `O(C) = O(gridW * gridH)`.
- `graphicsIncomplete` (`src/domain/wfc/wfc-algorithm.ts:580-622`):
  - `for i < C`, `for dy < N`, `for dx < N`, `for t < P` -> `O(C * P) = O(gridW * gridH * P)`.
  - Called once per captured frame (`pushFrame` in `src/domain/render/layout-svg.ts:98-103`), so total worst-case `O(F * gridW * gridH * P)`.

## WFC algorithm spec: exact pseudocode matching implementation including observe/collapse/propagate and contradiction behavior
Pseudocode mirrors `Model.observe`, `Model.propagate`, `Model.ban`, and `Model.iterate` (`src/domain/wfc/wfc-algorithm.ts:108-338`).

```
initialize():
  allocate wave[C][P], compatible[C][P][4], sumsOfOnes[C], sumsOfWeights[C], entropies[C]
  precompute weightLogWeights[P], sumOfWeights, startingEntropy

clear():
  for each cell i in C:
    for each tile t in P:
      wave[i][t] = true
      compatible[i][t][d] = propagator[opposite[d]][t].length for d in 0..3
    sumsOfOnes[i] = P
    sumsOfWeights[i] = sumOfWeights
    entropies[i] = startingEntropy
  generationComplete = false
  contradiction = false
  blackHoleCell = -1

observe(rng):
  minEntropy = +inf; argmin = -1
  for i in 0..C-1:
    if onBoundary(cell i): continue
    if sumsOfOnes[i] == 0:
      contradiction = true; blackHoleCell = i; return false
    if sumsOfOnes[i] > 1:
      noise = 1e-6 * rng()
      if entropies[i] + noise < minEntropy:
        minEntropy = entropies[i] + noise; argmin = i

  if argmin == -1:
    observed[i] = first tile with wave[i][t] true for each cell
    return true  // completed

  distribution[t] = wave[argmin][t] ? weights[t] : 0 for all t
  r = randomIndice(distribution, rng())  // weighted pick
  for t in 0..P-1:
    if wave[argmin][t] != (t == r): ban(argmin, t)
  return null  // continue

ban(i, t):
  compatible[i][t][d] = 0 for d in 0..3
  wave[i][t] = false
  push (i, t) to stack
  update sums and entropies for cell i
  if sumsOfOnes[i] == 0 and not contradiction:
    contradiction = true; blackHoleCell = i

propagate():
  while stack not empty:
    (i1, t1) = pop
    for d in 0..3:
      neighbor cell i2 = i1 + (DX[d], DY[d]) with periodic wrap (unless onBoundary)
      for each t2 in propagator[d][t1]:
        compatible[i2][t2][d] -= 1
        if compatible[i2][t2][d] == 0: ban(i2, t2)

iterate(iterations, rng):
  if iterations == 0:
    loop forever:
      result = observe(rng)
      if result != null: generationComplete = result; return result
      propagate()
  else:
    repeat iterations times:
      result = observe(rng)
      if result != null: generationComplete = result; return result
      propagate()
    return true  // iteration budget exhausted
```

Contradiction behavior:
- If any cell's `sumsOfOnes` reaches 0, the model sets `contradiction = true` and records `blackHoleCell` (`observe` at `src/domain/wfc/wfc-algorithm.ts:117-123`, `ban` at `src/domain/wfc/wfc-algorithm.ts:310-313`).
- `layoutSVG` reads `blackHoleCell` and overlays a black rect at that cell, timed to the frame where contradiction first appeared (`src/domain/render/layout-svg.ts:133-155`).

## SVG assembly spec: exact SVG structure and size/cost drivers; bytes-per-rect estimate; response size formula
SVG structure (`layoutSVG` in `src/domain/render/layout-svg.ts:210-243`):
1. `<svg data-THOUGHT=... width="100%" height="100%" viewBox="0 0 10 10" ...>` root (`src/domain/render/layout-svg.ts:210-213`).
2. `<defs>` with `F` filters from `gridFilter` (`src/domain/render/layout-svg.ts:215-218`, `src/domain/render/filters.ts:3-14`), each:
   - `<filter id="wobble-i">`
   - `<feTurbulence ... seed=...>`
   - `<feDisplacementMap ...>`
3. Timeline driver:
   - `<rect id="clock">` containing `<animate id="timeline" ... dur="10s" begin="0s;timeline.end"/>` (`src/domain/render/layout-svg.ts:220-226`).
4. Background:
   - `<rect id="background" width="100%" height="100%" fill="${rgbaToHex(canvasBg)}"/>` with `canvasBg = {0,0,0,255}` (`src/domain/render/layout-svg.ts:61-63`, `src/domain/render/layout-svg.ts:228-229`).
5. Main area:
   - `<g id="main-area" transform="...">` (`src/domain/render/layout-svg.ts:231-238`).
     - `<g id="Iterations" transform="translate(tx,ty)" style="isolation:isolate">` (`src/domain/render/layout-svg.ts:232-237`).
       - `F` frame groups from `collapseSVG` (`src/domain/render/layout-svg.ts:236`, `src/domain/render/frames.ts:50-59`):
         - `<g id="iteration-i" style="display:none; mix-blend-mode:overlay" filter="url(#wobble-i)">`
           - `C` `<rect>` elements from `iterationsToRectBodies` (`src/domain/render/frames.ts:19-44`).
           - `<set ... begin="timeline.begin+{i/10}s"/>` (`src/domain/render/frames.ts:51-57`).
       - Optional `black-hole-cell` group (displayed at contradiction frame) (`src/domain/render/layout-svg.ts:151-155`).
6. Title group (outside main area):
   - `<g id="title">` with per-character `<rect>` and `<text>` placed in a fixed-height field (`src/domain/render/layout-svg.ts:158-208`).

Cost drivers:
- `C = gridW * gridH` rects per frame (`src/domain/render/layout-svg.ts:65-72`, `src/domain/render/frames.ts:19-22`).
- `F` frames = number of WFC iterations captured (`src/domain/render/layout-svg.ts:110-116`).
- Title rects = `textLen - spaces` (`src/domain/render/layout-svg.ts:158-204`).
- Filters count = `F` (`gridFilter` maps `frameBodies` in `src/domain/render/filters.ts:9-13`, called at `src/domain/render/layout-svg.ts:215-218`).

Bytes-per-rect estimate:
- `iterationsToRectBodies` rect template (`src/domain/render/frames.ts:39-43`) is ~95 bytes plus numeric fields (x/y/size/opacity), typically ~120-150 bytes per rect depending on numeric length.
- Title rect + text pair (`src/domain/render/layout-svg.ts:195-202`) is ~180-230 bytes per non-space character (rect + text).

Approximate response size formula:
```
SVG_bytes ~= B_header
          + F * (B_filter + B_group + C * B_rect)
          + (textLen_nonspace) * (B_title_rect_text)
          + B_blackhole (optional)
```
Where:
- `B_rect ~= 120-150 bytes`, `B_filter ~= 200-260 bytes`, `B_group ~= 80-120 bytes`,
- `B_title_rect_text ~= 180-230 bytes`.

## Work-unit candidates: propose micro-ops that are bounded by compile-time constants; identify necessary constants
Bounded micro-ops (constants shown in parentheses):
- Pattern extraction for `N=2` (`OverlappingModel`, `src/domain/wfc/wfc-algorithm.ts:419-436`, `N=2` set in `src/domain/render/layout-svg.ts:65-74`): fixed 4-cell neighborhood operations.
- Neighbor propagation per ban (`Model.propagate`, `src/domain/wfc/wfc-algorithm.ts:202-225`): 4 directions (`DX/DY` fixed) with bounded adjacency list length if `MAX_PATTERNS` is fixed.
- Entropy update per ban (`Model.ban`, `src/domain/wfc/wfc-algorithm.ts:294-309`): constant-time arithmetic.
- Graphics computation per cell (`graphicsComplete`/`graphicsIncomplete`, `src/domain/wfc/wfc-algorithm.ts:559-622`): fixed `N=2` and 4 color channels; bounded by `MAX_PATTERNS`.
- Frame rect emission (`iterationsToRectBodies`, `src/domain/render/frames.ts:19-44`): per-cell rect output with bounded digits if grid size bounded.

Suggested compile-time constants (needed to bound arrays and loops):
- `MAX_GRID_W`, `MAX_GRID_H` (bounds `C`).
- `MAX_PATTERNS` (bounds `P` and propagator lists).
- `MAX_COLORS` (bounds `K` for palette).
- `MAX_TEXT_LEN` (bounds title layout loops).
- `MAX_FRAMES` (bounds `F` and filter count).
- Fixed algorithmic constants already used: `N=2`, `symmetry<=8`, directions=4, `tilePx=2`.

## Harness: how contradiction-harness finds cases and how to use it for step-limit profiling
- `scripts/contradiction-harness.ts`:
  - `buildTexts` and `randomText` generate candidate strings (`scripts/contradiction-harness.ts:58-78`).
  - `runOnce` builds `ThoughtData`, constructs `OverlappingModel`, and calls `model.generate(lrnd)` to detect contradictions (`scripts/contradiction-harness.ts:80-104`).
  - `seedKey` in the harness is `tokenId + text` (no delimiters), so harness cases are deterministic within that scheme (`scripts/contradiction-harness.ts:80-83`).
  - `findContradictions` sweeps texts and `tokenId` range, recording cases where `ok === false` and `blackHoleCell` is set (`scripts/contradiction-harness.ts:106-152`).
  - CLI supports `--count`, `--tries`, `--out` for batch collection (`scripts/contradiction-harness.ts:20-28`, `185-192`).
- Step-limit profiling use:
  - Use the harness to generate a fixed set of `(text, token_id)` cases that consistently contradict.
  - For each case, measure the number of iterations (`F`) or steps by instrumenting the WFC loop in `layoutSVG` (`src/domain/render/layout-svg.ts:110-116`) or `Model.generate` (`src/domain/wfc/wfc-algorithm.ts:273-280`).
  - This gives an empirical upper bound on WFC steps vs. text length and grid size; feed those bounds into on-chain step budgeting.
