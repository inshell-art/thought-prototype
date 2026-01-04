# thought-look-svg src/ tech spec

## purpose
Generate an animated SVG "thought" visualization from user input. The input text is turned into a colored grid, then expanded with a Wave Function Collapse (WFC) pass to produce iterative frames that are animated inside the SVG. The app is a Vite + TS browser app (no React in the active entrypoint).

## entrypoint and runtime flow
- `src/main.ts` is the active entrypoint.
- DOM contract (required element IDs):
  - `#input-box` (text input)
  - `#btn-save-svg` (button)
  - `#THOUGHT-canvas` (container for generated SVG)
  - `#wfc-output-preview` (canvas)
  - `#source-preview` (container for SVG preview)
  - `#pattern-preview` (container for SVG preview)
  - `#svg-code` (element that shows raw SVG text)
- Input triggers:
  - Pressing Enter or Space triggers a full render.
  - Deleting across a whitespace boundary or deleting a space also triggers a render (tracked via `input` event and previous caret/value snapshots).

## data model
- `ThoughtData` in `src/WFC/AnalyzeForWFC.ts`
  - `thoughtStr`: original input
  - `chars`: array of `{ ch, x, y, charCol }`
  - `wordMaxLength`: max line/word length
  - `wordCount`: number of rows (words/lines)
  - `palette`: currently unused placeholder
- `frameProps` in `src/BufferTrans.ts`
  - `uint8ClampedArray`: RGBA buffer for a WFC frame
  - `entropies`, `sumsOfOnes`: per-cell diagnostics from the WFC model

## pipeline (main.ts -> layoutSVG.ts)
1. **Seeded randomness**
   - `PRNG(token_id + thought + timing)` gives deterministic random values per render.
2. **Analyze input**
   - `AnalyzeForWFC(thought, rnd)` splits on spaces/newlines and assigns a random color per unique character.
   - Spaces are treated as visible (white) rather than transparent.
3. **Create sample buffer**
   - `rectsToPixels(thoughtData, tilePx=2)` builds a small RGBA sample image.
4. **Configure WFC**
   - `OverlappingModel` is created with `N=2`, periodic input/output, symmetry=8, ground=0.
   - Output resolution is `n x n`, where:
     - `n = round(5 + sqrt(len-5))` if length > 5
     - `n = len + 1` otherwise
5. **Iterate WFC**
   - The model is iterated until `isGenerationComplete()` is true.
   - Each iteration frame (RGBA output + entropies + sumsOfOnes) is saved.
6. **Render SVG**
   - `iterationsToRectBodies` turns each frame into a set of `<rect>` elements.
   - `collapseSVG` wraps frames in `<g>` elements and reveals them over time using a shared SVG `animate` timeline (10s loop).
   - `gridFilter` creates per-frame `feTurbulence` filters for wobble/distortion.
   - SVG viewBox is a 10x10 "canvas" with 10% padding and a square layout.

## WFC algorithm (src/WFC/WFCAlgorithm.ts)
- Classic overlapping model implementation with entropy-based observation and constraint propagation.
- Builds a palette of unique RGBA colors from the sample buffer.
- Generates pattern tiles by extracting NxN neighborhoods and their symmetries.
- Stores per-cell `wave`, `compatible`, `entropies`, and `sumsOfOnes`.
- `graphics()` renders:
  - Complete output: exact tiles.
  - Incomplete output: average of possible tiles (soft, blended colors).

## rendering helpers (src/BufferTrans.ts)
- `rectsToPixels`: converts `ThoughtData` to a flat RGBA buffer.
- `iterationsToRectBodies`: creates SVG rects per frame, tagging each with `data-status` = `Collapsed` or `Superposition`.
- `collapseSVG`: animates frames by toggling `display` in time.
- `gridFilter`: per-frame turbulence + displacement map.
- `rgbaToHex`: helper for SVG colors (includes alpha).

## preview + export (src/Helpers)
- `preview.ts`
  - `charSrcPreview`: SVG showing the input grid with colors.
  - `outputPreview`: paints WFC output to a canvas and scales with pixelated rendering.
  - `patternPreview`: SVG showing all WFC pattern tiles.
  - `computeN` + `simpleGridSVG`: helper utilities (not wired in main.ts).
- `DownloadSVG.ts`: serializes the generated SVG and downloads it as `thought.svg`.
- `PRNG.ts`: Mulberry-32 PRNG with a hash seed and `remap()` helper.
- `Grain.ts`: returns an SVG filter string (currently unused).

## styles (src/style.css)
- `THOUGHT-canvas` is a square, 80vmin container with black background.
- `#input-box` is centered and large, with minimal line height.
- Preview panel styles for source, output, and pattern previews.

## legacy/experimental React code (src/ccc)
These files appear to be an older React-based prototype and are not referenced by `src/main.ts`.
- `WFCGenerate.ts` expects `OverlappingModel` to accept a config object, but the current class requires explicit arguments.
- `SourceDataForWFC.ts` expects `ThoughtData` fields that no longer exist (`maxLength`, `words`, `thoughtLength`).
- `ThoughtCanvas.tsx` imports `../Analyze&Preview/ImagePreview`, which is not present in `src/`.
If this directory is still needed, it likely needs updates to match the current data model and WFC API.

