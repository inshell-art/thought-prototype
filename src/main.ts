import "./style.css";
import { layoutSVG } from "./layoutSVG";
import { charSrcPreview } from "./Helpers/preview";
import { PRNG } from "./Helpers/PRNG";
import AnalyzeForWFC from "./WFC/AnalyzeForWFC";
import type { ThoughtData } from "./WFC/AnalyzeForWFC";

const storage = {
  token_id: (Math.random() * 1e7).toString(),
  thoughtStr: "",
  length: 0,
  pattern: "",
  svg: "",
};

// render();

document.getElementById("mint-btn")!.addEventListener("click", () => {
  const inputBox = document.getElementById("text-input") as HTMLInputElement;
  storage.token_id = (Math.random() * 1e7).toString();
  storage.thoughtStr = inputBox.value;
  storage.length = storage.thoughtStr.length;

  const trnd = PRNG(storage.token_id);
  const thoughtData: ThoughtData = AnalyzeForWFC(storage.thoughtStr, trnd);

  render(thoughtData);

  previewPanel(thoughtData);
});

function render(thoughtData: ThoughtData) {
  const lrnd = PRNG(storage.token_id);
  const svg = layoutSVG(storage, thoughtData, lrnd);
  (document.getElementById("ThoughtPreview") as HTMLElement).innerHTML = svg;
  storage.svg = svg;
}

function previewPanel(thoughtData: ThoughtData) {
  const charSrcSVG = charSrcPreview(thoughtData);

  document.getElementById("source-preview")!.innerHTML = charSrcSVG // + wordSrcSVG;
  document.getElementById("pattern-preview")!.innerHTML = storage.pattern;
  (document.getElementById("svg-code") as HTMLElement).textContent = storage.svg;
}
