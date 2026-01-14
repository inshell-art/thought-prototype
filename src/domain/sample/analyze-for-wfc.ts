import type { RNG32 } from "../../helpers/prng";
import { rngByte } from "../../helpers/prng";

const splitWords = (input: string): string[] => {
    const words: string[] = [];
    let i = 0;
    let curr = "";

    const pushCurr = () => {
        words.push(curr);
        curr = "";
    };

    while (i < input.length) {
        const ch = input[i];
        if (ch === "\n") {
            pushCurr();
            i += 1;
            continue;
        }
        if (ch === " ") {
            let j = i;
            while (j < input.length && input[j] === " ") j++;

            const count = j - i;
            if (curr.length > 0) {
                pushCurr();
                const leading = count - 1;
                if (leading > 0) {
                    curr = " ".repeat(leading); // start next token with those spaces
                }
            } else {
                curr += " ".repeat(count);
            }
            i = j;
            continue;
        }
        curr += ch;
        i += 1;
    }

    // Push the last token (even if it's spaces-only — we preserve intent)
    if (curr.length > 0) pushCurr();

    return words;
};

const longest = (arr: string[]): number => arr.reduce((maxLength, word) => Math.max(maxLength, word.length), 0);

const randomCol = (rnd: RNG32): RGBA => {
    const r = rngByte(rnd);
    const g = rngByte(rnd);
    const b = rngByte(rnd);
    return { r, g, b, a: 255 };
}

const AnalyzeForWFC = (thought: string, rnd: RNG32): ThoughtData => {
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
