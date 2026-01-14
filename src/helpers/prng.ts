const UINT32_RANGE = 0x1_0000_0000;
const LCG_A = 1664525;
const LCG_C = 1013904223;

export type RNG32 = () => number;

export const PRNG32 = (seed: number): RNG32 => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, LCG_A) + LCG_C) >>> 0;
        return state;
    };
};

export const mixSeed = (seed: number, tag: number): number => ((seed ^ tag) >>> 0);

export const rngRange = (rng: RNG32, max: number): number => {
    if (max <= 0) return 0;
    return rng() % max;
};

export const rngByte = (rng: RNG32): number => rng() & 0xff;

export const rngBool = (rng: RNG32): boolean => (rng() & 1) === 1;

export const remapFixed = (min: number, max: number, rng: RNG32): number => {
    if (min > max) [min, max] = [max, min];
    const range = max - min;
    if (range <= 0) return min;
    const value = Math.floor((rng() * range) / UINT32_RANGE);
    return min + value;
};
