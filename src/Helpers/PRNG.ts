function hashSeed(str: string): number {
    let h1 = 1779033703,
        h2 = 3144134277;
    for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 597399067);
        h2 = Math.imul(h2 ^ str.charCodeAt(i), 2869860233);
    }
    return (h1 ^ (h2 >>> 13)) >>> 0;        // → unsigned 32-bit seed
}

/** Correct Mulberry-32 — always returns 0 ≤ x < 1  */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;                     // ensure unsigned
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // <<< unsigned cast
    };
}


// values returned are determined by the token_id and the times of the call
// need to ensure the method how works 
// and find out the alternative in Cairo 
export const PRNG = (token_id: string): () => number => {
    const seed = hashSeed(token_id);
    return mulberry32(seed);
}

export const remap = (
    min: number,
    max: number,
    r: number,
    decimals = 0            // default: integer
): number => {
    if (min > max) [min, max] = [max, min];

    const raw = r * (max - min) + min;       // linear interpolate
    const factor = 10 ** decimals;           // 1, 10, 100, …
    return Math.round(raw * factor) / factor;
};