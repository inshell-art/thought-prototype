export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));

  const rHex = clamp(r).toString(16).padStart(2, "0");
  const gHex = clamp(g).toString(16).padStart(2, "0");
  const bHex = clamp(b).toString(16).padStart(2, "0");
  const aHex = clamp(a).toString(16).padStart(2, "0");

  return `#${rHex}${gHex}${bHex}${aHex}`;
}

export const rgbaTuple = (rgba: { r: number; g: number; b: number; a: number }) =>
  [rgba.r, rgba.g, rgba.b, rgba.a] as const;
