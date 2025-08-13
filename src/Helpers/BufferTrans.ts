import type { ThoughtData } from "../WFC/AnalyzeForWFC";

export interface Rect {
    x: number;          // col index
    y: number;          // row index
    r: number;
    g: number;
    b: number;
    a: number;
}


export function rectsToPixels(
    data: ThoughtData,
    tilePx: number,
) {
    const { chars, palette, wordMaxLength, wordCount } = data;

    const width = wordMaxLength * tilePx;
    const height = wordCount * tilePx;
    const buf = new Uint8ClampedArray(width * height * 4);

    const rgbaTuple = (rgba: { r: number; g: number; b: number; a: number }) =>
        [rgba.r, rgba.g, rgba.b, rgba.a] as const;

    chars.forEach(({ x, y, colorIndex }) => {
        const [r, g, b, a] = rgbaTuple(palette[colorIndex]);

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



export function framesToRectGroups(
    frames: Uint8ClampedArray[],
    w: number,
    h: number,
    cellSize: number,
): string[] {

    const pixelsToRects = (buf: Uint8ClampedArray): Rect[] => {
        const rects: Rect[] = [];
        const stride = w * 4;                    // bytes per scanline

        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const idx = y * stride + x * 4;      // sample top-left pixel
                rects.push({
                    x: x,
                    y: y,
                    r: buf[idx],
                    g: buf[idx + 1],
                    b: buf[idx + 2],
                    a: buf[idx + 3],
                });
            }
        }
        return rects;
    }

    function pixelsToRectSVG(
        rects: Rect[],
        cellSize: number,
        offsetX = 0,
        offsetY = 0
    ): string {
        return rects
            .map(
                ({ x, y, r, g, b, a }) => `
        <rect x="${x * cellSize + offsetX}" y="${y * cellSize + offsetY}"
              width="${cellSize}" height="${cellSize}"
              fill="${rgbaCss(r, g, b, a)}"/>`
            )
            .join("");
    }

    const rgbaCss = (r: number, g: number, b: number, a: number) =>
        `rgba(${r},${g},${b},${Math.round(10 * a / 255) / 10})`;

    return frames.map((buf, i) => {
        const rects = pixelsToRects(buf);
        const body = pixelsToRectSVG(rects, cellSize);

        return `\n<g id="frame-${i}">${body}</g>\n`;
    });
}


export function buildCumulativeOpacitySVG(
    groups: string[],        // your <g id="frame-i">…</g> strings (oldest -> newest)
    totalDurSec: number      // total timeline duration
): string {
    const F = Math.max(groups.length, 1);
    const frameDur = totalDurSec / F;

    // 1) Master clock that loops the whole sequence
    const clock = `
  <rect width="0" height="0" fill="none">
    <animate id="timeline" attributeName="x" from="0" to="0"
             dur="${totalDurSec}s" begin="0s;timeline.end"/>
  </rect>`;

    // 2) Ensure each group starts hidden (opacity=0) and add a tiny step animate
    const framed = groups.map((g, i) => {
        const begin = (i * frameDur).toFixed(6) + "s";
        // inject base opacity=0 into the opening <g …>
        const gWithOpacity0 = g.replace(/<g(\s+)/, '<g opacity="0"$1');
        const anim = `
      <animate attributeName="opacity"
               from="0" to="1"
               begin="timeline.begin+${begin}"
               dur="0.001s"
               fill="freeze" />`;
        // insert animate just before </g>
        return gWithOpacity0.replace(/<\/g>\s*$/, `${anim}\n</g>`);
    });

    return `
  ${clock}
  ${framed.join("\n")}
  `;
}


export function buildCumulativeDisplaySVG(
    groups: string[],
    totalDurSec: number
): string {
    const F = Math.max(groups.length, 1);
    const frameDur = totalDurSec / F;

    const clock = `
  <rect width="0" height="0" fill="none">
    <animate id="timeline" attributeName="x" from="0" to="0"
             dur="${totalDurSec}s" begin="0s;timeline.end"/>
  </rect>`;

    const framed = groups.map((g, i) => {
        const begin = (i * frameDur).toFixed(6) + "s";
        // start hidden via display:none; then flip to inline
        const gHidden = g.replace(/<g(\s+)/, '<g style="display:none; mix-blend-mode:normal""$1');
        const set = `
      <set attributeName="display"
           to="inline"
           begin="timeline.begin+${begin}"
           fill="freeze" />`;
        return gHidden.replace(/<\/g>\s*$/, `${set}\n</g>`);
    });

    return `
  ${clock}
  ${framed.join("\n")}
`;
}


export function renderText(thoughtData: ThoughtData, HEIGHT: number, padding: number): string {
    const fontSize = 50;
    const charSpan = fontSize * 0.6;            // horizontal advance per char
    const baselineY = HEIGHT - padding;         // keep your existing baseline

    // rect size behind each glyph
    const rectW = charSpan / 2;
    const rectH = fontSize * 0.2;               // a bit shorter than font size             // corner radius (optional)

    let rects = "";
    let spans = "";

    thoughtData.chars.forEach((cd, i) => {
        // keep the same horizontal placement you already use
        const xLeft = padding + i * charSpan;
        const cx = xLeft + charSpan / 2;
        const cy = baselineY;

        // rect centered under the glyph
        const rx = cx - rectW / 2;
        const ry = cy + fontSize / 3;

        const { r, g, b, a } = cd.charCol;
        const fill = `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;

        // draw the back rect first
        rects += `<rect x="${rx}" y="${ry}" width="${rectW}" height="${rectH}" fill="${fill}"/>`;

        // then the black character exactly where you had it
        const ch = cd.ch; // or cd.ch === " " ? "␣" : cd.ch if you want visible spaces
        spans += `<tspan x="${cx}" y="${cy}">${ch}</tspan>`;
    });

    return `
    <g>
      ${rects}
      <text font-family="monospace"
            font-size="${fontSize}"
            fill="black"
            text-anchor="middle"
            dominant-baseline="hanging">
        ${spans}
      </text>
    </g>`;
}
