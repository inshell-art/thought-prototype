import AnalyzeForWFC from "../src/domain/sample/analyze-for-wfc.ts";
import { OverlappingModel } from "../src/domain/wfc/wfc-algorithm.ts";
import { rectsToPixels } from "../src/domain/render/pixels.ts";
import { PRNG32, mixSeed } from "../src/helpers/prng.ts";
import { computeSeed32 } from "../src/helpers/seed.ts";
import { isqrtRound } from "../src/helpers/fixed-point.ts";

const MAX_TEXT_LEN = 23;
const SEED_TAG_SAMPLE = 0x53414d50;
const SEED_TAG_WFC = 0x57464330;

const BASE_CANDIDATES = [
  "h",
  "hi",
  "hello hello hel",
  "hello hello hello",
  "abcd abcd abcd ab",
  "abcd efgh ijkl",
  "abcd efgh ijkl mnop",
  "abc def ghi jkl mno",
  "thought look svg",
  "abc\nxyz",
  "a\nbb\na",
  "a\nbbb\na",
  "ab\nc",
  "ab\ncc\nab",
  "a b c d e f",
  "abc  def",
  "abcdefghijklmnop",
  "abcdefghijklmnopqrst",
  "abcdefghijklmnopqrstuvw",
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

const normalizeInput = (text: string): string =>
  text
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => {
      const noLeading = line.replace(/^ +/g, "");
      const collapsed = noLeading.replace(/(\S) +(?=\S)/g, "$1 ");
      return collapsed.replace(/ +$/g, "");
    })
    .join("\n");

const sanitizeText = (text: string): string | null => {
  const normalized = normalizeInput(text);
  if (!normalized) return null;
  if (normalized.length > MAX_TEXT_LEN) return null;
  return normalized;
};

const gridSize = (text: string): number =>
  text.length > 5 ? 5 + isqrtRound(text.length - 5) : text.length + 1;

const accountAddress = (process.env.ACCOUNT_ADDRESS ?? "0").trim().toLowerCase();

const runOnce = (text: string, index: string) => {
  const baseSeed = computeSeed32(accountAddress, index, text);
  const trnd = PRNG32(mixSeed(baseSeed, SEED_TAG_SAMPLE));
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

  const lrnd = PRNG32(mixSeed(baseSeed, SEED_TAG_WFC));
  const ok = model.generate(lrnd);
  const blackHoleCell = model.getBlackHoleCell();
  return { ok, blackHoleCell, baseSeed };
};

const main = () => {
  const candidates = buildCandidates();
  const seedsPerCandidate = Number.parseInt(
    process.env.SEEDS_PER_CANDIDATE ?? "50",
    10,
  );

  for (const rawText of candidates) {
    const text = sanitizeText(rawText);
    if (!text) continue;
    let contradictions = 0;
    let exampleIndex = "";
    let exampleCell: number | null = null;

    for (let i = 0; i < seedsPerCandidate; i += 1) {
      const index = String(i);
      const result = runOnce(text, index);
      if (!result.ok) {
        contradictions += 1;
        if (!exampleIndex) {
          exampleIndex = index;
          exampleCell = result.blackHoleCell;
        }
      }
    }

    if (contradictions > 0) {
      console.log("Contradiction found:");
      console.log(`  text: ${text}`);
      console.log(`  account_address: ${accountAddress}`);
      console.log(`  seeds tested: ${seedsPerCandidate}`);
      console.log(`  contradiction count: ${contradictions}`);
      if (exampleIndex) {
        console.log(`  example index: ${exampleIndex}`);
      }
      if (exampleCell !== null) {
        console.log(`  example black hole cell: ${exampleCell}`);
      }
      return;
    }
  }

  const randomAttempts = Number.parseInt(
    process.env.RANDOM_ATTEMPTS ?? "2000",
    10,
  );
  for (let attempt = 0; attempt < randomAttempts; attempt += 1) {
    const rawText = randomText(6, MAX_TEXT_LEN);
    const text = sanitizeText(rawText);
    if (!text) continue;
    const index = String(attempt);
    const result = runOnce(text, index);
    if (!result.ok) {
      console.log("Contradiction found in random search:");
      console.log(`  text: ${text}`);
      console.log(`  account_address: ${accountAddress}`);
      console.log(`  example index: ${index}`);
      if (result.blackHoleCell !== null) {
        console.log(`  example black hole cell: ${result.blackHoleCell}`);
      }
      return;
    }
  }

  console.log("No contradictions found in the current sweep or random search.");
};

main();
