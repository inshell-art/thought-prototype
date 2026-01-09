import type { ThoughtData } from "../sample/analyze-for-wfc";

export function renderText(thoughtData: ThoughtData): string {
  const cellSize = 2;
  const fontSize = 0.5 * cellSize;
  const charSpan = 0.6 * fontSize;

  const rectW = 0.6 * charSpan;
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
        fill="white"
        text-anchor="start"
        dominant-baseline="hanging"
        style="font-variant-ligatures:none; letter-spacing:0">
        ${spans}
      </text>
    </g>`;
}
