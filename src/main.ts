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
  token_id: Math.floor(Math.random() * 1e7).toString(),
  index: "0",
  thoughtStr: "",
  length: 0,
  model: null,
  cfg: {} as WFCCfgProps,
  wfcOutput: new Uint8ClampedArray(0),
  svg: "",
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;
const tokenBox = document.getElementById("token-id") as HTMLInputElement;
const indexBox = document.getElementById("index-id") as HTMLInputElement;

tokenBox.value = storage.token_id;
indexBox.value = storage.index;

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
    triggerFromInput();
  }
});

tokenBox.addEventListener("input", () => {
  const digitsOnly = tokenBox.value.replace(/\D+/g, "");
  if (digitsOnly !== tokenBox.value) {
    tokenBox.value = digitsOnly;
  }
  storage.token_id = digitsOnly || "0";
});

indexBox.addEventListener("input", () => {
  const digitsOnly = indexBox.value.replace(/\D+/g, "");
  if (digitsOnly !== indexBox.value) {
    indexBox.value = digitsOnly;
  }
  storage.index = digitsOnly || "0";
});

// helper to update storage + run your existing pipeline
function triggerFromInput() {
  const tokenDigits = tokenBox.value.replace(/\D+/g, "");
  if (tokenDigits !== tokenBox.value) {
    tokenBox.value = tokenDigits;
  }
  storage.token_id = tokenDigits || "0";

  const indexDigits = indexBox.value.replace(/\D+/g, "");
  if (indexDigits !== indexBox.value) {
    indexBox.value = indexDigits;
  }
  storage.index = indexDigits || "0";

  storage.thoughtStr = inputBox.value;
  storage.length = storage.thoughtStr.length;
  const seedKey = `${storage.token_id}:${storage.index}:${storage.thoughtStr}`;

  const trnd = PRNG(seedKey);
  const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

  render(thoughtData);
  previewPanel(thoughtData);

}

function render(thoughtData: ThoughtData) {
  const seedKey = `${storage.token_id}:${storage.index}:${storage.thoughtStr}`;
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
