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
  thoughtStr: "",
  length: 0,
  _prevValue: "", // last input value
  _prevCaret: 0, // last caret position
  model: null,
  cfg: {} as WFCCfgProps,
  wfcOutput: new Uint8ClampedArray(0),
  svg: "",
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;
const tokenBox = document.getElementById("token-id") as HTMLInputElement;

tokenBox.value = storage.token_id;

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

// 1) Keep your explicit triggers (Enter / Space)
inputBox.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    triggerFromInput();
  }
});

// 2) also trigger when deleting reaches a whitespace boundary and when deleting whitespace
// Use the 'input' event so we can inspect the change and caret after it happens.
inputBox.addEventListener("input", (event: Event) => {
  const currValue = inputBox.value;
  const caret = inputBox.selectionStart ?? currValue.length;
  const prevValue = storage._prevValue;
  const prevCaret = storage._prevCaret;
  const type = (event as InputEvent).inputType || "";

  // detect deletion
  const isDeletion =
    type.startsWith("delete") ||
    (prevValue.length > currValue.length && caret <= prevCaret);

  // figure out which char was deleted (single-char backspace/delete)
  let deletedChar = "";
  const isBackspace = type === "deleteContentBackward";
  const isDeleteFwd = type === "deleteContentForward";

  if (isBackspace && prevCaret > 0) {
    deletedChar = prevValue[prevCaret - 1] ?? "";
  } else if (isDeleteFwd && prevCaret < prevValue.length) {
    deletedChar = prevValue[prevCaret] ?? "";
  }

  // boundary logic
  const before = caret > 0 ? currValue[caret - 1] : "";
  const atBoundary = caret === 0 || /\s/.test(before);
  const prevBefore =
    prevCaret > 0 && prevCaret - 1 < prevValue.length
      ? prevValue[prevCaret - 1]
      : "";
  const crossedIntoBoundary = atBoundary && !/\s/.test(prevBefore);

  // TRIGGER RULES:
  // 1) crossed into a whitespace boundary
  // 2) deleted character itself was a space
  if (isDeletion && (crossedIntoBoundary || deletedChar === " ")) {
    triggerFromInput();
  }

  // update snapshots
  storage._prevValue = currValue;
  storage._prevCaret = caret;
});

tokenBox.addEventListener("input", () => {
  const digitsOnly = tokenBox.value.replace(/\D+/g, "");
  if (digitsOnly !== tokenBox.value) {
    tokenBox.value = digitsOnly;
  }
  storage.token_id = digitsOnly || "0";
  if (storage.thoughtStr) {
    triggerFromInput();
  }
});

// helper to update storage + run your existing pipeline
function triggerFromInput() {
  storage.thoughtStr = inputBox.value;
  storage.length = storage.thoughtStr.length;
  const seedKey = storage.token_id + storage.thoughtStr;

  const trnd = PRNG(seedKey);
  const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

  render(thoughtData);
  previewPanel(thoughtData);

  // refresh previous snapshots after a render
  storage._prevValue = inputBox.value;
  storage._prevCaret = inputBox.selectionStart ?? inputBox.value.length;
}

function render(thoughtData: ThoughtData) {
  const seedKey = storage.token_id + storage.thoughtStr;
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
