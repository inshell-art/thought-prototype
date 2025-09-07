
const splitWords = (input: string): string[] => {
    return input.match(/^\s+|[^\s]+(?:\s+)?/g) ?? []; // keep all words including spaces
}//=> input.split(/\s+/).filter((item) => item.trim() !== "");// delete white spaces
const longest = (arr: string[]): number => arr.reduce((maxLength, word) => Math.max(maxLength, word.length), 0);

const randomCol = (rnd: () => number): RGBA => {
    const r = Math.floor(rnd() * 256);
    const g = Math.floor(rnd() * 256);
    const b = Math.floor(rnd() * 256);
    return { r, g, b, a: 255 };
}

const AnalyzeForWFC = (thought: string, rnd: () => number): ThoughtData => {
    const wordsRaw = splitWords(thought);
    const chars: CharData[] = [];
    const palette: RGBA[] = [];

    const charColors: Record<string, RGBA> = {};

    wordsRaw.forEach((word, wordIdx) => {
        [...word].forEach((ch, x) => {
            if (!charColors[ch]) {
                ch.trim() === "" ? charColors[ch] =
                    // { r: 0, g: 0, b: 0, a: 0 }
                    { r: 255, g: 255, b: 255, a: 255 }
                    // canvasBg
                    : charColors[ch] = randomCol(rnd);
            }
            chars.push({
                ch,
                x,
                y: wordIdx,
                charCol: charColors[ch]
            });
        });
    });


    return {
        thoughtStr: thought,
        chars,
        palette,
        wordMaxLength: longest(wordsRaw),
        wordCount: wordsRaw.length,
    };
};

export default AnalyzeForWFC;

export interface CharData {
    ch: string;
    x: number;
    y: number;
    charCol: RGBA;
}

export interface ThoughtData {
    thoughtStr: string;
    chars: CharData[];
    palette: RGBA[];
    wordMaxLength: number;
    wordCount: number;
}

export type RGBA = {
    r: number;
    g: number;
    b: number;
    a: number;
};