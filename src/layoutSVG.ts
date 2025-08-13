import { rectsToPixels } from "./Helpers/BufferTrans";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { OverlappingModel } from "./WFC/WFCAlgorithm";
import { patternPreview, outputPreview } from "./Helpers/preview";
import { framesToRectGroups, buildCumulativeDisplaySVG, buildCumulativeOpacitySVG } from "./Helpers/BufferTrans";
import type { RGBA } from "./WFC/AnalyzeForWFC";
import { renderText } from "./Helpers/BufferTrans"; 1


export function layoutSVG(storage: any, thoughtData: ThoughtData, rnd: () => number): string {
    const WIDTH = 800;
    const HEIGHT = 800;
    const padding = WIDTH * 0.1;
    const innerWidth = WIDTH - padding * 2;
    const innerHeight = HEIGHT - padding * 2;


    const str = thoughtData.thoughtStr ?? "";
    const n = Math.round(Math.sqrt(str.length)) + 8;
    const { wordMaxLength: srcWidth, wordCount: srcHeight } = thoughtData;

    const tilePx = 2;
    const cellSize = Math.round(Math.min(innerWidth, innerHeight) / n);


    const sampleBuf = rectsToPixels(thoughtData, tilePx);

    const WFCcfg = {
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
    const model = new OverlappingModel(WFCcfg);
    model.initialize()
    model.clear();

    const wfcOutput = new Uint8ClampedArray(n * n * 4);
    const frames: Uint8ClampedArray[] = [];


    while (!model.isGenerationComplete()) {
        model.iterate(1, rnd);
        model.graphics(wfcOutput);
        outputPreview(wfcOutput, WFCcfg.outputWidth, WFCcfg.outputHeight);
        frames.push(new Uint8ClampedArray(wfcOutput));
        console.log(frames.length, "frames generated");
    }

    const patternsSVG = patternPreview(model);
    storage.pattern = patternsSVG;


    function collapse() {
        const result = model.iterate(10, rnd);
        model.graphics(wfcOutput);

        outputPreview(wfcOutput, WFCcfg.outputWidth, WFCcfg.outputHeight);

        if (!model.isGenerationComplete()) {
            requestAnimationFrame(collapse);
        }
        if (model.isGenerationComplete()) {
            console.log("Model generation complete");
        }
        if (result === false) {
            console.log("Model encountered a contradiction");
        }
    }

    // collapse();


    // buildCumulativeDisplaySVG(groups, 1)
    //   ${ buildCumulativeOpacitySVG(groups,1) }


    // const rects = pixelsToRects(wfcOutput, WFCcfg.outputWidth, WFCcfg.outputHeight);
    // const rectSVG = pixelsToRectSVG(rects, cellSize, padding, padding);
    const groups = framesToRectGroups(frames, WFCcfg.outputWidth, WFCcfg.outputHeight, cellSize);


    return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"
         xmlns="http://www.w3.org/2000/svg"
         style="background:#fff; isolation:isolate">
<g id="blend-stack" transform="translate(${padding},${padding})" style="isolation:isolate">
    ${buildCumulativeDisplaySVG(groups, 1)}
</g>
      ${renderText(thoughtData, HEIGHT, padding)}
    </svg>`;
}

