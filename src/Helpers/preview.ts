import type { ThoughtData } from "../WFC/AnalyzeForWFC";
import type { RGBA } from "../WFC/AnalyzeForWFC";

const rgbaToCss = ({ r, g, b, a }: RGBA): string =>
  `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;

export function charSrcPreview(
  data: ThoughtData,
  cell = 20,
): string {
  const { chars, wordMaxLength, wordCount } = data;

  const w = wordMaxLength * cell;
  const h = wordCount * cell;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg"
       width="${w}" height="${h}"
       viewBox="0 0 ${w} ${h}"
       font-family="monospace"
       font-size="${cell * 0.6}"
       text-anchor="middle"
       dominant-baseline="central">`;

  chars.forEach(({ ch, x, y, charCol }) => {
    const px = x * cell;
    const py = y * cell;
    const fill = rgbaToCss(charCol);

    svg += `
      <rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${fill}"/>
      <text x="${px + cell / 2}" y="${py + cell / 2}" fill="black">
        ${ch === " " ? "␣" : ch}
      </text>`;
  });

  svg += "\n</svg>";
  return svg;
}

// export function wordSrcPreview(
//   data: ThoughtData,
//   cell = 30
// ): string {
//   const { chars, words, wordMaxLength, wordCount } = data;

//   const w = wordMaxLength * cell;
//   const h = wordCount * cell;

//   let svg = `<svg xmlns="http://www.w3.org/2000/svg"
//        width="${w}" height="${h}"
//        viewBox="0 0 ${w} ${h}"
//        font-family="monospace"
//        font-size="${cell * 0.6}"
//        text-anchor="middle"
//        dominant-baseline="central">`;

//   chars.forEach(({ ch, x, y, wordIndex }) => {
//     const px = x * cell;
//     const py = y * cell;
//     const fill = rgbaToCss(words[wordIndex].avgColor); // 👈 word colour

//     svg += `
//       <rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${fill}"/>
//       <text x="${px + cell / 2}" y="${py + cell / 2}" fill="black">
//         ${ch === " " ? "␣" : ch}
//       </text>`;
//   });

//   svg += "\n</svg>";
//   return svg;
// }


export function outputPreview(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number = 10,
  canvasID: string
) {
  const canvas = document.getElementById(canvasID) as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf), width, height), 0, 0);

  /* 2 – tell the browser to display the bitmap 10× bigger */
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;

  /* 3 – keep the chunky pixel look (no bilinear blur) */
  canvas.style.imageRendering = "pixelated";
}


export function patternPreview(
  model: any,
  cellPx = 8,
  startX = 0,
  startY = 0,
  maxRowW = 400
): string {
  const N = model.N;                // pattern side length
  const patW = N * cellPx;           // miniature width  per pattern
  const patH = N * cellPx;           // miniature height per pattern

  let x = startX;
  let y = startY;
  let content = "";

  const rgba = (c: number[]) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;

  for (let t = 0; t < model.T; t++) {
    /* ----- build one <g> block for pattern t ----- */
    let g = `<g id="pattern-${t}" transform="translate(${x},${y})">`;

    // squares
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const col = model.colors[model.patterns[t][px + py * N]];
        g += `<rect x="${px * cellPx}" y="${py * cellPx}"
                    width="${cellPx}" height="${cellPx}"
                    fill="${rgba(col)}"/>`;
      }
    }

    g += "</g>";
    content += g;

    /* ----- advance cursor, wrap row if needed ----- */
    x += patW + 2;
    if (x + patW > maxRowW) {
      x = startX;
      y += patH + 2; // pattern height + label + margin
    }
  }

  /* ----- outer wrapper SVG ----- */
  const totalW = Math.max(maxRowW, x + patW);
  const totalH = y + patH + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg"
               width="${totalW}" height="${totalH}"
               font-family="monospace">${content}</svg>`;
}




// --- add near the top ---
const CANVAS = 10;           // match your layoutSVG viewBox width/height
const PADDING_FRAC = 0.10;   // 10% padding to match final render

export function computeN(s: string) {
  return s.length > 5 ? Math.round(5 + Math.sqrt(s.length - 5)) : s.length + 1;
}

// Build a white-stroke n×n grid with the same padding math
export function simpleGridSVG(n: number): string {
  const WIDTH = CANVAS, HEIGHT = CANVAS;
  const padding = WIDTH * PADDING_FRAC;
  const inner = WIDTH - 2 * padding;
  const step = inner / n;

  let lines = `
    <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}"
          fill="none" stroke="#fff" stroke-width="1"
          vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>`;

  for (let i = 1; i < n; i++) {
    const x = padding + i * step;
    const y = padding + i * step;
    lines += `
      <line x1="${x}" y1="${padding}" x2="${x}" y2="${padding + inner}"
            stroke="#fff" stroke-width="1"
            vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>
      <line x1="${padding}" y1="${y}" x2="${padding + inner}" y2="${y}"
            stroke="#fff" stroke-width="1"
            vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>`;
  }

  return `
<svg width="100%" height="100%" viewBox="0 0 ${WIDTH} ${HEIGHT}"
     preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#000"/>
  <g style="isolation:isolate">
    ${lines}
  </g>
</svg>`;
}


