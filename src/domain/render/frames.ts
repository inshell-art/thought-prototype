import { rgbaToHex } from "./colors";

export type frameProps = {
  uint8ClampedArray: Uint8ClampedArray;
  entropies: Float32Array;
  sumsOfOnes: Uint16Array;
};

export function iterationsToRectBodies(
  iterations: frameProps[],
  w: number,
  h: number,
  cellSize: number,
  cellGap: number,
  opacity: number,
): string[] {
  const step = cellSize + cellGap;
  const inset = cellGap / 2;
  return iterations.map((buf) => {
    let bodies = "";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const getRGBA = (frame: frameProps, x0: number, y0: number) => {
          const idx = y0 * w * 4 + x0 * 4;
          return [
            frame.uint8ClampedArray[idx],
            frame.uint8ClampedArray[idx + 1],
            frame.uint8ClampedArray[idx + 2],
            frame.uint8ClampedArray[idx + 3],
          ] as const;
        };

        const [r, g, b, a] = getRGBA(buf, x, y);
        const status = buf.sumsOfOnes[y * w + x] === 1 ? "Collapsed" : "Superposition";

        const px = x * step + inset;
        const py = y * step + inset;

        bodies += `\
<rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}"
      data-status="${status}"
      fill="${rgbaToHex(r, g, b, a)}"
      opacity="${(opacity * (a / 255)).toFixed(3)}"/>\n`;
      }
    }
    return bodies;
  });
}

export function collapseSVG(bodies: string[]): string {
  const frames = bodies.map((inner, i) => {
    const begin = `${i / 10}s`;
    return `
<g id="iteration-${i}" style="display:none; mix-blend-mode:overlay" filter="url(#wobble-${i})">
${inner}
 <set attributeName="display" to="inline" begin="timeline.begin+${begin}" fill="freeze"/>
</g> \n`.trim();
  });
  return `${frames.join("\n")}`;
}
