import type { ColorFont } from "./colorFont";

export type RenderColorFontOptions = {
  cols: number;
  cellSize: number;
  gap: number;
  padding: number;
  background: string;
  canvasSize?: number;
  alignVertical?: "center" | "top";
};

function escAttr(v: string) {
  return v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function renderColorFontSVG(text: string, colorFont: ColorFont, opts: RenderColorFontOptions): string {
  const len = Math.max(0, text.length);

  const baseCell = Math.max(1, Math.floor(opts.cellSize));
  const gap = Math.max(0, Math.floor(opts.gap));
  const pad = Math.max(28, Math.floor(opts.padding));
  const requestedCanvasWidth = Math.max(0, Math.floor(opts.canvasSize ?? 0));

  const effectiveCols = Math.max(1, len);
  const minCell = 0.0001;
  const minGap = gap;
  const minPad = pad;

  const baseGridWidth = minPad * 2 + effectiveCols * baseCell + (effectiveCols - 1) * minGap;
  let effectiveCell = baseCell;
  let effectiveGap = minGap;
  let effectivePad = minPad;

  if (requestedCanvasWidth > 0) {
    if (baseGridWidth < requestedCanvasWidth) {
      const remaining = requestedCanvasWidth - baseGridWidth;
      effectivePad = minPad + remaining / 2;
    } else {
      const shrinkCell = (requestedCanvasWidth - effectivePad * 2 - (effectiveCols - 1) * effectiveGap) / effectiveCols;
      effectiveCell = Math.max(minCell, shrinkCell);

      if (shrinkCell < minCell || shrinkCell <= 0) {
        effectiveGap = 0;
        const shrinkCellWithZeroGap = (requestedCanvasWidth - effectivePad * 2) / effectiveCols;
        effectiveCell = Math.max(minCell, shrinkCellWithZeroGap);

        if (shrinkCellWithZeroGap <= 0) {
          effectivePad = Math.max(0, requestedCanvasWidth / 2 - minCell);
          effectiveCell = Math.max(minCell, (requestedCanvasWidth - effectivePad * 2) / effectiveCols);
        }
      }
    }
  }

  const rows = 1;

  const gridWidth = effectivePad * 2 + effectiveCols * effectiveCell + (effectiveCols - 1) * effectiveGap;
  const gridHeight = effectivePad * 2 + rows * effectiveCell + (rows - 1) * effectiveGap;
  const size = requestedCanvasWidth || Math.max(gridWidth, gridHeight);
  const width = size;
  const height = size;
  const offsetX = Math.max(0, (width - gridWidth) / 2);
  const alignVertical = opts.alignVertical ?? "center";
  const offsetY = alignVertical === "top" ? 0 : Math.max(0, (height - gridHeight) / 2);

  const rects: string[] = [];
  for (let i = 0; i < len; i++) {
    const ch = text[i] ?? "";
    const fill = colorFont[ch] ?? "#ffffff";
    const cx = i % effectiveCols;
    const cy = Math.floor(i / effectiveCols);
    const x = effectivePad + cx * (effectiveCell + effectiveGap);
    const y = effectivePad + cy * (effectiveCell + effectiveGap);
    rects.push(
      `<rect x="${x}" y="${y}" width="${effectiveCell}" height="${effectiveCell}" fill="${escAttr(fill)}" />`
    );
  }

  return [
    `<svg data-thought="${escAttr(text)}" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"`,
    `  xmlns="http://www.w3.org/2000/svg">`,
    `  <rect width="100%" height="100%" fill="${escAttr(opts.background)}" />`,
    `  <g shape-rendering="crispEdges" transform="translate(${offsetX} ${offsetY})">`,
    rects.join("\n"),
    `  </g>`,
    `</svg>`,
  ].join("\n");
}
