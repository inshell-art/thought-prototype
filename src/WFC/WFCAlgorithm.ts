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
    ground: number;
} | null


// class Model {
//     protected FMX: number = 0;
//     protected FMY: number = 0;
//     protected FMXxFMY: number = 0; // this.FMXxFMY is the total number of cells in the output grid
//     protected T: number = 0; // this.T is the number of different patterns
//     protected N: number = 0;
//     protected initiliazedField: boolean = false;
//     protected generationComplete: boolean | null;
//     protected wave: boolean[][] //| null;
//     protected compatible: number[][][] //| null;
//     protected weightLogWeights: number[] //| null;
//     protected sumOfWeights: number = 0;
//     protected sumOfWeightLogWeights: number = 0;
//     protected initialEntropy: number = 0;
//     protected sumsOfPatterns: number[] //| null;
//     protected sumsOfWeights: number[] //| null;
//     protected sumsOfWeightLogWeights: number[] //| null;
//     entropies: number[] //| null;
//     protected propagator: number[][][] //| null;
//     protected observed: number[]// | null;
//     protected distribution: number[] //| null = null;
//     protected stack: Array<[number, number]> //| null;
//     protected stackSize: number = 0;
//     protected DX: number[] = [-1, 0, 1, 0];
//     protected DY: number[] = [0, 1, 0, -1];
//     protected opposite: number[] = [2, 3, 0, 1];
//     protected weights: number[] = []; // accessible in child
//     protected patterns: number[][] = [];

//     constructor() {
//         this.FMX = 0;
//         this.FMY = 0;
//         this.FMXxFMY = 0; // this.FMXxFMY is the total number of cells in the output grid

//         this.T = 0; // this.T is the number of different patterns
//         this.N = 0;
//         this.initiliazedField = false;
//         this.generationComplete = false;
//         this.wave = [];//null;
//         this.compatible = [];//null;
//         this.weightLogWeights = [];//null;
//         this.sumOfWeights = 0;
//         this.sumOfWeightLogWeights = 0;
//         this.initialEntropy = 0;
//         this.sumsOfPatterns = [];//null;
//         this.sumsOfWeights = [];//null;
//         this.sumsOfWeightLogWeights = [];//null;
//         this.entropies = []//null;
//         this.propagator = []//null;
//         this.observed = [];//null;
//         this.distribution = []//null;
//         // this.stack = null;
//         this.stack = new Array<[number, number]>(this.FMXxFMY * this.T);
//         this.stackSize = 0;
//         this.DX = [-1, 0, 1, 0];
//         this.DY = [0, 1, 0, -1];
//         this.opposite = [2, 3, 0, 1];
//     }

//     public initialize(): void {
//         this.distribution = new Array(this.T); // Initialize the distribution array to hold the weighted probabilities of each pattern that used to select a pattern based on their weights. distribution[t] is the weight of pattern t
//         this.wave = new Array(this.FMXxFMY); // Initialize the wave array to represent the possible patterns for each cell in the output grid. wave array is a 2D array, wave[i][t] is boolean value indicates whether pattern t is possible at cell i
//         this.compatible = new Array(this.FMXxFMY); // Initialize the compatible array to keep track of the number of compatible patterns in each direction. compatible array is a 3D array, where compatible[i][t][d] keeps track of the number of patterns compatible with pattern t at position i in direction d

//         // Loop over all the cells
//         for (let i = 0; i < this.FMXxFMY; i++) {
//             this.wave[i] = new Array(this.T); // Initializes wave[i] as each cell's possible patterns array
//             this.compatible[i] = new Array(this.T); // Initializes compatible[i] as each cell's compatibility array
//             for (let t = 0; t < this.T; t++) {
//                 this.compatible[i][t] = [0, 0, 0, 0]; // nitialize compatibility for each pattern in each direction, [up, right, down, left]
//             }
//         }

//         //Shannon information theory H(X)=−∑(p(x)⋅log p(x))
//         this.weightLogWeights = new Array(this.T);  // an array to store the product of each pattern's weight and its logarithm
//         this.sumOfWeights = 0;
//         this.sumOfWeightLogWeights = 0;

//         for (let t = 0; t < this.T; t++) {
//             this.weightLogWeights[t] = this.weights[t] * Math.log(this.weights[t]);
//             this.sumOfWeights += this.weights[t];
//             this.sumOfWeightLogWeights += this.weightLogWeights[t];
//         }

//         // console.log('Patterns:');
//         // for (let i = 0; i < this.T; i++) {
//         //   console.log(`Pattern ${i}:`, this.patterns[i]);
//         // }

//         this.initialEntropy = Math.log(this.sumOfWeights) - this.sumOfWeightLogWeights / this.sumOfWeights; // For use weight instead of probability to calculate entropy, entropy need to be normalized
//         this.sumsOfPatterns = new Array(this.FMXxFMY); // Array to store the sum of number of possible patterns at each cell
//         this.sumsOfWeights = new Array(this.FMXxFMY); // Array to store the sum of weights of possible patterns at each cell
//         this.sumsOfWeightLogWeights = new Array(this.FMXxFMY); // Array to store the sum of weightLogWeights of possible patterns at each cell
//         this.entropies = new Array(this.FMXxFMY); // Array to store the entropy at each cell
//         this.stack = new Array(this.FMXxFMY * this.T); // Array to store a pair of values: [i, t] that need to be processed during propagation (ban t from i). A stack operates on LIFO principle. the last element may not be the only constrained element, it is one of the most immediate constraints that need to be addressed, to ensure immediate consistency maintenance, prevent the accumulation of inconsistencies
//         this.stackSize = 0;
//     }

//     public observe(rng: () => number): boolean | null { // Select the cell with the lowest entropy to collapse next
//         let minEntropy = 1000;
//         let chosenCell = -1; // Store the index of the cell with the lowest entropy. Initialized to -1 to represent a non-existent cell index as a flag to indicate there is no cell has been selected yet.

//         // Loop over all cells
//         for (let i = 0; i < this.FMXxFMY; i++) {
//             if (this.onBoundary(i % this.FMX, Math.floor(i / this.FMX))) continue;  // Skip boundary cells

//             // Checking number of possible patterns
//             const possiblePatterns = this.sumsOfPatterns[i];
//             const entropy = this.entropies[i]; // Retrieve the entropy for cell i
//             console.log(`Cell ${i} entropy: ${entropy} `);//possible patterns: ${possiblePatterns}

//             // If possiblePatterns === 0, indicate there are no patterns possible for this cell, it is contradiction, the generation process cannot proceed if any cell has no valid patterns left.
//             if (possiblePatterns === 0) {
//                 console.log('Generation encountered a contradiction.');
//                 return false; // stop the observe
//             }

//             // If possiblePatterns > 1, indicate there are more than one pattern possible for this cell, continue to find the minimum entropy cell
//             if (possiblePatterns > 1 && entropy <= minEntropy) { // If the cell can still be collapsed && with the lowest entropy
//                 const noise = 0.000001 * rng(); // Without noise the algorithm might always pick the first cell with the minimum entropy, noise break ties between cells with the same entropy. rng, random number generator, select for the noise and randomIndice()
//                 if (entropy + noise < minEntropy) { // If entropy + noise is less than the current minEntropy
//                     minEntropy = entropy + noise; // Update minEntropy and chosenCell 
//                     chosenCell = i; // chosenCell hold the index of the cell with the lowest entropy
//                 }
//             }
//         }

//         // If no cell with more than one possible pattern was found, indicate all cells are already observed
//         if (chosenCell === -1) { // If chosenCell still -1, indicate no suitable cell was found in the loop above
//             this.observed = new Array(this.FMXxFMY);
//             for (let i = 0; i < this.FMXxFMY; i++) { // Loop all cells
//                 for (let t = 0; t < this.T; t++) { // Loop all patterns 
//                     if (this.wave[i][t]) { // to find the one that is still possible at cell i
//                         this.observed[i] = t; // fill the observed array with the final pattern indices
//                         break; // Exits the t loop once a possible pattern is found, since there should be only one pattern left
//                     }
//                 }
//             }
//             // console.log('Generation complete successfully.');
//             return true;  // Indicate the observation phase is complete
//         }

//         // console.log(`Collapsing cell ${chosenCell} with entropy ${minEntropy}`)

//         // Update the distribution array of the lowest entropy cell 'chosenCell', then selecte the pattern for the cell
//         for (let t = 0; t < this.T; t++) {
//             this.distribution[t] = this.wave[chosenCell][t] ? this.weights[t] : 0;  // If a pattern is possible, its weight is added to the distribution; otherwise to 0
//         }
//         // Selecte a pattern. 
//         const randomIndice = (array: number[], r: number) => {
//             let sum = 0;   // Variable to accumulate the total sum of the array's elements
//             let x = 0;     // Variable to track the cumulative sum of elements
//             let i = 0;     // Index variable

//             // Step 1: Calculate the sum of all the elements in the array
//             for (; i < array.length; i++) {
//                 sum += array[i];  // Accumulate the sum of array elements
//             }

//             i = 0;  // Reset the index for the next part of the logic
//             r *= sum;  // Scale the random value `r` by the sum of the array. This "maps" r to the total sum.

//             // Step 2: Select an index based on the scaled random value
//             while (r && i < array.length) {   // While we still have a valid `r` and haven't exhausted the array
//                 x += array[i];   // Increment the cumulative sum by the current array element
//                 if (r <= x) {    // If the random value `r` is less than or equal to the cumulative sum
//                     return i;      // We return the current index `i`
//                 }
//                 i++;  // Move to the next index
//             }

//             return 0;  // If no valid index was found (very unlikely), return 0
//         }

//         const r = randomIndice(this.distribution, rng()); // returns an index r corresponds to the selected pattern based on their weights
//         // Collapse the wave function at the selected cell (chosenCell) by banning all patterns except the selected one (r).
//         const w = this.wave[chosenCell];  // retrieves the wave array representing the possible patterns at cell chosenCell
//         for (let t = 0; t < this.T; t++) {
//             if (w[t] !== (t === r)) this.ban(chosenCell, t); // If pattern t is possible at cell chosenCell && the selected pattern r is t, so the condition is false and not call this.ban; but if t is possible here && r is not t, ban t from cell chosenCell; if w[t] is false, r must not t, also call this.ban
//         }
//         return null;  //indicate that a cell was collapsed and further propagation is needed
//     }

//     public propagate() {
//         // Propagation loop
//         while (this.stackSize > 0) {
//             // Get current cell 
//             const e1 = this.stack[this.stackSize - 1]; // Get the last element [i1,t1] in the stack to ban t1 from i1, processing the last element ensures that the most recent change (the most recently banned pattern) is propagated first, maintaining consistency in the wave function collapse
//             this.stackSize--; // Decreases the stack size to remove the last element from the stack
//             const i1 = e1[0]; // The index of current cell
//             const x1 = i1 % this.FMX;
//             const y1 = Math.floor(i1 / this.FMX); // The coordinates of this cell

//             // Process neighbor cells on 4 directions
//             for (let d = 0; d < 4; d++) { // Loop over the four directions
//                 const dx = this.DX[d]; // [-1, 0, 1, 0];
//                 const dy = this.DY[d]; // [0, 1, 0, -1];
//                 let x2 = x1 + dx;
//                 let y2 = y1 + dy; // The coordinates of the neighboring cell in the current direction

//                 if (this.onBoundary(x2, y2)) continue; // Adjust coordinates for periodic boundary conditions
//                 if (x2 < 0) x2 += this.FMX;
//                 else if (x2 >= this.FMX) x2 -= this.FMX;
//                 if (y2 < 0) y2 += this.FMY;
//                 else if (y2 >= this.FMY) y2 -= this.FMY;

//                 const i2 = x2 + y2 * this.FMX; // The index of the neighboring cell

//                 // Propagate constraints
//                 const p = this.propagator[d][e1[1]]; // Retrieve the list of patterns (p, array of [t2]) that are compatible with the pattern t1 at e1[1] in direction d
//                 const compat = this.compatible[i2]; // Retrieve the compatibility array (compat, array of [t2][d]) for the neighboring cell i2

//                 // Update compatibility and banning patterns
//                 for (let l = 0; l < p.length; l++) { // Loop over the compatible patterns (p) and decrement the compatibility count for direction d
//                     const t2 = p[l]; // Get the pattern t2 from the list of compatible patterns
//                     const comp = compat[t2]; // Get the compatibility array for pattern t2
//                     comp[d]--; // Decrease the compatibility count for direction d
//                     if (comp[d] == 0) this.ban(i2, t2); // If no compatible patterns remain, ban pattern t2 at cell i2 for cell i1 that they can't be neighbor
//                 }
//             }
//         }
//     }

//     // Most granular method to control single iteration of the algorithm
//     public singleIteration(rng: () => number): boolean | null {
//         const result = this.observe(rng); // 'true' (observe is complete) or 'null' (observe is incomplete and need to continue to propagate)

//         if (result !== null) { // Means the observation is complete, either successfully or with a contradiction
//             this.generationComplete = result; // 'true' (successfully) or 'false' (with contradiction)
//             // console.log(this.generationComplete);
//             return !!result;
//         }
//         this.generationComplete = null;
//         this.propagate();
//         return null;
//     }

//     // Higher-level method that wrap around singleIteration() to process interation in batch
//     public iterate(iterations: number, rng: () => number) {  // Run the wave function collapse algorithm for a specified number of iteration or indefinitely if iterations is 0
//         if (!this.wave) this.initialize(); // Ensures the grid and all necessary arrays initialized before starting iterations
//         if (!this.initiliazedField) this.clear(); // Prepares the model for a new generation by resetting the wave function, compatibility array, sums, and entropy

//         iterations = iterations || 0;

//         for (let i = 0; i < iterations || iterations === 0; i++) {
//             const result = this.singleIteration(rng);
//             if (result !== null) {
//                 return !!result;
//             }
//         }
//         return true;
//     }

//     // Highest-level method to fully complete the generation of WFC algorithm from start to finish in one go
//     public generate(rng: () => number): boolean | null {  //runs the WFC algorithm until it either successfully generates a complete pattern or encounters a contradiction
//         if (!this.wave) this.initialize();
//         this.clear();

//         while (true) {
//             const result = this.singleIteration(rng);
//             if (result !== null) {
//                 return !!result;
//             }
//         }
//     }

//     public isGenerationComplete(): boolean | null {
//         return this.generationComplete;
//     }

//     ban(i: number, t: number) { // ban a specific pattern at a specific cell and update the compatibility and entropy of the cell
//         // console.log(`Banning pattern ${t} at cell ${i}`);
//         const comp = this.compatible[i][t];
//         for (let d = 0; d < 4; d++) {
//             comp[d] = 0; // Set the compatibility count for each direction to zero, indicate that this pattern is no longer compatible in any direction at this cell
//         }

//         // Updata wave function for pattern t at cell
//         this.wave[i][t] = false; // false means this pattern is no longer possible at this cell
//         this.stack[this.stackSize] = [i, t];
//         this.stackSize++;

//         // Update sums and entropy
//         this.sumsOfPatterns[i] -= 1;
//         this.sumsOfWeights[i] -= this.weights[t];
//         this.sumsOfWeightLogWeights[i] -= this.weightLogWeights[t];

//         const sum = this.sumsOfWeights[i];
//         this.entropies[i] = Math.log(sum) - this.sumsOfWeightLogWeights[i] / sum;
//     }

//     public clear() { // Resets the internal state of the model to prepare for a new generation
//         // Initialize wave function
//         for (let i = 0; i < this.FMXxFMY; i++) {
//             for (let t = 0; t < this.T; t++) {
//                 this.wave[i][t] = true;  // All patterns are initially possible for every cell
//                 // Initialize compatibility
//                 for (let d = 0; d < 4; d++) {
//                     this.compatible[i][t][d] = this.propagator[this.opposite[d]][t].length;
//                 }
//             }

//             // Initialize sums and entropy
//             this.sumsOfPatterns[i] = this.weights.length;
//             this.sumsOfWeights[i] = this.sumOfWeights;
//             this.sumsOfWeightLogWeights[i] = this.sumOfWeightLogWeights;
//             this.entropies[i] = this.initialEntropy;
//         }

//         this.initiliazedField = true;
//         this.generationComplete = false;
//     }

//     onBoundary(x: number, y: number): boolean {
//         return false; // Default implementation, just a placeholder, should be overridden by subclasses, can be deleted
//     }


// }

// export class OverlappingModel extends Model {
//     private ground: number = 0;
//     private data: Uint8ClampedArray = new Uint8ClampedArray(0);;
//     // private N: number;
//     // private FMX: number;
//     // private FMY: number;
//     // private FMXxFMY: number;
//     private periodic?: boolean = false; // or periodicOutput name
//     private SMX: number = 0;
//     private SMY: number = 0;
//     private symmetry: number = 8;
//     private periodicOutput: boolean = false;
//     private periodicInput: boolean = false;


//     private colors: number[][] = [];

//     // private patterns: number[][] = [];


//     constructor(config: WFCConfig | null) {
//         super();
//         if (!config) return
//         this.ground = config.ground || 0;
//         this.data = config.data;
//         this.N = config.N;
//         this.FMX = config.outputWidth;  // The final map width (number of cells along the x-axis)
//         this.FMY = config.outputHeight; // The final map height (number of cells along the y-axis)
//         this.FMXxFMY = config.outputWidth * config.outputHeight;
//         this.periodic = config.periodicOutput;
//         this.symmetry = config.symmetry || 8;
//         this.periodicOutput = config.periodicOutput || false;

//         this.SMX = Math.floor(config.dataWidth); // The width of the sample map
//         this.SMY = Math.floor(config.dataHeight); // The height of the sample map

//         const sample = new Array(this.SMX); // sample[x][y] is a 2D array to present the index of each pixel tile in source image
//         for (let i = 0; i < this.SMX; i++) {
//             sample[i] = new Array(this.SMY);
//         }

//         this.colors = []; // An array that stores unique colors found in the source image
//         const colorMap: Record<string, number> = {}; // An object of key-value pairs that maps a color (represented as a string) to an index in the this.colors array

//         // Processing the image data
//         for (let y = 0; y < this.SMY; y++) {
//             for (let x = 0; x < this.SMX; x++) {
//                 const indexPixel = (y * this.SMX + x) * 4;
//                 const color = [this.data[indexPixel], this.data[indexPixel + 1], this.data[indexPixel + 2], this.data[indexPixel + 3]];
//                 const colorMapIndex = color.join('-');
//                 // color:[255, 0, 0, 255] => colorMapIndex: "255-0-0-255"

//                 if (!colorMap.hasOwnProperty(colorMapIndex)) {
//                     colorMap[colorMapIndex] = this.colors.length;
//                     this.colors.push(color);
//                 }

//                 sample[x][y] = colorMap[colorMapIndex]; // Map color to its index in the colors array, = 0,1,2,3...
//             }
//         }


//         const C = this.colors.length;
//         const W = Math.pow(C, this.N * this.N); // the theoretical maximum number of unique patterns that can be formed using the N x N window

//         const pattern = (f: (x: number, y: number) => number) => {
//             // A pattern in WFC is an array representing a sequence of tiles or colors(pixels)
//             let result = new Array(this.N * this.N);
//             for (let y = 0; y < this.N; y++) {
//                 for (let x = 0; x < this.N; x++) {
//                     result[x + y * this.N] = f(x, y); // Sets the value at position (x, y) in the grid by calling the function f(x, y).
//                 }
//             }
//             return result; // Represent the pattern as a 1D array
//         };

//         const patternFromSample = (x: number, y: number) => {  //(x, y) is the starting coordinate in the sample array
//             return pattern((dx, dy) => {  // (dx, dy) represent positions of each grid in N*N window grid
//                 return sample[(x + dx) % this.SMX][(y + dy) % this.SMY];  //return N*N sample[][] in an array as the data of a pattern
//             });
//         };

//         const rotate = (p: number[]) => {  // p is a pattern
//             return pattern((x, y) => {
//                 return p[this.N - 1 - y + x * this.N];  // performs a 90-degree rotation
//             });
//         };

//         const reflect = (p: number[]) => {  // p is a pattern
//             return pattern((x, y) => {
//                 return p[this.N - 1 - x + y * this.N];  //performs a horizontal reflection
//             });
//         };

//         const index = (p: number[]) => {
//             //method of converting a sequence of values into a single integer by treating it as a number in C-decimal.
//             let result = 0;
//             let power = 1;
//             for (let i = 0; i < p.length; i++) {
//                 result += p[p.length - 1 - i] * power;
//                 power *= C;
//             }
//             return result;
//         };

//         const patternFromIndex = (ind: number) => {  //convert a integer in C-decimal back to pattern
//             let residue = ind;
//             let power = W;
//             const result = new Array(this.N * this.N);
//             for (let i = 0; i < result.length; i++) {
//                 power /= C;
//                 let count = 0;
//                 while (residue >= power) {
//                     residue -= power;
//                     count++;
//                 }
//                 result[i] = count;
//             }
//             return result;
//         };

//         const weights: Record<string, number> = {};
//         const weightsKeys: string[] = []; // Object.keys won't preserve the order of creation, so we store them separately in an array

//         for (let y = 0; y < (this.periodicInput ? this.SMY : this.SMY - this.N + 1); y++) {
//             for (let x = 0; x < (this.periodicInput ? this.SMX : this.SMX - this.N + 1); x++) {
//                 const ps = new Array(8);
//                 ps[0] = patternFromSample(x, y);
//                 ps[1] = reflect(ps[0]);
//                 ps[2] = rotate(ps[0]);
//                 ps[3] = reflect(ps[2]);
//                 ps[4] = rotate(ps[2]);
//                 ps[5] = reflect(ps[4]);
//                 ps[6] = rotate(ps[4]);
//                 ps[7] = reflect(ps[6]);

//                 for (let k = 0; k < this.symmetry; k++) {
//                     const ind = index(ps[k]);
//                     if (!!weights[ind]) {
//                         weights[ind]++;
//                     } else {
//                         weightsKeys.push(ind.toString());  //keep each unique pattern with sequence
//                         weights[ind] = 1;
//                     }
//                 }
//             }
//         }

//         this.T = weightsKeys.length;
//         this.ground = this.ground % this.T; //Ensures ground within range of unique patterns (0 to this.T - 1)
//         this.patterns = new Array(this.T); //Initialize patterns array  [ , , ...]
//         this.weights = new Array(this.T); //Initialize weights array  [ , , ...]

//         for (let t = 0; t < this.T; t++) {
//             const w = parseInt(weightsKeys[t], 10); //ensure the number in weightKeys presented in decimal
//             this.patterns[t] = patternFromIndex(w); //convert the integer back to the pattern data, a 1D array
//             this.weights[t] = weights[w];
//         }


//         this.propagator = new Array(4);  //Initialize propagator array for 4 directions. it is a 3D array [d][t1][t2], used to store which patterns t2 that are compatible with t1 (at current cell) in direction d

//         for (let d = 0; d < 4; d++) {  //loop over 4 directions
//             this.propagator[d] = new Array(this.T);  //2D array, [t1][t2], at this direction
//             for (let t1 = 0; t1 < this.T; t1++) {
//                 const list = [];
//                 for (let t2 = 0; t2 < this.T; t2++) {  //loop over each pattern again
//                     if (this.agrees(this.patterns[t1], this.patterns[t2], this.DX[d], this.DY[d])) {
//                         list.push(t2);
//                     }
//                 }
//                 this.propagator[d][t1] = list;
//             }
//         }
//     }

//     agrees(p1: number[], p2: number[], dx: number, dy: number) { //Two patterns to be compared: p1,p2; offsets in x and y axis: dx,dy
//         const xmin = dx < 0 ? 0 : dx;
//         const xmax = dx < 0 ? dx + this.N : this.N;
//         const ymin = dy < 0 ? 0 : dy;
//         const ymax = dy < 0 ? dy + this.N : this.N;

//         for (let y: number = ymin; y < ymax; y++) {  //this (x,y) is one element's position within the pattern, not global 
//             for (let x: number = xmin; x < xmax; x++) {
//                 //if don't allow tolerance between colors, strict check if the same color, use the following code
//                 if (p1[x + this.N * y] != p2[x - dx + this.N * (y - dy)]) {
//                     return false;
//                 }
//             }
//         }
//         return true;
//     };

//     onBoundary(x: number, y: number) {
//         return !this.periodic && (x + this.N > this.FMX || y + this.N > this.FMY || x < 0 || y < 0);
//     }

//     clear() {
//         super.clear();
//         // console.log("Clearing model with ground:", this.ground);

//         if (this.ground !== 0) {
//             for (let x = 0; x < this.FMX; x++) {  //each column x of the bottom row
//                 for (let t = 0; t < this.T; t++) {  //iterates over all patterns t
//                     if (t !== this.ground) {  //If pattern t is not ground pattern
//                         console.log(`Banning pattern ${t} at (${x}, ${this.FMY - 1})`);
//                         this.ban(x + (this.FMY - 1) * this.FMX, t);  // bans the pattern t at position (x, FMY - 1).
//                     }

//                     for (let y = 0; y < this.FMY - 1; y++) {  //each row y except for the bottom row
//                         // console.log(`Banning ground pattern ${this.ground} at (${x}, ${y})`);
//                         this.ban(x + y * this.FMX, this.ground);  //bans the ground pattern at position (x, y).
//                     }
//                 }
//                 this.propagate();
//             }
//         }
//     }

//     graphics(array: Uint8ClampedArray) {
//         array = array || new Uint8ClampedArray(this.FMXxFMY * 4);
//         if (this.isGenerationComplete()) {
//             this.graphicsComplete(array);
//         }
//         else {
//             this.graphicsIncomplete(array);
//         }
//         return array;
//     }

//     graphicsComplete(array: Uint8ClampedArray) {
//         for (let y = 0; y < this.FMY; y++) {
//             const dy = y < this.FMY - this.N + 1 ? 0 : this.N - 1;  //for Boundary handling
//             for (let x = 0; x < this.FMX; x++) {
//                 const dx = x < this.FMX - this.N + 1 ? 0 : this.N - 1;  //for Boundary handling

//                 const pixelIndex = (y * this.FMX + x) * 4;
//                 // if (this.observed !== null) {
//                 const color = this.colors[this.patterns[this.observed[x - dx + (y - dy) * this.FMX]][dx + dy * this.N]];
//                 // const color = this.colors[this.patterns[(this.observed as number[])[x - dx + (y - dy) * this.FMX]][dx + dy * this.N]];
//                 array[pixelIndex] = color[0];
//                 array[pixelIndex + 1] = color[1];
//                 array[pixelIndex + 2] = color[2];
//                 array[pixelIndex + 3] = color[3];
//                 // }
//             }
//         }
//     }

//     graphicsIncomplete(array: Uint8ClampedArray) {
//         for (let i = 0; i < this.FMXxFMY; i++) {
//             const x = i % this.FMX;
//             const y = Math.floor(i / this.FMX);

//             let contributors = 0;  //Initialize variables for averaging colors
//             let r = 0;
//             let g = 0;
//             let b = 0;
//             let a = 0;

//             for (let dy = 0; dy < this.N; dy++) {
//                 for (let dx = 0; dx < this.N; dx++) {
//                     let sx = x - dx;
//                     if (sx < 0) sx += this.FMX;

//                     let sy = y - dy;
//                     if (sy < 0) sy += this.FMY;  // If sx or sy out of bounds, they are wrapped around using the modulus operation

//                     if (this.onBoundary(sx, sy)) continue;  //Skip tiles on the boundary

//                     const s = sx + sy * this.FMX;  //Calculate the index s in the wave array corresponding to the adjusted coordinates

//                     for (let t = 0; t < this.T; t++) {
//                         if (this.wave[s][t]) {  //if the pattern t is possible at the sample index s
//                             contributors++;
//                             const color = this.colors[this.patterns[t][dx + dy * this.N]];
//                             r += color[0];
//                             g += color[1];
//                             b += color[2];
//                             a += color[3];
//                         }
//                     }
//                 }
//             }

//             const pixelIndex = i * 4;
//             array[pixelIndex] = r / contributors;
//             array[pixelIndex + 1] = g / contributors;
//             array[pixelIndex + 2] = b / contributors;
//             array[pixelIndex + 3] = a / contributors;
//         }
//     }

// }


// model.ts
/* eslint-disable @typescript-eslint/no-non-null-assertion */



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
            if (amount === 0) return false;

            const entropy = this.entropies[i];
            if (amount > 1 && entropy <= min) {
                const noise = 0.000001 * rng();
                if (entropy + noise < min) {
                    min = entropy + noise;
                    argmin = i;
                }
            }
        }

        console.log(`Lowest entropy cell: ${argmin} with entropy ${min}`);

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
    private ground: number;

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
     * @param ground    tile index to pin at the bottom (optional)
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
        symmetry: number,
        ground = 0
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
        this.ground = (ground + this.T) % this.T;
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
     * Clear the internal state and, if ground is set, constrain the bottom row.
     */
    public override clear(): void {
        super.clear();

        if (this.ground !== 0) {
            for (let x = 0; x < this.FMX; x++) {
                for (let t = 0; t < this.T; t++) {
                    if (t !== this.ground) {
                        this.ban(x + (this.FMY - 1) * this.FMX, t);
                    }
                }
                for (let y = 0; y < this.FMY - 1; y++) {
                    this.ban(x + y * this.FMX, this.ground);
                }
            }
            this.propagate();
        }
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

