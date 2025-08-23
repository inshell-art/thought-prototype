import { cellDefinition, rectsToPixels } from "./Helpers/BufferTrans";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { OverlappingModel } from "./WFC/WFCAlgorithm";
import { patternPreview, outputPreview } from "./Helpers/preview";
import { iterationsToRectBodies, collapseSVG } from "./Helpers/BufferTrans";
import { renderText } from "./Helpers/BufferTrans";
import type { WFCCfgProps } from "./WFC/WFCAlgorithm";
import type { frameProps } from "./Helpers/BufferTrans";
import { rgbaToHex } from "./Helpers/BufferTrans";


export function layoutSVG(storage: any, thoughtData: ThoughtData, rnd: () => number): string {
    const str = thoughtData.thoughtStr ?? "";
    const n = Math.round(Math.sqrt(str.length)) + 3;
    const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;

    const tilePx = 2;
    const cellSize = 1;
    const padding = 1;
    const WIDTH = n * cellSize + padding * 2;
    const HEIGHT = n * cellSize + padding * 2;
    const canvasBg = { r: 255, g: 255, b: 255, a: 255 };

    const sampleBuf = rectsToPixels(thoughtData, tilePx, canvasBg);

    const cfg: WFCCfgProps = {
        data: sampleBuf,
        dataWidth: srcWidth * tilePx,
        dataHeight: srcHeight * tilePx,
        N: 2,
        outputWidth: n,
        outputHeight: n,
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

    const groups = iterationsToRectBodies(frames, cfg.outputWidth, cfg.outputHeight, cellSize);


    return `
<svg width="100%" height="100%" viewBox="0 0 ${WIDTH} ${HEIGHT}"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg" >

    <!-- Background isolated by top-level isolation -->
    <rect width="100%" height="100%" fill="${rgbaToHex(canvasBg.r, canvasBg.g, canvasBg.b, canvasBg.a)}"/>

    <!-- Cell definitions -->
      ${cellDefinition(cellSize)}

    <!-- SMIL clock -->
    <rect width="0" height="0" fill="none">
    <animate id="timeline" attributeName="x" from="0" to="0" 
    dur="${groups.length / 10}s" begin="0s;timeline.end"/>
    </rect>

<g id="blend-stack" transform="translate(${padding},${padding})" style="isolation:isolate">
    ${collapseSVG(groups)}
</g>
<g id="THOUGHT-literal" transform="translate(${padding},${HEIGHT - padding})">
    ${renderText(thoughtData)}
</g>

    </svg>`;
}


