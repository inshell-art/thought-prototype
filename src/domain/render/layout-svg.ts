import type { ThoughtData } from "../sample/analyze-for-wfc";
import { OverlappingModel } from "../wfc/wfc-algorithm";
import type { WFCCfgProps } from "../wfc/wfc-algorithm";
import { rectsToPixels } from "./pixels";
import { collapseSVG, iterationsToRectBodies } from "./frames";
import type { frameProps } from "./frames";
import { gridFilter } from "./filters";
import { rgbaToHex } from "./colors";
import type { RNG32 } from "../../helpers/prng";
import { remapFixed } from "../../helpers/prng";
import { ceilDiv, formatFixed, fpDiv, fpMul, isqrtRound, FP_SCALE } from "../../helpers/fixed-point";

export function layoutSVG(
    storage: any,
    thoughtData: ThoughtData,
    wfcRnd: RNG32,
    visualRnd: RNG32,
    fixedGridSize?: number
): string {
    const str = thoughtData.thoughtStr ?? "";

    const CANVAS = 10;
    const OUTPUT_SIZE = "100%";
    const GAP_FRAC_FP = 0;
    const PADDING_FRAC_FP = 100;
    const OPACITY_MIN_FP = 100;
    const OPACITY_MAX_FP = 1000;

    const n = fixedGridSize ?? (str.length > 5 ? 5 + isqrtRound(str.length - 5) : str.length + 1);

    const opacity = remapFixed(OPACITY_MIN_FP, OPACITY_MAX_FP, visualRnd);
    const canvasScaleFp = Math.floor((CANVAS * FP_SCALE) / 10);
    const filterFreq = fpDiv(remapFixed(OPACITY_MIN_FP, OPACITY_MAX_FP, visualRnd), canvasScaleFp);
    const filterScale = fpMul(remapFixed(OPACITY_MIN_FP, OPACITY_MAX_FP, visualRnd), canvasScaleFp);

    const WIDTH_FP = CANVAS * FP_SCALE;
    const HEIGHT_FP = CANVAS * FP_SCALE;
    const MAIN_FRAC_FP = FP_SCALE;
    const mainHeight = fpMul(HEIGHT_FP, MAIN_FRAC_FP);
    const titleHeight = 400;
    const titleBottomOffset = 200;

    const padding = fpMul(WIDTH_FP, PADDING_FRAC_FP);
    const inner = WIDTH_FP - 2 * padding;

    const step = Math.floor(inner / n);
    const gapBetween = fpMul(step, GAP_FRAC_FP);
    const inset = Math.floor(gapBetween / 2);
    const cellSize = step - gapBetween;
    const tx = Math.floor((WIDTH_FP - inner) / 2) + inset;
    const ty = Math.floor((HEIGHT_FP - inner) / 2) + inset;
    const mainScale = fpDiv(mainHeight, HEIGHT_FP);
    const mainOffsetX = Math.floor((WIDTH_FP - fpMul(WIDTH_FP, mainScale)) / 2);
    const mainOffsetY = 0;

    const titleX = padding;
    const titleY = HEIGHT_FP - titleBottomOffset - titleHeight;
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
        const begin = `${formatFixed(filterIndex, 1)}s`;
        const setDisplay = frameBodies.length > 0
            ? `<set attributeName="display" to="inline" begin="timeline.begin+${begin}" fill="freeze"/>`
            : "";
        blackHoleOverlay = `
<g id="black-hole-cell" style="display:none; mix-blend-mode:overlay"${filterAttr}>
  <rect x="${formatFixed(px, 3)}" y="${formatFixed(py, 3)}" width="${formatFixed(cellSize, 3)}" height="${formatFixed(cellSize, 3)}" fill="#000000"/>
  ${setDisplay}
</g>`;
    }

    const titleChars = Array.from(str.replace(/\n/g, " "));
    const totalTitleChars = titleChars.length;
    let titleCols = Math.max(1, totalTitleChars);
    let titleCellSize = titleCols > 0 ? Math.min(Math.floor(titleWidth / titleCols), titleHeight) : titleHeight;

    if (totalTitleChars > 0) {
        for (let rows = 1; rows <= totalTitleChars; rows += 1) {
            const cols = ceilDiv(totalTitleChars, rows);
            const cellSize = Math.min(Math.floor(titleWidth / cols), Math.floor(titleHeight / rows));
            if (cellSize > titleCellSize) {
                titleCellSize = cellSize;
                titleCols = cols;
            }
        }
    }

    const titleFontSize = Math.floor(titleCellSize * 6 / 10);
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
            const luminance = 2126 * color.r + 7152 * color.g + 722 * color.b;
            const textColor = luminance > 1_530_000 ? "#000000" : "#ffffff";
            const centerX = px + Math.floor(titleCellSize / 2);
            const centerY = py + Math.floor(titleCellSize / 2);
            const glyphMarkup = `<text x="${formatFixed(centerX, 3)}" y="${formatFixed(centerY, 3)}"
      font-family="monospace"
      font-size="${formatFixed(titleFontSize, 3)}"
      text-anchor="middle"
      dominant-baseline="central"
      fill="${textColor}">${ch}</text>`;
            return `
<rect x="${formatFixed(px, 3)}" y="${formatFixed(py, 3)}" width="${formatFixed(titleCellSize, 3)}" height="${formatFixed(titleCellSize, 3)}"
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
    width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${CANVAS} ${CANVAS}" 
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
    <g id="main-area" transform="translate(${formatFixed(mainOffsetX, 3)} ${formatFixed(mainOffsetY, 3)}) scale(${formatFixed(mainScale, 3)})">
        <g id="Iterations"
        transform="translate(${formatFixed(tx, 3)} , ${formatFixed(ty, 3)}) "
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
