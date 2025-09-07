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

// MODIFIED: Accept optional fixedGridSize parameter
export function layoutSVG(storage: any, thoughtData: ThoughtData, rnd: () => number, fixedGridSize?: number): string {
    const str = thoughtData.thoughtStr ?? "";

    // MODIFIED: Use fixed grid size if provided, otherwise use original logic
    const n = fixedGridSize ?? (str.length > 5 ? Math.round(5 + (Math.sqrt(str.length - 5))) : str.length + 1);

    const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;

    const tilePx = 2;
    const cellSize = 1;
    const cellGap = 0//remap(0, 0.9, rnd(), 2);

    const gridW = n * cellSize + (n - 1) * cellGap;
    const gridH = n * cellSize + (n - 1) * cellGap;

    const padding = Math.round(gridW / 8);

    const WIDTH = gridW + 2 * padding;
    const HEIGHT = gridH + 2 * padding;

    const opacity = remap(0.1, 1, rnd(), 1);
    const filterFreq = remap(0.1, 1, rnd(), 1);
    const filterScale = remap(0.1, 0.9, rnd(), 1);

    console.log(`n=${n}`, `cellGap=${cellGap}`, `opacity=${opacity}`, `filterFreq=${filterFreq}`, `filterScale=${filterScale}`);

    const canvasBg = { r: remap(0, 255, rnd(), 1), g: remap(0, 255, rnd(), 1), b: remap(0, 255, rnd(), 1), a: 255 };

    const sampleBuf = rectsToPixels(thoughtData, tilePx);

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

    const groups = iterationsToRectBodies(frames, cfg.outputWidth, cfg.outputHeight, cellSize, cellGap, opacity);

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

    <rect id="background" width="100%" height="100%" fill="${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}"/>
    <g id="blend-stack"  
    transform="translate(${(WIDTH - gridW) / 2} , ${(HEIGHT - gridH) / 2}) "
    style="isolation:isolate">
        ${collapseSVG(groups)}
    </g>

</svg>`;
}


// rotate(${ remap(0, 360, rnd(), 0)}, ${ gridW / 2 } ${ gridH / 2 })
// scale(${ remap(0.5, 1.5, rnd(), 1)})


// <g id="THOUGHT-literal" transform = "translate(${padding},${HEIGHT - padding})" >
//     ${ renderText(thoughtData) }
// </g>


