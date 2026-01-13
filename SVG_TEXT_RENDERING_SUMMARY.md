# SVG Text Rendering Summary

## Goal
Ensure the SVG looks identical in any environment (OS/browser), without relying on local fonts.

## Current Frontend Approach
- The browser loads a bundled font file (`public/fonts/IBMPlexMono-Regular.ttf`) at generation time.
- Title glyphs are converted to `<path>` geometry in the generated SVG.
- Result: consistent rendering across environments because the SVG no longer depends on fonts at display time.
- Note: this still requires the font file to be available at generation time.

## Contract Constraint
- A contract cannot load a font file or perform font parsing.
- Therefore, it cannot convert `<text>` to `<path>` unless the glyph geometry is already embedded in the contract logic.

## Options (for identical output)
1) **On-chain glyph table (deterministic)**  
   - Bake glyph outlines in the contract and emit `<path>`s directly.  
   - Deterministic across environments.  
   - Large footprint; needs a bounded character set.

2) **On-chain `<text>` (not deterministic)**  
   - Emit `<text font-family="monospace">` and let viewers choose system fonts.  
   - Rendering varies by OS/browser and is not pixel-consistent.

3) **Frontend post-process (deterministic, but not raw on-chain)**  
   - Contract emits `<text>`, frontend converts to `<path>` using bundled font.  
   - Deterministic for display, but the SVG is no longer the raw contract output.

## ASCII-only Approach (if using on-chain glyph table)
- ASCII printable range: 32..126 (basic Latin letters, digits, punctuation).
- Does **not** include most accented characters or non-Latin scripts.
- Not "all languages"; only English-ish coverage unless a larger Unicode subset is added.

## Decision Implication
If the SVG must be identical everywhere *and the contract output must be the final artifact*, the only viable path is:
- precomputed glyph paths embedded in the contract (option 1), with a defined character set.

## Current decision
- Use contract output with `<text font-family="monospace">` and accept viewer-dependent rendering.
