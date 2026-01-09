import { remap } from "../../helpers/prng";

export const gridFilter = (
  rnd: () => number,
  bodies: string[],
  freq: number,
  scale: number,
): string => {
  const filters = bodies.map((_, i) => `
    <filter id="wobble-${i}"  x="${-20}%" y="${-20}%" width="${140}%" height="${140}%" color-interpolation-filters="sRGB" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${remap(0, 1000, rnd(), 0)}" stitchTiles="stitch" result="turbulence-${i}"/>
        <feDisplacementMap in="SourceGraphic" in2="turbulence-${i}" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`.trim());
  return filters.join("\n");
};
