import type { ThoughtData } from "../sample/analyze-for-wfc";
import { OverlappingModel } from "../wfc/wfc-algorithm";
import type { WFCCfgProps } from "../wfc/wfc-algorithm";
import { rectsToPixels } from "./pixels";
import { collapseSVG, iterationsToRectBodies } from "./frames";
import type { frameProps } from "./frames";
import { gridFilter } from "./filters";
import { rgbaToHex } from "./colors";
import { remap } from "../../helpers/prng";

export function layoutSVG(
    storage: any,
    thoughtData: ThoughtData,
    wfcRnd: () => number,
    visualRnd: () => number,
    fixedGridSize?: number
): string {
    const str = thoughtData.thoughtStr ?? "";

    const CANVAS = 10;
    const OUTPUT_SIZE = "100%";
    const PADDING_FRAC = 0.10;
    const GAP_FRAC = 0; //remap(0, 1, rnd(), 1); // fraction of cell size

    const n = fixedGridSize ?? (str.length > 5 ? Math.round(5 + (Math.sqrt(str.length - 5))) : str.length + 1);

    const opacity = remap(0.1, 1, visualRnd(), 1);
    const canvasScale = CANVAS / 10;
    const filterFreq = remap(0.1, 1, visualRnd(), 1) / canvasScale;
    const filterScale = remap(0.1, 1, visualRnd(), 1) * canvasScale;

    const WIDTH = CANVAS;
    const HEIGHT = CANVAS;
    const MAIN_FRAC = 1;
    const mainHeight = HEIGHT * MAIN_FRAC;
    const titleHeight = 0.4;
    const titleBottomOffset = 0.2;

    const padding = WIDTH * PADDING_FRAC;  // 10% of canvas width1
    const inner = WIDTH - 2 * padding;

    const step = inner / n;                // ← your “cell size” by requirement #3
    const gapBetween = step * GAP_FRAC;       // absolute gap between cells
    const inset = gapBetween / 2;
    const cellSize = step - gapBetween;
    const tx = (WIDTH - inner) / 2 + inset;
    const ty = (HEIGHT - inner) / 2 + inset;
    const mainScale = mainHeight / HEIGHT;
    const mainOffsetX = (WIDTH - WIDTH * mainScale) / 2;
    const mainOffsetY = 0;

    const titleX = padding;
    const titleY = HEIGHT - titleBottomOffset - titleHeight;
    const titleWidth = inner;

    const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;
    const tilePx = 2;
    const sampleBuf = rectsToPixels(thoughtData, tilePx);


    console.log(`THOUGHTString=${storage.thoughtStr}`, `n=${n}`, `step=${step}`, `cellGap=${gapBetween}`, `opacity=${opacity}`, `filterFreq=${filterFreq}`, `filterScale=${filterScale}`);
    const canvasBg = { r: 0, g: 0, b: 0, a: 255 };


    const cfg: WFCCfgProps = {
        data: sampleBuf,
        dataWidth: srcWidth * tilePx,
        dataHeight: srcHeight * tilePx,
        N: 2,
        outputWidth: n,  // This will now be consistent across all layers
        outputHeight: n, // This will now be consistent across all layers
        periodicInput: true,
        periodicOutput: true,
        symmetry: 8,
    }
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
    model.initialize()
    model.clear();

    storage.model = model;


    const wfcOutput = new Uint8ClampedArray(n * n * 4);
    const frames: frameProps[] = [];
    let blackHoleFrame: number | null = null;

    const pushFrame = () => {
        model.graphics(wfcOutput);
        frames.push({
            uint8ClampedArray: new Uint8ClampedArray(wfcOutput),
            entropies: Float32Array.from(model.getEntropies()),
            sumsOfOnes: Uint16Array.from(model.getSumsOfOnes()),
        });
        if (blackHoleFrame === null && model.getBlackHoleCell() !== null) {
            blackHoleFrame = frames.length - 1;
        }
    };

    while (!model.isGenerationComplete()) {
        const stepResult = model.iterate(1, wfcRnd);
        pushFrame();
        if (stepResult === false) {
            break;
        }
    }

    if (frames.length === 0) {
        pushFrame();
    }

    const lastFrame = frames[frames.length - 1];
    storage.wfcOutput = new Uint8ClampedArray(lastFrame.uint8ClampedArray);
    storage.x_count = cfg.outputWidth;
    storage.y_count = cfg.outputHeight;

    const frameBodies =
        iterationsToRectBodies(frames, cfg.outputWidth, cfg.outputHeight, cellSize, gapBetween, opacity);
    const frameStack = collapseSVG(frameBodies);

    console.log("WFC generation complete");

    const blackHoleCell = model.getBlackHoleCell();

    let blackHoleOverlay = "";
    if (blackHoleCell !== null) {
        const cx = blackHoleCell % cfg.outputWidth;
        const cy = Math.floor(blackHoleCell / cfg.outputWidth);
        const px = cx * step + inset;
        const py = cy * step + inset;
        const lastFilterIndex = Math.max(0, frameBodies.length - 1);
        const filterIndex = Math.min(
            blackHoleFrame ?? lastFilterIndex,
            lastFilterIndex
        );
        const filterAttr = frameBodies.length > 0 ? ` filter="url(#wobble-${filterIndex})"` : "";
        const begin = `${filterIndex / 10}s`;
        const setDisplay = frameBodies.length > 0
            ? `<set attributeName="display" to="inline" begin="timeline.begin+${begin}" fill="freeze"/>`
            : "";
        blackHoleOverlay = `
<g id="black-hole-cell" style="display:none; mix-blend-mode:overlay"${filterAttr}>
  <rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" fill="#000000"/>
  ${setDisplay}
</g>`;
    }

    const titleChars = Array.from(str.replace(/\n/g, " "));
    const totalTitleChars = titleChars.length;
    let titleCols = Math.max(1, totalTitleChars);
    let titleCellSize = titleCols > 0 ? Math.min(titleWidth / titleCols, titleHeight) : titleHeight;

    if (totalTitleChars > 0) {
        for (let rows = 1; rows <= totalTitleChars; rows += 1) {
            const cols = Math.ceil(totalTitleChars / rows);
            const cellSize = Math.min(titleWidth / cols, titleHeight / rows);
            if (cellSize > titleCellSize) {
                titleCellSize = cellSize;
                titleCols = cols;
            }
        }
    }

    const titleFontSize = titleCellSize * 0.6;
    const titleColorByChar = new Map<string, { r: number; g: number; b: number; a: number }>();
    for (const { ch, charCol } of thoughtData.chars) {
        if (!titleColorByChar.has(ch)) {
            titleColorByChar.set(ch, charCol);
        }
    }
    const titleRects = titleChars
        .map((ch, idx) => {
            if (ch === " ") {
                return "";
            }
            const color = titleColorByChar.get(ch) ?? { r: 255, g: 255, b: 255, a: 255 };
            const row = Math.floor(idx / titleCols);
            const col = idx % titleCols;
            const px = titleX + col * titleCellSize;
            const py = titleY + row * titleCellSize;
            const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
            const textColor = luminance > 0.6 ? "#000000" : "#ffffff";
            const centerX = px + titleCellSize / 2;
            const centerY = py + titleCellSize / 2;
            const glyphMarkup = `<text x="${centerX}" y="${centerY}"
      font-family="monospace"
      font-size="${titleFontSize}"
      text-anchor="middle"
      dominant-baseline="central"
      fill="${textColor}">${ch}</text>`;
            return `
<rect x="${px}" y="${py}" width="${titleCellSize}" height="${titleCellSize}"
      fill="${rgbaToHex(color.r, color.g, color.b, color.a)}"/>
${glyphMarkup}`;
        })
        .join("");
    const titleGroup = `
<g id="title">
    ${titleRects}
</g>`.trim();

    return `
<svg data-THOUGHT="${storage.thoughtStr}" 
    width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${WIDTH} ${HEIGHT}" 
    preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">

    <!-- DISTORTION -->
    <defs>
        ${gridFilter(visualRnd, frameBodies, filterFreq, filterScale)}
    </defs>

    <!-- TIME -->
    <rect id="clock" width="0" height="0" fill="none">
        <animate id="timeline" 
            attributeName="x" from="0" to="0" 
            dur="10s" 
            begin="0s;timeline.end"/>
    </rect>

    <!-- VOID -->
    <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

    <!-- COLLAPSE -->
    <g id="main-area" transform="translate(${mainOffsetX} ${mainOffsetY}) scale(${mainScale})">
        <g id="Iterations"
        transform="translate(${tx} , ${ty}) "
        style="isolation:isolate">
            ${frameStack}
            ${blackHoleOverlay}
        </g>
    </g>

    ${titleGroup}

</svg>`;
}

// <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

// rotate(${ remap(0, 360, rnd(), 0)}, ${ gridW / 2 } ${ gridH / 2 })
// scale(${ remap(0.5, 1.5, rnd(), 1)})


// <g id="THOUGHT-literal" transform = "translate(${padding},${HEIGHT - padding})" >
//     ${ renderText(thoughtData) }
// </g>
