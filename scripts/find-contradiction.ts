import AnalyzeForWFC from "../src/domain/sample/analyze-for-wfc.ts";
import { OverlappingModel } from "../src/domain/wfc/wfc-algorithm.ts";
import { rectsToPixels } from "../src/domain/render/pixels.ts";
import { PRNG } from "../src/helpers/prng.ts";

const BASE_CANDIDATES = [
  "hello hello hel",
  "hello hello hello",
  "abcd abcd abcd ab",
  "abcd efgh ijkl",
  "abcd efgh ijkl mnop",
  "abc def ghi jkl mno",
  "thought look svg",
  "abcdefghijklmnop",
  "abcdefghijklmnopqrst",
  "abacabadabacaba",
  "aaaaabbbbbccccc",
];

const alphabet = "abcdefghijklmnopqrstuvwxyz";

const buildUniqueRun = (len: number): string => {
  let out = "";
  while (out.length < len) out += alphabet;
  return out.slice(0, len);
};

const buildWordBlocks = (len: number, block = 4): string => {
  let remaining = len;
  let offset = 0;
  const parts: string[] = [];
  while (remaining > 0) {
    const size = Math.min(block, remaining);
    let word = "";
    for (let i = 0; i < size; i += 1) {
      word += alphabet[(offset + i) % alphabet.length];
    }
    parts.push(word);
    offset += size;
    remaining -= size;
  }
  return parts.join(" ");
};

const buildCandidates = (): string[] => {
  const extra: string[] = [];
  for (let len = 10; len <= 18; len += 2) {
    extra.push(buildUniqueRun(len));
    extra.push(buildWordBlocks(len, 4));
  }
  return [...BASE_CANDIDATES, ...extra];
};

const randomText = (minLen: number, maxLen: number): string => {
  const target = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
  let out = "";
  while (out.length < target) {
    if (Math.random() < 0.18 && out.length > 0 && out[out.length - 1] !== " ") {
      out += " ";
    } else {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return out.trim().replace(/\s+/g, " ");
};

const gridSize = (text: string): number =>
  text.length > 5
    ? Math.round(5 + Math.sqrt(text.length - 5))
    : text.length + 1;

const runOnce = (text: string, tokenId: string) => {
  const seedKey = tokenId + text;
  const trnd = PRNG(seedKey);
  const thought = AnalyzeForWFC(text, trnd);

  const n = gridSize(text);
  const tilePx = 2;
  const sampleBuf = rectsToPixels(thought, tilePx);

  const model = new OverlappingModel(
    sampleBuf,
    thought.wordMaxLength * tilePx,
    thought.wordCount * tilePx,
    2,
    n,
    n,
    true,
    true,
    8,
  );

  const lrnd = PRNG(seedKey);
  const ok = model.generate(lrnd);
  const blackHoleCell = model.getBlackHoleCell();
  return { ok, blackHoleCell };
};

const main = () => {
  const candidates = buildCandidates();
  const seedsPerCandidate = 50;

  for (const text of candidates) {
    let contradictions = 0;
    let exampleSeed = "";
    let exampleCell: number | null = null;

    for (let i = 0; i < seedsPerCandidate; i += 1) {
      const tokenId = String(i);
      const result = runOnce(text, tokenId);
      if (!result.ok) {
        contradictions += 1;
        if (!exampleSeed) {
          exampleSeed = tokenId;
          exampleCell = result.blackHoleCell;
        }
      }
    }

    if (contradictions > 0) {
      console.log("Contradiction found:");
      console.log(`  text: ${text}`);
      console.log(`  seeds tested: ${seedsPerCandidate}`);
      console.log(`  contradiction count: ${contradictions}`);
      if (exampleSeed) {
        console.log(`  example token_id: ${exampleSeed}`);
      }
      if (exampleCell !== null) {
        console.log(`  example black hole cell: ${exampleCell}`);
      }
      return;
    }
  }

  const randomAttempts = 2000;
  for (let attempt = 0; attempt < randomAttempts; attempt += 1) {
    const text = randomText(8, 32);
    const tokenId = String(attempt);
    const result = runOnce(text, tokenId);
    if (!result.ok) {
      console.log("Contradiction found in random search:");
      console.log(`  text: ${text}`);
      console.log(`  example token_id: ${tokenId}`);
      if (result.blackHoleCell !== null) {
        console.log(`  example black hole cell: ${result.blackHoleCell}`);
      }
      return;
    }
  }

  console.log("No contradictions found in the current sweep or random search.");
};

main();
