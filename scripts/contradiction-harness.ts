import fs from "node:fs";
import AnalyzeForWFC from "../src/domain/sample/analyze-for-wfc.ts";
import { OverlappingModel } from "../src/domain/wfc/wfc-algorithm.ts";
import { rectsToPixels } from "../src/domain/render/pixels.ts";
import { PRNG32, mixSeed } from "../src/helpers/prng.ts";
import { computeSeed32 } from "../src/helpers/seed.ts";
import { isqrtRound } from "../src/helpers/fixed-point.ts";

const alphabet = "abcdefghijklmnopqrstuvwxyz";

const MAX_TEXT_LEN = 23;
const SEED_TAG_SAMPLE = 0x53414d50;
const SEED_TAG_WFC = 0x57464330;

const BASE_TEXTS = [
  "h",
  "hi",
  "hi this",
  "hello world",
  "thought look svg",
  "abcd efgh ijkl",
  "abc def ghi",
  "hello hello hel",
  "abcd abcd abcd ab",
  "gysy go zb",
  "a b c d e f",
  "abc  def",
  "abc\nxyz",
  "a\nb\nc",
  "abcdefghijklmnopqrstuvw",
  "aaaaa bbbbb ccccc",
];

const getArg = (name: string, fallback?: string) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const count = Number.parseInt(getArg("--count", "5") ?? "5", 10);
const tries = Number.parseInt(getArg("--tries", "200") ?? "200", 10);
const outPath = getArg("--out", "");
const accountAddress = (getArg("--account", "0") ?? "0").trim().toLowerCase();
const indexStart = Number.parseInt(getArg("--index-start", "0") ?? "0", 10);

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

const buildTexts = (): string[] => {
  const texts = [...BASE_TEXTS];
  for (let len = 10; len <= 18; len += 2) {
    texts.push(buildUniqueRun(len));
    texts.push(buildWordBlocks(len, 4));
  }
  return texts;
};

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
  return { ok, blackHoleCell: model.getBlackHoleCell(), baseSeed };
};

const findContradictions = () => {
  const results: Array<{
    text: string;
    index: string;
    baseSeed: number;
    gridSize: number;
    blackHoleCell: number | null;
  }> = [];

  const texts = buildTexts();

  for (const textRaw of texts) {
    const text = sanitizeText(textRaw);
    if (!text) continue;
    for (let i = 0; i < tries && results.length < count; i += 1) {
      const index = String(indexStart + i);
      const result = runOnce(text, index);
      if (!result.ok) {
        results.push({
          text,
          index,
          baseSeed: result.baseSeed,
          gridSize: gridSize(text),
          blackHoleCell: result.blackHoleCell,
        });
      }
    }
    if (results.length >= count) break;
  }

  let attempts = 0;
  while (results.length < count && attempts < tries * 10) {
    const textRaw = randomText(6, MAX_TEXT_LEN);
    const text = sanitizeText(textRaw);
    if (!text) {
      attempts += 1;
      continue;
    }
    const index = String(indexStart + attempts);
    const result = runOnce(text, index);
    if (!result.ok) {
      results.push({
        text,
        index,
        baseSeed: result.baseSeed,
        gridSize: gridSize(text),
        blackHoleCell: result.blackHoleCell,
      });
    }
    attempts += 1;
  }

  return results;
};

const formatMarkdown = (items: ReturnType<typeof findContradictions>) => {
  const lines: string[] = [];
  lines.push("# Contradiction Harness Results");
  lines.push("");
  lines.push("| Text | account_address | index | grid | black hole cell | base seed |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of items) {
    const cell = item.blackHoleCell === null ? "-" : String(item.blackHoleCell);
    lines.push(
      `| ${item.text} | ${accountAddress} | ${item.index} | ${item.gridSize} | ${cell} | ${item.baseSeed} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

const main = () => {
  const items = findContradictions();
  if (!items.length) {
    console.log("No contradictions found.");
    return;
  }

  console.log("Contradictions found:");
  for (const item of items) {
    console.log(`- text: ${item.text}`);
    console.log(`  account_address: ${accountAddress}`);
    console.log(`  index: ${item.index}`);
    console.log(`  base seed: ${item.baseSeed}`);
    if (item.blackHoleCell !== null) {
      console.log(`  black hole cell: ${item.blackHoleCell}`);
    }
  }

  if (outPath) {
    if (outPath.endsWith(".json")) {
      fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
    } else if (outPath.endsWith(".md")) {
      fs.writeFileSync(outPath, formatMarkdown(items));
    } else {
      throw new Error("--out must be .json or .md");
    }
    console.log(`\nWrote ${outPath}`);
  }
};

main();
