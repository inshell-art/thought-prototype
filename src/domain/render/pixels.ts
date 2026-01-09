import type { ThoughtData } from "../sample/analyze-for-wfc";
import { rgbaTuple } from "./colors";

export function rectsToPixels(data: ThoughtData, tilePx: number) {
  const { chars, wordMaxLength, wordCount } = data;

  const width = wordMaxLength * tilePx;
  const height = wordCount * tilePx;
  const buf = new Uint8ClampedArray(width * height * 4);
  buf.fill(0, 0);

  chars.forEach(({ x, y, charCol }) => {
    const [r, g, b, a] = rgbaTuple(charCol);

    const x0 = x * tilePx;
    const y0 = y * tilePx;

    for (let dy = 0; dy < tilePx; dy++) {
      let rowIdx = ((y0 + dy) * width + x0) * 4;
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
