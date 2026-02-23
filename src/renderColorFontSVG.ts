import type { ColorFont } from "./colorFont";

export type RenderColorFontOptions = {
  cols: number;
  cellSize: number;
  gap: number;
  padding: number;
  background: string;
  canvasSize?: number;
};

function escAttr(v: string) {
  return v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function renderColorFontSVG(text: string, colorFont: ColorFont, opts: RenderColorFontOptions): string {
  const len = Math.max(0, text.length);

  const cell = Math.max(1, Math.floor(opts.cellSize));
  const gap = Math.max(0, Math.floor(opts.gap));
  const pad = Math.max(0, Math.floor(opts.padding));
  const requestedCanvasWidth = Math.max(0, Math.floor(opts.canvasSize ?? 0));

  const effectiveCols = Math.max(1, len);

  const availableCellWidth =
    requestedCanvasWidth > 0
      ? Math.max(0, requestedCanvasWidth - pad * 2 - Math.max(0, len - 1) * gap)
      : null;
  const fitCell =
    availableCellWidth === null
      ? cell
      : Math.max(1, Math.floor(availableCellWidth / Math.max(1, len)));
  const effectiveCell = Math.max(1, Math.min(cell, fitCell));

  const rows = 1;

  const gridWidth = pad * 2 + effectiveCols * effectiveCell + (effectiveCols - 1) * gap;
  const gridHeight = pad * 2 + rows * effectiveCell + (rows - 1) * gap;
  const size = Math.max(
    gridWidth,
    gridHeight,
    requestedCanvasWidth
  );
  const width = size || gridWidth;
  const height = size || gridHeight;
  const offsetX = Math.max(0, (width - gridWidth) / 2);
  const offsetY = Math.max(0, (height - gridHeight) / 2);

  const rects: string[] = [];
  for (let i = 0; i < len; i++) {
    const ch = text[i] ?? "";
    const fill = colorFont[ch] ?? "#ffffff";
    const cx = i % effectiveCols;
    const cy = Math.floor(i / effectiveCols);
    const x = pad + cx * (effectiveCell + gap);
    const y = pad + cy * (effectiveCell + gap);
    rects.push(
      `<rect x="${x}" y="${y}" width="${effectiveCell}" height="${effectiveCell}" fill="${escAttr(fill)}" />`
    );
  }

  return [
    `<svg data-thought="${escAttr(text)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"`,
    `  xmlns="http://www.w3.org/2000/svg">`,
    `  <rect width="100%" height="100%" fill="${escAttr(opts.background)}" />`,
    `  <g shape-rendering="crispEdges" transform="translate(${offsetX} ${offsetY})">`,
    rects.join("\n"),
    `  </g>`,
    `</svg>`,
  ].join("\n");
}
