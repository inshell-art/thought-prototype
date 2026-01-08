export type WFCCfgProps = {
    data: Uint8ClampedArray;    // input pixels
    dataWidth: number;
    dataHeight: number;
    N: number;
    outputWidth: number;
    outputHeight: number;
    periodicInput: boolean;
    periodicOutput: boolean;
    symmetry: number;
} | null



export type RNG = () => number;

export abstract class Model {
    // Dimensions / counts
    public FMX = 0;
    public FMY = 0;
    public FMXxFMY = 0;
    public T = 0;
    public N = 0;

    // State flags
    protected initiliazedField = false; // (kept original misspelling for compatibility)
    protected generationComplete = false;
    protected contradiction = false;
    protected blackHoleCell = -1;

    // Core WFC state
    protected wave: boolean[][] = [];
    protected compatible: number[][][] = []; // [cell][tile][4 directions]
    protected propagator!: number[][][];     // [direction][tile] -> list of compatible tiles

    protected weights!: number[];
    protected weightLogWeights: number[] = [];
    protected sumOfWeights = 0;
    protected sumOfWeightLogWeights = 0;
    protected startingEntropy = 0;

    protected sumsOfOnes: number[] = [];
    protected sumsOfWeights: number[] = [];
    protected sumsOfWeightLogWeights: number[] = [];
    protected entropies: number[] = [];

    protected observed: number[] | null = null;
    protected distribution: number[] = [];

    protected stack: Array<[number, number]> = [];
    protected stackSize = 0;

    // Neighbors
    protected readonly DX = [-1, 0, 1, 0] as const;
    protected readonly DY = [0, 1, 0, -1] as const;
    protected readonly opposite = [2, 3, 0, 1] as const;

    // Implemented by concrete model
    protected abstract onBoundary(x: number, y: number): boolean;

    /**
     * Prepare arrays derived from T, FMX, FMY, and weights.
     */
    public initialize(): void {
        this.distribution = new Array(this.T);

        this.wave = new Array(this.FMXxFMY);
        this.compatible = new Array(this.FMXxFMY);

        for (let i = 0; i < this.FMXxFMY; i++) {
            this.wave[i] = new Array(this.T);
            this.compatible[i] = new Array(this.T);
            for (let t = 0; t < this.T; t++) {
                this.compatible[i][t] = [0, 0, 0, 0];
            }
        }

        this.weightLogWeights = new Array(this.T);
        this.sumOfWeights = 0;
        this.sumOfWeightLogWeights = 0;

        for (let t = 0; t < this.T; t++) {
            this.weightLogWeights[t] = this.weights[t] * Math.log(this.weights[t]);
            this.sumOfWeights += this.weights[t];
            this.sumOfWeightLogWeights += this.weightLogWeights[t];
        }

        this.startingEntropy =
            Math.log(this.sumOfWeights) - this.sumOfWeightLogWeights / this.sumOfWeights;

        this.sumsOfOnes = new Array(this.FMXxFMY);
        this.sumsOfWeights = new Array(this.FMXxFMY);
        this.sumsOfWeightLogWeights = new Array(this.FMXxFMY);
        this.entropies = new Array(this.FMXxFMY);

        // Preallocate stack capacity
        this.stack = new Array(this.FMXxFMY * this.T);
        this.stackSize = 0;
    }

    /**
     * Choose the lowest-entropy cell and collapse it to a random compatible tile.
     * Returns:
     *  - true  -> finished without contradiction
     *  - false -> contradiction
     *  - null  -> collapsed one cell, needs propagation
     */
    protected observe(rng: RNG): boolean | null {
        let min = 1000;
        let argmin = -1;

        for (let i = 0; i < this.FMXxFMY; i++) {
            const x = i % this.FMX;
            const y = Math.floor(i / this.FMX);
            if (this.onBoundary(x, y)) continue;

            const amount = this.sumsOfOnes[i];
            if (amount === 0) {
                if (!this.contradiction) {
                    this.contradiction = true;
                    this.blackHoleCell = i;
                }
                return false;
            }

            const entropy = this.entropies[i];
            if (amount > 1 && entropy <= min) {
                const noise = 0.000001 * rng();
                if (entropy + noise < min) {
                    min = entropy + noise;
                    argmin = i;
                }
            }
        }

        // console.log(`Lowest entropy cell: ${argmin} with entropy ${min}`);

        if (argmin === -1) {
            this.observed = new Array(this.FMXxFMY);
            for (let i = 0; i < this.FMXxFMY; i++) {
                for (let t = 0; t < this.T; t++) {
                    if (this.wave[i][t]) {
                        this.observed[i] = t;
                        break;
                    }
                }
            }
            return true;
        }

        for (let t = 0; t < this.T; t++) {
            this.distribution[t] = this.wave[argmin][t] ? this.weights[t] : 0;
        }

        const randomIndice = (array: number[], r: number) => {
            let sum = 0;   // Variable to accumulate the total sum of the array's elements
            let x = 0;     // Variable to track the cumulative sum of elements
            let i = 0;     // Index variable

            // Step 1: Calculate the sum of all the elements in the array
            for (; i < array.length; i++) {
                sum += array[i];  // Accumulate the sum of array elements
            }

            i = 0;  // Reset the index for the next part of the logic
            r *= sum;  // Scale the random value `r` by the sum of the array. This "maps" r to the total sum.

            // Step 2: Select an index based on the scaled random value
            while (r && i < array.length) {   // While we still have a valid `r` and haven't exhausted the array
                x += array[i];   // Increment the cumulative sum by the current array element
                if (r <= x) {    // If the random value `r` is less than or equal to the cumulative sum
                    return i;      // We return the current index `i`
                }
                i++;  // Move to the next index
            }

            return 0;  // If no valid index was found (very unlikely), return 0
        }

        const r = randomIndice(this.distribution, rng());

        const w = this.wave[argmin];
        for (let t = 0; t < this.T; t++) {
            if (w[t] !== (t === r)) this.ban(argmin, t);
        }

        return null;
    }

    /**
     * Propagate bans through neighbors using the precomputed propagator.
     */
    protected propagate(): void {
        while (this.stackSize > 0) {
            const e1 = this.stack[this.stackSize - 1]!;
            this.stackSize--;

            const i1 = e1[0];
            const x1 = i1 % this.FMX;
            const y1 = Math.floor(i1 / this.FMX);

            for (let d = 0; d < 4; d++) {
                const dx = this.DX[d];
                const dy = this.DY[d];

                let x2 = x1 + dx;
                let y2 = y1 + dy;

                if (this.onBoundary(x2, y2)) continue;

                if (x2 < 0) x2 += this.FMX;
                else if (x2 >= this.FMX) x2 -= this.FMX;
                if (y2 < 0) y2 += this.FMY;
                else if (y2 >= this.FMY) y2 -= this.FMY;

                const i2 = x2 + y2 * this.FMX;
                const p = this.propagator[d][e1[1]];
                const compat = this.compatible[i2];

                for (let l = 0; l < p.length; l++) {
                    const t2 = p[l];
                    const comp = compat[t2];
                    comp[d]--;
                    if (comp[d] === 0) this.ban(i2, t2);
                }
            }
        }
    }

    /**
     * Run one observe→(maybe)propagate step.
     * Returns:
     *  - true/false: terminal result
     *  - null: keep iterating
     */
    protected singleIteration(rng: RNG): boolean | null {
        const result = this.observe(rng);
        if (result !== null) {
            this.generationComplete = result;
            return !!result;
        }
        this.propagate();
        return null;
    }

    /**
     * Run up to `iterations` steps (0 => unlimited) or until terminal result.
     */
    public iterate(iterations = 0, rng: RNG = Math.random): boolean {
        if (!this.wave.length) this.initialize();
        if (!this.initiliazedField) this.clear();

        if (iterations === 0) {
            // Unlimited until done
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const result = this.singleIteration(rng);
                if (result !== null) return !!result;
            }
        } else {
            for (let i = 0; i < iterations; i++) {
                const result = this.singleIteration(rng);
                if (result !== null) return !!result;
            }
            // Reached iteration budget without finishing/contradicting
            return true;
        }
    }

    /**
     * Clear and run to completion (success or contradiction).
     */
    public generate(rng: RNG = Math.random): boolean {
        if (!this.wave.length) this.initialize();
        this.clear();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const result = this.singleIteration(rng);
            if (result !== null) return !!result;
        }
    }

    public isGenerationComplete(): boolean {
        return this.generationComplete;
    }

    public getBlackHoleCell(): number | null {
        return this.contradiction ? this.blackHoleCell : null;
    }

    /**
     * Ban tile `t` at cell `i` and update entropy sums; push to stack.
     */
    protected ban(i: number, t: number): void {
        const comp = this.compatible[i][t];
        for (let d = 0; d < 4; d++) comp[d] = 0;

        this.wave[i][t] = false;

        this.stack[this.stackSize] = [i, t];
        this.stackSize++;

        this.sumsOfOnes[i] -= 1;
        this.sumsOfWeights[i] -= this.weights[t];
        this.sumsOfWeightLogWeights[i] -= this.weightLogWeights[t];

        const sum = this.sumsOfWeights[i];
        this.entropies[i] = Math.log(sum) - this.sumsOfWeightLogWeights[i] / sum;

        if (this.sumsOfOnes[i] === 0 && !this.contradiction) {
            this.contradiction = true;
            this.blackHoleCell = i;
        }
    }

    /**
     * Reset field to the fully-unknotted state.
     */
    public clear(): void {
        for (let i = 0; i < this.FMXxFMY; i++) {
            for (let t = 0; t < this.T; t++) {
                this.wave[i][t] = true;
                for (let d = 0; d < 4; d++) {
                    this.compatible[i][t][d] = this.propagator[this.opposite[d]][t].length;
                }
            }

            this.sumsOfOnes[i] = this.weights.length;
            this.sumsOfWeights[i] = this.sumOfWeights;
            this.sumsOfWeightLogWeights[i] = this.sumOfWeightLogWeights;
            this.entropies[i] = this.startingEntropy;
        }

        this.initiliazedField = true;
        this.generationComplete = false;
        this.contradiction = false;
        this.blackHoleCell = -1;
    }

    // in model.ts
    public getEntropies(): ReadonlyArray<number> {
        return this.entropies;        // read-only view; don't mutate!
    }
    public getSumsOfOnes(): ReadonlyArray<number> {
        return this.sumsOfOnes;
    }

}


type RGBAArray = Uint8Array | Uint8ClampedArray | number[];

export class OverlappingModel extends Model {
    private colors: number[][] = [];    // palette of unique RGBA colors
    private patterns: number[][] = [];  // patterns indexed by 0..T-1
    private periodic: boolean;

    /**
     * @param data     RGBA pixel data of the source image
     * @param dataWidth  width of the source image
     * @param dataHeight height of the source image
     * @param N        neighborhood size (pattern side)
     * @param width    output width (cells/pixels)
     * @param height   output height (cells/pixels)
     * @param periodicInput  treat input as toroidal
     * @param periodicOutput make output wrap (toroidal)
     * @param symmetry  number of symmetries to include [1..8]
     */
    constructor(
        data: Uint8Array | Uint8ClampedArray | number[],
        dataWidth: number,
        dataHeight: number,
        N: number,
        width: number,
        height: number,
        periodicInput: boolean,
        periodicOutput: boolean,
        symmetry: number
    ) {
        super();

        this.N = N;
        this.FMX = width;
        this.FMY = height;
        this.FMXxFMY = width * height;
        this.periodic = periodicOutput;

        const SMX = dataWidth;
        const SMY = dataHeight;

        const sample: number[][] = new Array(SMX);
        for (let i = 0; i < SMX; i++) sample[i] = new Array(SMY);

        const colorMap: Record<string, number> = {};
        this.colors = [];

        // Build palette + sample indices
        for (let y = 0; y < dataHeight; y++) {
            for (let x = 0; x < dataWidth; x++) {
                const idx = (y * dataWidth + x) * 4;
                const color = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
                const key = color.join('-');
                if (!(key in colorMap)) {
                    colorMap[key] = this.colors.length;
                    this.colors.push(color);
                }
                sample[x][y] = colorMap[key];
            }
        }

        const C = this.colors.length;
        const W = Math.pow(C, N * N);

        const pattern = (f: (x: number, y: number) => number): number[] => {
            const result = new Array(N * N);
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    result[x + y * N] = f(x, y);
                }
            }
            return result;
        };

        const patternFromSample = (x: number, y: number): number[] =>
            pattern((dx, dy) => sample[(x + dx) % dataWidth][(y + dy) % dataHeight]);

        const rotate = (p: number[]): number[] =>
            pattern((x, y) => p[N - 1 - y + x * N]);

        const reflect = (p: number[]): number[] =>
            pattern((x, y) => p[N - 1 - x + y * N]);

        const indexOf = (p: number[]): number => {
            let result = 0;
            let power = 1;
            for (let i = 0; i < p.length; i++) {
                result += p[p.length - 1 - i] * power;
                power *= C;
            }
            return result;
        };

        const patternFromIndex = (ind: number): number[] => {
            let residue = ind;
            let power = W;
            const result = new Array(N * N);
            for (let i = 0; i < result.length; i++) {
                power /= C;
                let count = 0;
                while (residue >= power) {
                    residue -= power;
                    count++;
                }
                result[i] = count;
            }
            return result;
        };

        // Count pattern occurrences (with symmetry)
        const weightsMap = new Map<number, number>();
        const weightsKeys: number[] = [];

        const maxY = periodicInput ? dataHeight : dataHeight - N + 1;
        const maxX = periodicInput ? dataWidth : dataWidth - N + 1;

        for (let y = 0; y < maxY; y++) {
            for (let x = 0; x < maxX; x++) {
                const ps = new Array<number[]>(8);
                ps[0] = patternFromSample(x, y);
                ps[1] = reflect(ps[0]);
                ps[2] = rotate(ps[0]);
                ps[3] = reflect(ps[2]);
                ps[4] = rotate(ps[2]);
                ps[5] = reflect(ps[4]);
                ps[6] = rotate(ps[4]);
                ps[7] = reflect(ps[6]);

                for (let k = 0; k < symmetry; k++) {
                    const ind = indexOf(ps[k]);
                    if (weightsMap.has(ind)) {
                        weightsMap.set(ind, (weightsMap.get(ind) || 0) + 1);
                    } else {
                        weightsMap.set(ind, 1);
                        weightsKeys.push(ind); // preserve insertion order
                    }
                }
            }
        }

        this.T = weightsKeys.length;
        this.patterns = new Array(this.T);
        this.weights = new Array(this.T);

        for (let i = 0; i < this.T; i++) {
            const w = weightsKeys[i];
            this.patterns[i] = patternFromIndex(w);
            this.weights[i] = weightsMap.get(w) || 0;
        }

        const agrees = (p1: number[], p2: number[], dx: number, dy: number): boolean => {
            const xmin = dx < 0 ? 0 : dx;
            const xmax = dx < 0 ? dx + N : N;
            const ymin = dy < 0 ? 0 : dy;
            const ymax = dy < 0 ? dy + N : N;

            for (let y = ymin; y < ymax; y++) {
                for (let x = xmin; x < xmax; x++) {
                    if (p1[x + N * y] !== p2[x - dx + N * (y - dy)]) return false;
                }
            }
            return true;
        };

        // Build propagator: for each direction and tile, which neighbor tiles are allowed
        this.propagator = new Array(4);
        for (let d = 0; d < 4; d++) {
            this.propagator[d] = new Array(this.T);
            for (let t = 0; t < this.T; t++) {
                const list: number[] = [];
                for (let t2 = 0; t2 < this.T; t2++) {
                    if (agrees(this.patterns[t], this.patterns[t2], this.DX[d], this.DY[d])) {
                        list.push(t2);
                    }
                }
                this.propagator[d][t] = list;
            }
        }
    }

    protected onBoundary(x: number, y: number): boolean {
        return (
            !this.periodic &&
            (x + this.N > this.FMX || y + this.N > this.FMY || x < 0 || y < 0)
        );
    }


    /**
     * Render RGBA data for current state (complete or partial).
     */
    public graphics(array?: RGBAArray): RGBAArray {
        const out = array ?? new Uint8Array(this.FMXxFMY * 4);
        if (this.isGenerationComplete()) {
            this.graphicsComplete(out);
        } else {
            this.graphicsIncomplete(out);
        }
        return out;
    }

    protected graphicsComplete(array: RGBAArray): void {
        for (let y = 0; y < this.FMY; y++) {
            const dy = y < this.FMY - this.N + 1 ? 0 : this.N - 1;
            for (let x = 0; x < this.FMX; x++) {
                const dx = x < this.FMX - this.N + 1 ? 0 : this.N - 1;

                const pixelIndex = (y * this.FMX + x) * 4;
                const tileIndex =
                    this.observed![x - dx + (y - dy) * this.FMX]!;
                const colorIndex =
                    this.patterns[tileIndex][dx + dy * this.N];
                const color = this.colors[colorIndex];

                array[pixelIndex] = color[0];
                array[pixelIndex + 1] = color[1];
                array[pixelIndex + 2] = color[2];
                array[pixelIndex + 3] = color[3];
            }
        }
    }

    protected graphicsIncomplete(array: RGBAArray): void {
        for (let i = 0; i < this.FMXxFMY; i++) {
            const x = i % this.FMX;
            const y = Math.floor(i / this.FMX);

            let contributors = 0;
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;

            for (let dy = 0; dy < this.N; dy++) {
                for (let dx = 0; dx < this.N; dx++) {
                    let sx = x - dx;
                    if (sx < 0) sx += this.FMX;

                    let sy = y - dy;
                    if (sy < 0) sy += this.FMY;

                    if (this.onBoundary(sx, sy)) continue;

                    const s = sx + sy * this.FMX;
                    for (let t = 0; t < this.T; t++) {
                        if (this.wave[s][t]) {
                            contributors++;
                            const color = this.colors[
                                this.patterns[t][dx + dy * this.N]
                            ];
                            r += color[0];
                            g += color[1];
                            b += color[2];
                            a += color[3];
                        }
                    }
                }
            }

            const pixelIndex = i * 4;
            array[pixelIndex] = r / contributors;
            array[pixelIndex + 1] = g / contributors;
            array[pixelIndex + 2] = b / contributors;
            array[pixelIndex + 3] = a / contributors;
        }
    }
}
