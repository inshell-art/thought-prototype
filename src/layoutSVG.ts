
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { OverlappingModel } from "./WFC/WFCAlgorithm";
import type { WFCCfgProps } from "./WFC/WFCAlgorithm";
import { rectsToPixels, iterationsToRectBodies, collapseSVG, gridFilter, rgbaToHex } from "./BufferTrans";
import type { frameProps } from "./BufferTrans";
import { remap } from "./Helpers/PRNG";
import { charSrcPreview, patternPreview } from "./Helpers/preview";

const extractViewBox = (svg: string): string | null => {
    const match = svg.match(/viewBox="([^"]+)"/i);
    return match ? match[1] : null;
};

const extractSvgSize = (svg: string): { width: number; height: number } | null => {
    const widthMatch = svg.match(/width="([^"]+)"/i);
    const heightMatch = svg.match(/height="([^"]+)"/i);
    if (!widthMatch || !heightMatch) return null;
    const width = Number.parseFloat(widthMatch[1]);
    const height = Number.parseFloat(heightMatch[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
};

const stripOuterSvg = (svg: string): string =>
    svg.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");

const embedSvg = (
    svg: string,
    x: number,
    y: number,
    width: number,
    height: number,
): string => {
    const viewBox = extractViewBox(svg) ??
        (() => {
            const size = extractSvgSize(svg);
            return size ? `0 0 ${size.width} ${size.height}` : `0 0 ${width} ${height}`;
        })();
    const inner = stripOuterSvg(svg);
    return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
};

const escapeXml = (text: string): string =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

const clampLines = (text: string, maxChars: number, maxLines: number): string[] => {
    const rawLines = text.split("\n");
    const safeMaxChars = Math.max(1, maxChars);
    const safeMaxLines = Math.max(1, maxLines);
    const lines: string[] = [];

    for (const raw of rawLines) {
        if (lines.length >= safeMaxLines) break;
        if (raw.length <= safeMaxChars) {
            lines.push(raw);
        } else {
            const cut = Math.max(1, safeMaxChars - 3);
            lines.push(raw.slice(0, cut) + "...");
        }
    }

    if (rawLines.length > safeMaxLines && lines.length > 0) {
        const cut = Math.max(1, safeMaxChars - 3);
        lines[safeMaxLines - 1] = lines[safeMaxLines - 1].slice(0, cut) + "...";
        lines.length = safeMaxLines;
    }

    return lines.length ? lines : [""];
};

export function layoutSVG(storage: any, thoughtData: ThoughtData, rnd: () => number, fixedGridSize?: number): string {
    const str = thoughtData.thoughtStr ?? "";

    const CANVAS = 10;
    const PADDING_FRAC = 0.10;
    const GAP_FRAC = 0;//remap(0, 1, rnd(), 1); // fraction of cell size

    const n = fixedGridSize ?? (str.length > 5 ? Math.round(5 + (Math.sqrt(str.length - 5))) : str.length + 1);

    const opacity = remap(0.1, 1, rnd(), 1);
    const filterFreq = remap(0.1, 1, rnd(), 1);
    const filterScale = remap(0.1, 1, rnd(), 1);

    const WIDTH = CANVAS;
    const HEIGHT = CANVAS;
    const MAIN_FRAC = 0.92;
    const STRIP_FRAC = 1 - MAIN_FRAC;
    const mainHeight = HEIGHT * MAIN_FRAC;
    const stripHeight = HEIGHT * STRIP_FRAC;
    const panelWidth = WIDTH / 4;
    const panelHeight = stripHeight;
    const panelPad = Math.min(panelWidth, panelHeight) * 0.22;

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
    const stripY = mainHeight;

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
        ground: 0,
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
        cfg.symmetry,
        cfg.ground
    );
    model.initialize()
    model.clear();

    storage.model = model;


    const wfcOutput = new Uint8ClampedArray(n * n * 4);

    const frames: frameProps[] = [];

    while (!model.isGenerationComplete()) {
        model.iterate(1, rnd);
        model.graphics(wfcOutput);
        storage.wfcOutput = wfcOutput;
        storage.x_count = cfg.outputWidth;
        storage.y_count = cfg.outputHeight;
        const entropies = Float32Array.from(model.getEntropies());
        const sumsOfOnes = Uint16Array.from(model.getSumsOfOnes());
        frames.push({ uint8ClampedArray: new Uint8ClampedArray(wfcOutput), entropies: entropies, sumsOfOnes: sumsOfOnes });


    }
    console.log("WFC generation complete");



    const groups = iterationsToRectBodies(frames, cfg.outputWidth, cfg.outputHeight, cellSize, gapBetween, opacity);

    const panelInnerW = panelWidth - panelPad * 2;
    const panelInnerH = panelHeight - panelPad * 2;
    const legendScale = 0.4;
    const legendInnerW = panelInnerW * legendScale;
    const legendInnerH = panelInnerH * legendScale;
    const legendOffsetX = panelPad + (panelInnerW - legendInnerW) / 2;
    const legendOffsetY = panelPad + (panelInnerH - legendInnerH) / 2;

    const sourceSvg = charSrcPreview(thoughtData);
    const patternSvg = patternPreview(model);

    const textFontSize = Math.max(0.05, legendInnerH * 0.25);
    const lineHeight = textFontSize * 1.2;
    const maxChars = Math.floor(legendInnerW / (textFontSize * 0.6));
    const maxLines = Math.floor(legendInnerH / lineHeight);
    const lines = clampLines(str, maxChars, maxLines);
    const textX = legendOffsetX;
    const textY = legendOffsetY + textFontSize;
    const textSpans = lines
        .map((line, index) =>
            `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
        )
        .join("");

    const textPanelInner = `
<text x="${textX}" y="${textY}"
      font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
      font-size="${textFontSize}"
      fill="#ffffff" fill-opacity="0.8"
      dominant-baseline="hanging"
      xml:space="preserve">${textSpans}</text>`.trim();

    const sourcePanelInner = embedSvg(sourceSvg, legendOffsetX, legendOffsetY, legendInnerW, legendInnerH);

    const lastFrame = frames[frames.length - 1];
    const finalGridSize = Math.min(legendInnerW, legendInnerH);
    const finalCellSize = finalGridSize / Math.max(1, cfg.outputWidth);
    const finalRects = lastFrame
        ? iterationsToRectBodies([lastFrame], cfg.outputWidth, cfg.outputHeight, finalCellSize, 0, 1)[0]
        : "";
    const finalOffsetX = legendOffsetX + (legendInnerW - finalGridSize) / 2;
    const finalOffsetY = legendOffsetY + (legendInnerH - finalGridSize) / 2;
    const finalPanelInner = `<g transform="translate(${finalOffsetX} ${finalOffsetY})">${finalRects}</g>`;

    const patternPanelInner = embedSvg(patternSvg, legendOffsetX, legendOffsetY, legendInnerW, legendInnerH);

    const panelFrame = (id: string, x: number, inner: string): string => `
<g id="${id}" transform="translate(${x} ${stripY})">
    <rect width="${panelWidth}" height="${panelHeight}"
        fill="none" stroke="#ffffff" stroke-opacity="0.2"
        stroke-width="0.02" vector-effect="non-scaling-stroke"/>
    ${inner}
</g>`.trim();

    const bottomStrip = `
<g id="bottom-strip">
    ${panelFrame("panel-text", 0, textPanelInner)}
    ${panelFrame("panel-source", panelWidth, sourcePanelInner)}
    ${panelFrame("panel-output", panelWidth * 2, finalPanelInner)}
    ${panelFrame("panel-patterns", panelWidth * 3, patternPanelInner)}
</g>`.trim();

    return `
<svg data-THOUGHT="${storage.thoughtStr}" 
    width="100%" height="100%" viewBox="0 0 ${WIDTH} ${HEIGHT}" 
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
    <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

    <!-- COLLAPSE -->
    <g id="main-area" transform="translate(${mainOffsetX} ${mainOffsetY}) scale(${mainScale})">
        <g id="Iterations"
        transform="translate(${tx} , ${ty}) "
        style="isolation:isolate">
            ${collapseSVG(groups)}
        </g>
    </g>

    <!-- STRIP -->
    ${bottomStrip}

</svg>`;
}

// <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

// rotate(${ remap(0, 360, rnd(), 0)}, ${ gridW / 2 } ${ gridH / 2 })
// scale(${ remap(0.5, 1.5, rnd(), 1)})


// <g id="THOUGHT-literal" transform = "translate(${padding},${HEIGHT - padding})" >
//     ${ renderText(thoughtData) }
// </g>
