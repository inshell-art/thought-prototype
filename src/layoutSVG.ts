import { gridFilter, rectsToPixels } from "./BufferTrans";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { OverlappingModel } from "./WFC/WFCAlgorithm";
import { patternPreview, outputPreview } from "./Helpers/preview";
import { iterationsToRectBodies, collapseSVG } from "./BufferTrans";
import { renderText } from "./BufferTrans";
import type { WFCCfgProps } from "./WFC/WFCAlgorithm";
import type { frameProps } from "./BufferTrans";
import { rgbaToHex } from "./BufferTrans";
import { remap } from "./Helpers/PRNG"
// pangpang is new actually.

export function gridMetrics(n: number) {
    const WIDTH = CANVAS, HEIGHT = CANVAS;
    const padding = WIDTH * PADDING_FRAC;
    const inner = WIDTH - 2 * padding;

    const step = inner / n;              // slot width
    const gapBetween = step * GAP_FRAC;  // gap between neighbors
    const inset = gapBetween / 2;        // equal margin around each rect

    // Slots (outer frame of the grid)
    const tx0 = (WIDTH - inner) / 2;
    const ty0 = (HEIGHT - inner) / 2;

    // Cells (actual rect block used by WFC)
    const cellSize = step - gapBetween;
    const txCells = tx0 + inset;
    const tyCells = ty0 + inset;
    return { WIDTH, HEIGHT, inner, step, gapBetween, inset, cellSize, tx0, ty0, txCells, tyCells };
}


export function layoutSVG(storage: any, thoughtData: ThoughtData, rnd: () => number, fixedGridSize?: number): string {
    const str = thoughtData.thoughtStr ?? "";

    const CANVAS = 10;
    const PADDING_FRAC = 0.10;
    const GAP_FRAC = remap(0, 1, rnd(), 1); // fraction of cell size

    const n = fixedGridSize ?? (str.length > 5 ? Math.round(5 + (Math.sqrt(str.length - 5))) : str.length + 1);

    const opacity = remap(0.1, 1, rnd(), 1);
    const filterFreq = remap(0.1, 1, rnd(), 1);
    const filterScale = remap(0.1, 1, rnd(), 1);

    const WIDTH = CANVAS;
    const HEIGHT = CANVAS;

    const padding = WIDTH * PADDING_FRAC;  // 10% of canvas width
    const inner = WIDTH - 2 * padding;

    const step = inner / n;                // ← your “cell size” by requirement #3
    const gapBetween = step * GAP_FRAC;       // absolute gap between cells
    const inset = gapBetween / 2;
    const cellSize = step - gapBetween;
    const tx = (WIDTH - inner) / 2 + inset;
    const ty = (HEIGHT - inner) / 2 + inset;

    const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;
    const tilePx = 2;
    const sampleBuf = rectsToPixels(thoughtData, tilePx);


    console.log(`n=${n}`, `step=${step}`, `cellGap=${gapBetween}`, `opacity=${opacity}`, `filterFreq=${filterFreq}`, `filterScale=${filterScale}`);
    // const canvasBg = { r: remap(0, 255, rnd(), 1), g: remap(0, 255, rnd(), 1), b: remap(0, 255, rnd(), 1), a: 255 };


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

    const wfcOutput = new Uint8ClampedArray(n * n * 4);

    const frames: frameProps[] = [];

    while (!model.isGenerationComplete()) {
        model.iterate(1, rnd);
        model.graphics(wfcOutput);
        const entropies = Float32Array.from(model.getEntropies());
        const sumsOfOnes = Uint16Array.from(model.getSumsOfOnes());
        frames.push({ uint8ClampedArray: new Uint8ClampedArray(wfcOutput), entropies: entropies, sumsOfOnes: sumsOfOnes });

        outputPreview(wfcOutput, cfg.outputWidth, cfg.outputHeight);
    }
    console.log("WFC generation complete");

    const patternsSVG = patternPreview(model);
    storage.pattern = patternsSVG;

    const groups = iterationsToRectBodies(frames, cfg.outputWidth, cfg.outputHeight, cellSize, gapBetween, opacity);

    return `
<svg data-THOUGHT="${storage.thoughtStr}" 
    width="100%" height="100%" viewBox="0 0 ${WIDTH} ${HEIGHT}" 
    preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">

    <defs>
        ${gridFilter(rnd, groups, filterFreq, filterScale)}
    </defs>

    <!-- SMIL clock -->
    <rect id="clock" width="0" height="0" fill="none">
        <animate id="timeline" 
            attributeName="x" from="0" to="0" 
            dur="10s" 
            begin="0s;timeline.end"/>
    </rect>

    
    <g id="blend-stack"  
    transform="translate(${tx} , ${ty}) "
    style="isolation:isolate">
        ${collapseSVG(groups)}
    </g>

</svg>`;
}

// <rect id="background" width = "100%" height = "100%" fill = "${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}" />

// rotate(${ remap(0, 360, rnd(), 0)}, ${ gridW / 2 } ${ gridH / 2 })
// scale(${ remap(0.5, 1.5, rnd(), 1)})


// <g id="THOUGHT-literal" transform = "translate(${padding},${HEIGHT - padding})" >
//     ${ renderText(thoughtData) }
// </g>


