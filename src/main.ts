import "./style.css";
import { layoutSVG } from "./layoutSVG";
import { charSrcPreview } from "./Helpers/preview";
import { PRNG } from "./Helpers/PRNG";
import AnalyzeForWFC from "./WFC/AnalyzeForWFC";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";
import { DownloadSVG } from "./Helpers/DownloadSVG";
import { computeN, simpleGridSVG } from "./Helpers/preview";

const storage = {
  token_id: (Math.random() * 1e7).toString(),
  timing: 0,
  thoughtStr: "",
  length: 0,
  pattern: "",
  svg: "",
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;
const canvasEl = document.getElementById("THOUGHT-canvas") as HTMLElement;

//save the svg as local file
document.getElementById("btn-save-svg")!.addEventListener("click", () => DownloadSVG(storage.svg));

inputBox.addEventListener("input", () => {
  const s = inputBox.value;
  const n = Math.max(1, computeN(s));
  canvasEl.innerHTML = simpleGridSVG(n);
});
inputBox.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    storage.thoughtStr = inputBox.value;
    storage.length = storage.thoughtStr.length;
    storage.timing = Date.now();

    const trnd = PRNG(storage.token_id + storage.thoughtStr + storage.timing);
    const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

    render(thoughtData);
    previewPanel(thoughtData);
  }
});

function render(thoughtData: ThoughtData) {
  const lrnd = PRNG(storage.token_id + storage.thoughtStr + storage.timing);

  const svg = layoutSVG(storage, thoughtData, lrnd);
  (document.getElementById("THOUGHT-canvas") as HTMLElement).innerHTML = svg;
  storage.svg = svg;
}

function previewPanel(thoughtData: ThoughtData) {
  const charSrcSVG = charSrcPreview(thoughtData);

  document.getElementById("source-preview")!.innerHTML = charSrcSVG;
  document.getElementById("pattern-preview")!.innerHTML = storage.pattern;
  (document.getElementById("svg-code") as HTMLElement).textContent = storage.svg;

}

