import type { ThoughtData } from "../WFC/AnalyzeForWFC";

export function rectsToPixels(
    data: ThoughtData,
    tilePx: number,
    canvasBg: { r: number; g: number; b: number; a: number }
) {
    const { chars, wordMaxLength, wordCount } = data;

    const width = wordMaxLength * tilePx;
    const height = wordCount * tilePx;
    const buf = new Uint8ClampedArray(width * height * 4);
    buf.fill(255); // Fill with white (opaque)

    chars.forEach(({ x, y, charCol }) => {
        const [r, g, b, a] = rgbaTuple(charCol);

        const x0 = x * tilePx;  // top‑left pixel of this square
        const y0 = y * tilePx;

        for (let dy = 0; dy < tilePx; dy++) {
            let rowIdx = ((y0 + dy) * width + x0) * 4;  // byte offset
            for (let dx = 0; dx < tilePx; dx++) {
                buf[rowIdx] = r;
                buf[rowIdx + 1] = g;
                buf[rowIdx + 2] = b;
                buf[rowIdx + 3] = a;
                rowIdx += 4;
            }
        }
    });
    return buf;
}

export type frameProps = {
    uint8ClampedArray: Uint8ClampedArray;
    entropies: Float32Array;
    sumsOfOnes: Uint16Array;
}

export function iterationsToRectBodies(
    iterations: frameProps[],
    w: number,
    h: number,
    cellSize: number
): string[] {
    return iterations.map((buf) => {
        let bodies = "";
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {

                const getRGBA = (buf: frameProps, x: number, y: number) => {
                    const idx = y * w * 4 + x * 4;
                    return [buf.uint8ClampedArray[idx], buf.uint8ClampedArray[idx + 1], buf.uint8ClampedArray[idx + 2], buf.uint8ClampedArray[idx + 3]];
                }
                const [r, g, b, a] = getRGBA(buf, x, y);
                const status = buf.sumsOfOnes[y * w + x] === 1 ? "Collapsed" : "Superposition"; // buf.sumsOfOnes[y * w + x];
                bodies += `<use href="#cell" x="${x * cellSize}" y="${y * cellSize}" data-status="${status}" fill="${rgbaToHex(r, g, b, a)}" opacity="0.2"/>\n`;
            }
        }
        return bodies;
    });
}

export const cellDefinition = (cellSize: number): string => {
    const size = cellSize;
    // Offset by -bleed so placing at (x*cellSize, y*cellSize) centers the bleed around the cell
    return `<defs>
    <rect id="cell" width="${size}" height="${size}"/>
  </defs>`;
};



export function collapseSVG(bodies: string[]): string {
    //; mix-blend-mode:darken">
    const frames = bodies.map((inner, i) => {
        const begin = `${i / 10}s`;
        return `
<g id="iteration-${i}" style="display:none">
${inner}
<set attributeName="display" to="inline" begin="timeline.begin+${begin}" fill="freeze" />
</g>`.trim();
    });
    return `${frames.join("\n")}`;
}


export function renderText(thoughtData: ThoughtData): string {
    const cellSize = 1;
    const fontSize = 0.5 * cellSize;
    const charSpan = 0.6 * fontSize;

    const rectW = 0.5 * charSpan;
    const rectH = 0.2 * fontSize;

    let rects = "";
    let spans = "";

    thoughtData.chars.forEach((cd, i) => {
        const cx = fontSize * 0.1 + i * charSpan;
        const cy = fontSize * 0.1;

        const centerX = cx + charSpan / 2;
        const centerY = cy + fontSize / 2;

        const rx = centerX - rectW / 2;
        const ry = centerY - rectH / 2;

        const { r, g, b, a } = cd.charCol;
        const fill = `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;

        rects += `<rect x="${rx}" y="${ry}" width="${rectW}" height="${rectH}" fill="${fill}"/>\n`;
        spans += `<tspan x="${cx}" y="${cy}">${cd.ch}</tspan>\n`;
    });

    return `
    <g>
      ${rects}
      <text
        font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
        font-size="${fontSize}"
        fill="black"
        text-anchor="start"
        dominant-baseline="hanging"
        style="font-variant-ligatures:none; letter-spacing:0">
        ${spans}
      </text>
    </g>`;
}


export function rgbaToHex(r: number, g: number, b: number, a: number): string {
    // Clamp values into 0–255
    const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));

    const rHex = clamp(r).toString(16).padStart(2, "0");
    const gHex = clamp(g).toString(16).padStart(2, "0");
    const bHex = clamp(b).toString(16).padStart(2, "0");

    // Convert alpha (0–255) into 0–255 as well
    const aHex = clamp(a).toString(16).padStart(2, "0");

    // You can choose whether to include alpha or not
    return `#${rHex}${gHex}${bHex}${aHex}`;
}

export const rgbaTuple = (rgba: { r: number; g: number; b: number; a: number }) =>
    [rgba.r, rgba.g, rgba.b, rgba.a] as const;


