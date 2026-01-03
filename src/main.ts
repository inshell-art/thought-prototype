
import { layoutSVG } from "./layoutSVG";
import { charSrcPreview, outputPreview } from "./Helpers/preview";
import { PRNG } from "./Helpers/PRNG";
import AnalyzeForWFC from "./WFC/AnalyzeForWFC";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { DownloadSVG } from "./Helpers/DownloadSVG";
import { patternPreview } from "./Helpers/preview";
import type { WFCCfgProps } from "./WFC/WFCAlgorithm";
// --- augment your storage for previous state
const storage = {
  token_id: (Math.random() * 1e7).toString(),
  timing: 0,
  thoughtStr: "",
  length: 0,
  _prevValue: "",          // NEW: last input value
  _prevCaret: 0,           // NEW: last caret position
  model: null,
  cfg: {} as WFCCfgProps,
  wfcOutput: new Uint8ClampedArray(0),
  svg: "",
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;

// save the svg as local file
document.getElementById("btn-save-svg")!.addEventListener("click", () => DownloadSVG(storage.svg));

// 1) Keep your explicit triggers (Enter / Space)
inputBox.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    triggerFromInput();
  }
});

// 2) NEW: also trigger when deleting reaches a whitespace boundary and when deleting whitespace
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

  // NEW: figure out which char was deleted (single-char backspace/delete)
  let deletedChar = "";
  const isBackspace = type === "deleteContentBackward";
  const isDeleteFwd = type === "deleteContentForward";

  if (isBackspace && prevCaret > 0) {
    deletedChar = prevValue[prevCaret - 1] ?? "";
  } else if (isDeleteFwd && prevCaret < prevValue.length) {
    deletedChar = prevValue[prevCaret] ?? "";
  }

  // boundary logic (your existing intent)
  const before = caret > 0 ? currValue[caret - 1] : "";
  const atBoundary = caret === 0 || /\s/.test(before);
  const prevBefore =
    prevCaret > 0 && prevCaret - 1 < prevValue.length
      ? prevValue[prevCaret - 1]
      : "";
  const crossedIntoBoundary = atBoundary && !/\s/.test(prevBefore);

  // TRIGGER RULES:
  // 1) crossed into a whitespace boundary (existing)
  // 2) NEW: the deleted character itself was a space
  if (isDeletion && (crossedIntoBoundary || deletedChar === " ")) {
    triggerFromInput();
  }

  // update snapshots
  storage._prevValue = currValue;
  storage._prevCaret = caret;
});

// helper to update storage + run your existing pipeline
function triggerFromInput() {
  storage.thoughtStr = inputBox.value;
  storage.length = storage.thoughtStr.length;
  storage.timing = Date.now();

  const trnd = PRNG(storage.token_id + storage.thoughtStr + storage.timing);
  const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

  render(thoughtData);
  previewPanel(thoughtData);

  // refresh previous snapshots after a render
  storage._prevValue = inputBox.value;
  storage._prevCaret = inputBox.selectionStart ?? inputBox.value.length;
}

function render(thoughtData: ThoughtData) {
  const lrnd = PRNG(storage.token_id + storage.thoughtStr + storage.timing);
  const svg = layoutSVG(storage, thoughtData, lrnd);
  (document.getElementById("THOUGHT-canvas") as HTMLElement).innerHTML = svg;
  storage.svg = svg;
}

function previewPanel(thoughtData: ThoughtData) {
  if (storage.model && storage.cfg) {
    outputPreview(storage.wfcOutput, storage.cfg.outputWidth, storage.cfg.outputHeight, 10, "wfc-output-preview");
    document.getElementById("source-preview")!.innerHTML = charSrcPreview(thoughtData);
    document.getElementById("pattern-preview")!.innerHTML = patternPreview(storage.model);
    (document.getElementById("svg-code") as HTMLElement).textContent = storage.svg;
  }
}

