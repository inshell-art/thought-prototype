import { layoutSVG } from "./domain/render/layout-svg";
import { charSrcPreview, outputPreview } from "./domain/render/preview";
import { PRNG } from "./helpers/prng";
import AnalyzeForWFC from "./domain/sample/analyze-for-wfc";
import type { ThoughtData } from "./domain/sample/analyze-for-wfc";
import { DownloadSVG } from "./helpers/download-svg";
import { patternPreview } from "./domain/render/preview";
import type { WFCCfgProps } from "./domain/wfc/wfc-algorithm";

// --- augment your storage for previous state
const storage = {
  account_address: "",
  index: "0",
  thoughtStr: "",
  length: 0,
  model: null,
  cfg: {} as WFCCfgProps,
  wfcOutput: new Uint8ClampedArray(0),
  svg: "",
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;
const accountBox = document.getElementById("account-address") as HTMLInputElement;
const indexBox = document.getElementById("index-id") as HTMLInputElement;
const generateButton = document.getElementById("btn-generate") as HTMLButtonElement;
const warningBox = document.getElementById("input-warning") as HTMLElement;
const indexUpButton = document.getElementById("btn-index-up") as HTMLButtonElement;
const indexDownButton = document.getElementById("btn-index-down") as HTMLButtonElement;

accountBox.value = storage.account_address;
indexBox.value = storage.index;
warningBox.textContent = "";

const MAX_TEXT_LEN = 23;

// save the svg as local file
document.getElementById("btn-save-svg")!.addEventListener("click", () => DownloadSVG(storage.svg));

const copyButton = document.getElementById("btn-copy-svg");
copyButton?.addEventListener("click", async () => {
  const text = storage.svg || (document.getElementById("svg-code") as HTMLElement)?.textContent || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
});

// 1) Explicit trigger (Enter only)
inputBox.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    void triggerFromInput();
  }
});

generateButton?.addEventListener("click", () => {
  void triggerFromInput();
});

const normalizeInput = (text: string): string => {
  return text
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => {
      const noLeading = line.replace(/^ +/g, "");
      const collapsed = noLeading.replace(/(\S) +(?=\S)/g, "$1 ");
      return collapsed.replace(/ +$/g, "");
    })
    .join("\n");
};

const normalizeAccountAddress = (text: string): string => {
  return text.trim().replace(/\s+/g, "").toLowerCase();
};

const setInputWarning = (message: string) => {
  warningBox.textContent = message;
};

const clampIndex = (value: number) => Math.max(0, value);

const setIndexValue = (value: number) => {
  const clamped = clampIndex(value);
  indexBox.value = String(clamped);
  storage.index = String(clamped);
};

accountBox.addEventListener("input", () => {
  const normalized = normalizeAccountAddress(accountBox.value);
  if (normalized !== accountBox.value) {
    accountBox.value = normalized;
  }
  storage.account_address = normalized || "0";
});

indexBox.addEventListener("input", () => {
  const digitsOnly = indexBox.value.replace(/\D+/g, "");
  if (digitsOnly !== indexBox.value) {
    indexBox.value = digitsOnly;
  }
  storage.index = digitsOnly || "0";
});

indexUpButton?.addEventListener("click", () => {
  const current = Number.parseInt(indexBox.value || "0", 10);
  setIndexValue(Number.isFinite(current) ? current + 1 : 1);
});

indexDownButton?.addEventListener("click", () => {
  const current = Number.parseInt(indexBox.value || "0", 10);
  setIndexValue(Number.isFinite(current) ? current - 1 : 0);
});

// helper to update storage + run your existing pipeline
function triggerFromInput() {
  setInputWarning("");

  const normalizedAccount = normalizeAccountAddress(accountBox.value);
  if (normalizedAccount !== accountBox.value) {
    accountBox.value = normalizedAccount;
  }
  storage.account_address = normalizedAccount || "0";

  const indexDigits = indexBox.value.replace(/\D+/g, "");
  if (indexDigits !== indexBox.value) {
    indexBox.value = indexDigits;
  }
  storage.index = indexDigits || "0";

  const normalizedText = normalizeInput(inputBox.value);
  if (normalizedText !== inputBox.value) {
    inputBox.value = normalizedText;
  }
  if (normalizedText.length > MAX_TEXT_LEN) {
    setInputWarning(`Max ${MAX_TEXT_LEN} characters after trimming/collapsing spaces.`);
    return;
  }

  storage.thoughtStr = normalizedText;
  storage.length = storage.thoughtStr.length;
  const seedKey = `${storage.account_address}:${storage.index}:${storage.thoughtStr}`;

  const trnd = PRNG(seedKey);
  const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

  render(thoughtData);
  previewPanel(thoughtData);

}

function render(thoughtData: ThoughtData) {
  const seedKey = `${storage.account_address}:${storage.index}:${storage.thoughtStr}`;
  const wfcRnd = PRNG(seedKey);
  const visualRnd = PRNG(`${seedKey}|visual`);
  const svg = layoutSVG(storage, thoughtData, wfcRnd, visualRnd);
  (document.getElementById("THOUGHT-canvas") as HTMLElement).innerHTML = svg;
  storage.svg = svg;
}

function previewPanel(thoughtData: ThoughtData) {
  if (storage.model && storage.cfg) {
    outputPreview(
      storage.wfcOutput,
      storage.cfg.outputWidth,
      storage.cfg.outputHeight,
      10,
      "wfc-output-preview"
    );
    document.getElementById("source-preview")!.innerHTML = charSrcPreview(thoughtData);
    document.getElementById("pattern-preview")!.innerHTML = patternPreview(storage.model);
    (document.getElementById("svg-code") as HTMLElement).textContent = storage.svg;
  }
}
