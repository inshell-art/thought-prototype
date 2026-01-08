import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { OverlappingModel } from "./WFC/WFCAlgorithm";
import type { WFCCfgProps } from "./WFC/WFCAlgorithm";
import {
  rectsToPixels,
  iterationsToRectBodies,
  collapseSVG,
  gridFilter,
} from "./BufferTrans";
import type { frameProps } from "./BufferTrans";
import { rgbaToHex } from "./BufferTrans";
import { remap } from "./Helpers/PRNG";

export function layoutSVG(
  storage: any,
  thoughtData: ThoughtData,
  rnd: () => number,
  fixedGridSize?: number
): string {
  const str = thoughtData.thoughtStr ?? "";

  const CANVAS_UNITS = 10;
  const OUTPUT_SIZE = 800;
  const PADDING_FRAC = 0.1;
  const GAP_FRAC = 0; //remap(0, 1, rnd(), 1); // fraction of cell size

  // Grid size is derived from text length to keep visual density roughly stable.
  const n =
    fixedGridSize ??
    (str.length > 5
      ? Math.round(5 + Math.sqrt(str.length - 5))
      : str.length + 1);

  // Randomized visual tuning for opacity + distortion filter intensity.
  const opacity = remap(0.1, 1, rnd(), 1);
  const canvasScale = CANVAS_UNITS / 10;
  const filterFreq = remap(0.1, 1, rnd(), 1) / canvasScale;
  const filterScale = remap(0.1, 1, rnd(), 1) * canvasScale;

  const WIDTH = CANVAS_UNITS;
  const HEIGHT = CANVAS_UNITS;

  const padding = WIDTH * PADDING_FRAC; // 10% of canvas width1
  const inner = WIDTH - 2 * padding;

  const step = inner / n; // ← your “cell size” by requirement #3
  const gapBetween = step * GAP_FRAC; // absolute gap between cells
  const inset = gapBetween / 2;
  const cellSize = step - gapBetween;
  const tx = (WIDTH - inner) / 2 + inset;
  const ty = (HEIGHT - inner) / 2 + inset;

  const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;
  const tilePx = 2;
  // Convert character grid into a small pixel sample for WFC input.
  const sampleBuf = rectsToPixels(thoughtData, tilePx);

  console.log(
    `THOUGHTString=${storage.thoughtStr}`,
    `n=${n}`,
    `step=${step}`,
    `cellGap=${gapBetween}`,
    `opacity=${opacity}`,
    `filterFreq=${filterFreq}`,
    `filterScale=${filterScale}`
  );
  const canvasBg = { r: 0, g: 0, b: 0, a: 255 };

  // WFC settings mirror the original JS renderer: 2x2 patterns, periodic wrap.
  const cfg: WFCCfgProps = {
    data: sampleBuf,
    dataWidth: srcWidth * tilePx,
    dataHeight: srcHeight * tilePx,
    N: 2,
    outputWidth: n, // This will now be consistent across all layers
    outputHeight: n, // This will now be consistent across all layers
    periodicInput: true,
    periodicOutput: true,
    symmetry: 8,
  };
  storage.cfg = cfg;
  const model = new OverlappingModel(
    cfg.data,
    cfg.dataWidth,
    cfg.dataHeight,
    cfg.N,
    cfg.outputWidth,
    cfg.outputHeight,
    cfg.periodicInput,
    cfg.periodicOutput,
    cfg.symmetry
  );
  model.initialize();
  model.clear();

  storage.model = model;

  const wfcOutput = new Uint8ClampedArray(n * n * 4);

  const frames: frameProps[] = [];
  let contradictionCell: number | null = null;
  let contradictionFrame = -1;

  // Step the solver and capture intermediate frames for the SVG timeline.
  while (!model.isGenerationComplete()) {
    const stepResult = model.iterate(1, rnd);
    if (stepResult === false) {
      contradictionCell = model.getContradictionCell();
      contradictionFrame = frames.length;
      break;
    }
    model.graphics(wfcOutput);
    storage.wfcOutput = wfcOutput;
    storage.x_count = cfg.outputWidth;
    storage.y_count = cfg.outputHeight;
    const entropies = Float32Array.from(model.getEntropies());
    const sumsOfOnes = Uint16Array.from(model.getSumsOfOnes());
    frames.push({
      uint8ClampedArray: new Uint8ClampedArray(wfcOutput),
      entropies: entropies,
      sumsOfOnes: sumsOfOnes,
    });
  }
  console.log("WFC generation complete");

  // Turn each frame into rects, then collapse into an animated SVG sequence.
  const groups = iterationsToRectBodies(
    frames,
    cfg.outputWidth,
    cfg.outputHeight,
    cellSize,
    gapBetween,
    opacity
  );

  let contradictionOverlay = "";
  if (contradictionCell !== null) {
    const step = cellSize + gapBetween;
    const inset = gapBetween / 2;
    const cx = contradictionCell % cfg.outputWidth;
    const cy = Math.floor(contradictionCell / cfg.outputWidth);
    const px = cx * step + inset;
    const py = cy * step + inset;
    const begin = contradictionFrame >= 0 ? contradictionFrame / 10 : 0;

    contradictionOverlay = `
<g id="contradiction-cell" style="display:none">
  <rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" fill="#000000"/>
  <set attributeName="display" to="inline" begin="timeline.begin+${begin}s" fill="freeze"/>
</g>`;
  }

  return `
<svg data-THOUGHT="${storage.thoughtStr}" 
    width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${WIDTH} ${HEIGHT}" 
    preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">

    <!-- DISTORTION -->
    <defs>
        ${gridFilter(rnd, groups, filterFreq, filterScale)}
    </defs>

    <!-- TIME -->
    <rect id="clock" width="0" height="0" fill="none">
        <animate id="timeline" 
            attributeName="x" from="0" to="0" 
            dur="10s" 
            begin="0s;timeline.end"/>
    </rect>

    <!-- VOID -->
    <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(
      canvasBg.r,
      canvasBg.g,
      canvasBg.b,
      canvasBg.a
    )}" />

    <!-- COLLAPSE -->
    <g id="Iterations"  
    transform="translate(${tx} , ${ty}) "
    style="isolation:isolate">
        ${collapseSVG(groups)}
        ${contradictionOverlay}
    </g>

</svg>`;
}

// <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

// rotate(${ remap(0, 360, rnd(), 0)}, ${ gridW / 2 } ${ gridH / 2 })
// scale(${ remap(0.5, 1.5, rnd(), 1)})

// <g id="THOUGHT-literal" transform = "translate(${padding},${HEIGHT - padding})" >
//     ${ renderText(thoughtData) }
// </g>
