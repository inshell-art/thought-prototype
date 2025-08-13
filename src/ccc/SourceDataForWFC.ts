import type { ThoughtData } from "../WFC/AnalyzeForWFC";

export type SourceDataForWFCProps = {
    analyze: ThoughtData,
    mode: "words" | "chars",
    size: number,
}

const SourceDataForWFC = (analyze: ThoughtData, mode: "words" | "chars", size: number) => {

    const width = analyze.maxLength * size;
    const height = analyze.wordCount * size;
    let resolution: number = 0;


    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;

    const ctx = offscreen.getContext("2d");
    if (!ctx) {
        throw new Error("Could not get 2D context");
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0)";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px sans-serif";

    if (mode === "words") {
        for (const w of analyze.chars) {
            const wordCol = analyze.words[w.wordIndex].averageCol;
            ctx.fillStyle = `rgba(${wordCol.r}, ${wordCol.g}, ${wordCol.b}, ${wordCol.a / 255})`;
            ctx.fillRect(w.x * size, w.y * size, size, size);
            resolution = analyze.wordCount > 1 ? analyze.wordCount : 2;
        }
    }
    if (mode === "chars") {
        for (const c of analyze.chars) {
            ctx.fillStyle = `rgba(${c.backCol.r}, ${c.backCol.g}, ${c.backCol.b}, ${c.backCol.a / 255})`;
            ctx.fillRect(c.x * size, c.y * size, size, size);
            resolution = analyze.thoughtLength > 1 ? analyze.thoughtLength : 2;
        }
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    return {
        data,
        width,
        height,
        resolution,
    };
}
export default SourceDataForWFC;


