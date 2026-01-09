const extractViewBox = (svg: string): string | null => {
  const match = svg.match(/viewBox="([^"]+)"/i);
  return match ? match[1] : null;
};

const extractSvgSize = (svg: string): { width: number; height: number } | null => {
  const widthMatch = svg.match(/width="([^"]+)"/i);
  const heightMatch = svg.match(/height="([^"]+)"/i);
  if (!widthMatch || !heightMatch) return null;
  const width = Number.parseFloat(widthMatch[1]);
  const height = Number.parseFloat(heightMatch[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

const stripOuterSvg = (svg: string): string =>
  svg.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");

export const embedSvg = (
  svg: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string => {
  const viewBox =
    extractViewBox(svg) ??
    (() => {
      const size = extractSvgSize(svg);
      return size ? `0 0 ${size.width} ${size.height}` : `0 0 ${width} ${height}`;
    })();
  const inner = stripOuterSvg(svg);
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
};

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const clampLines = (text: string, maxChars: number, maxLines: number): string[] => {
  const rawLines = text.split("\n");
  const safeMaxChars = Math.max(1, maxChars);
  const safeMaxLines = Math.max(1, maxLines);
  const lines: string[] = [];

  for (const raw of rawLines) {
    if (lines.length >= safeMaxLines) break;
    if (raw.length <= safeMaxChars) {
      lines.push(raw);
    } else {
      const cut = Math.max(1, safeMaxChars - 3);
      lines.push(raw.slice(0, cut) + "...");
    }
  }

  if (rawLines.length > safeMaxLines && lines.length > 0) {
    const cut = Math.max(1, safeMaxChars - 3);
    lines[safeMaxLines - 1] = lines[safeMaxLines - 1].slice(0, cut) + "...";
    lines.length = safeMaxLines;
  }

  return lines.length ? lines : [""];
};
