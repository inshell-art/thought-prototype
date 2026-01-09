import fs from "node:fs";
import AnalyzeForWFC from "../src/domain/sample/analyze-for-wfc.ts";
import { OverlappingModel } from "../src/domain/wfc/wfc-algorithm.ts";
import { rectsToPixels } from "../src/domain/render/pixels.ts";
import { PRNG } from "../src/helpers/prng.ts";

const alphabet = "abcdefghijklmnopqrstuvwxyz";

const BASE_TEXTS = [
  "hi this",
  "hello world",
  "thought look svg",
  "abcd efgh ijkl",
  "abc def ghi",
  "hello hello hel",
  "abcd abcd abcd ab",
  "gysy go zb",
];

const getArg = (name: string, fallback?: string) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const count = Number.parseInt(getArg("--count", "5") ?? "5", 10);
const tries = Number.parseInt(getArg("--tries", "200") ?? "200", 10);
const outPath = getArg("--out", "");

const gridSize = (text: string): number =>
  text.length > 5
    ? Math.round(5 + Math.sqrt(text.length - 5))
    : text.length + 1;

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
  return { ok, blackHoleCell: model.getBlackHoleCell(), seedKey };
};

const findContradictions = () => {
  const results: Array<{
    text: string;
    tokenId: string;
    seedKey: string;
    gridSize: number;
    blackHoleCell: number | null;
  }> = [];

  const texts = buildTexts();

  for (const text of texts) {
    for (let i = 0; i < tries && results.length < count; i += 1) {
      const tokenId = String(i);
      const result = runOnce(text, tokenId);
      if (!result.ok) {
        results.push({
          text,
          tokenId,
          seedKey: result.seedKey,
          gridSize: gridSize(text),
          blackHoleCell: result.blackHoleCell,
        });
      }
    }
    if (results.length >= count) break;
  }

  let attempts = 0;
  while (results.length < count && attempts < tries * 10) {
    const text = randomText(8, 32);
    const tokenId = String(attempts);
    const result = runOnce(text, tokenId);
    if (!result.ok) {
      results.push({
        text,
        tokenId,
        seedKey: result.seedKey,
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
  lines.push("| Text | token_id | grid | black hole cell | seed key |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of items) {
    const cell = item.blackHoleCell === null ? "-" : String(item.blackHoleCell);
    lines.push(`| ${item.text} | ${item.tokenId} | ${item.gridSize} | ${cell} | ${item.seedKey} |`);
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
    console.log(`  token_id: ${item.tokenId}`);
    console.log(`  seed key: ${item.seedKey}`);
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
