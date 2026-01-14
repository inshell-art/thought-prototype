import type { RNG32 } from "../../helpers/prng";
import { rngRange } from "../../helpers/prng";
import { formatFixed } from "../../helpers/fixed-point";

export const gridFilter = (
  rnd: RNG32,
  bodies: string[],
  freq: number,
  scale: number,
): string => {
  const filters = bodies.map((_, i) => {
    const seed = rngRange(rnd, 1001);
    return `
    <filter id="wobble-${i}"  x="${-20}%" y="${-20}%" width="${140}%" height="${140}%" color-interpolation-filters="sRGB" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="${formatFixed(freq, 3)}" numOctaves="2" seed="${seed}" stitchTiles="stitch" result="turbulence-${i}"/>
        <feDisplacementMap in="SourceGraphic" in2="turbulence-${i}" scale="${formatFixed(scale, 3)}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`.trim();
  });
  return filters.join("\n");
};
