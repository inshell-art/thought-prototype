import "./style.css";
import { loadColorFont, parseColorFontJson, type ColorFont, type ColorFontData } from "./colorFont";
import { renderColorFontSVG } from "./renderColorFontSVG";
import { sanitizeThoughtText } from "./sanitizeThoughtText";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <div class="page">
      <header class="top">
        <div class="top-row">
          <div class="brand">
            <p class="kicker">Thought Prototype</p>
            <h1 class="title">THOUGHT</h1>
          </div>
        </div>
      </header>

      <main class="layout">
        <section class="canvas-col">
          <div class="canvas-card">
            <div class="canvas-header">
              <span>Output Canvas</span>
              <span class="chip">SVG</span>
            </div>
            <div id="output-canvas" class="canvas-placeholder" aria-label="SVG output canvas">
              <div class="canvas-grid"></div>
              <div class="canvas-copy">Render appears here</div>
            </div>
            <p class="canvas-note">A square container reserved for SVG output rendering.</p>
          </div>
        </section>

        <aside class="controls">
          <div class="panel">
            <h2>Controls</h2>
            <label for="account-address">account_address</label>
            <input
              id="account-address"
              type="text"
              placeholder="0x..."
              autocomplete="off"
            />
            <label for="input-text">text</label>
            <input
              id="input-text"
              type="text"
              placeholder="A-Z and spaces only"
              autocomplete="off"
              spellcheck="false"
              autocapitalize="characters"
            />
            <p class="panel-hint">Only A-Z and spaces. Multiple spaces collapse into one.</p>
            <button id="btn-generate" type="button">Generate</button>
          </div>

          <div class="panel colorfont-panel">
            <h2>colorFont</h2>
            <button id="btn-import" class="btn-secondary" type="button">Import Color JSON</button>
            <input id="input-color-json" type="file" accept="application/json" hidden />
            <div class="legend" aria-label="Character color mapping">
              <div class="legend-title">Color-Font Legend</div>
              <div id="legend-grid" class="legend-grid"></div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  `;

  const output = document.querySelector<HTMLDivElement>("#output-canvas");
  const account = document.querySelector<HTMLInputElement>("#account-address");
  const text = document.querySelector<HTMLInputElement>("#input-text");
  const button = document.querySelector<HTMLButtonElement>("#btn-generate");
  const importButton = document.querySelector<HTMLButtonElement>("#btn-import");
  const importInput = document.querySelector<HTMLInputElement>("#input-color-json");
  const emptyCanvasMarkup = output?.innerHTML ?? "";
  const legendGrid = document.querySelector<HTMLDivElement>("#legend-grid");

  const state: { colorFont: ColorFont | null; colorNames: string[]; text: string; svg: string } = {
    colorFont: null,
    colorNames: [],
    text: "",
    svg: "",
  };

  const computeCols = (cellSize: number, gap: number, padding: number) => {
    const w = Math.max(1, Math.floor(output?.getBoundingClientRect().width ?? 1));
    const denom = cellSize + gap;
    if (denom <= 0) return 1;
    const cols = Math.floor((w - padding * 2 + gap) / denom);
    return Math.max(1, cols);
  };

  const render = () => {
    if (!output || !state.colorFont) return;
    if (!state.text) {
      output.innerHTML = emptyCanvasMarkup;
      state.svg = "";
      return;
    }
    const cellSize = 28;
    const gap = 1;
    const padding = 0;
    const cols = Math.min(32, computeCols(cellSize, gap, padding));
    const canvasSize = Math.max(1, Math.floor(output.getBoundingClientRect().width));

    const svg = renderColorFontSVG(state.text, state.colorFont, {
      cols,
      cellSize,
      gap,
      padding,
      background: "#0d0f10",
      canvasSize,
    });

    output.innerHTML = svg;
    state.svg = svg;
  };

  const renderLegend = () => {
    if (!legendGrid || !state.colorFont) return;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const names = state.colorNames.length === 26 ? state.colorNames : letters;

    const makeItem = (idx: number, top: boolean) => {
      const ch = letters[idx];
      const color = state.colorFont?.[ch] ?? "#ffffff";
      const name = names[idx] ?? ch;
      if (top) {
        return `
          <div class="legend-item legend-item-top">
            <span class="legend-char">${name}</span>
            <span class="legend-swatch" style="background:${color}"></span>
          </div>
        `;
      }
      return `
        <div class="legend-item legend-item-bottom">
          <span class="legend-swatch" style="background:${color}"></span>
          <span class="legend-char">${name}</span>
        </div>
      `;
    };

    const topItems = Array.from({ length: 13 }, (_, i) => makeItem(i, true)).join("");
    const bottomItems = Array.from({ length: 13 }, (_, i) => makeItem(i + 13, false)).join("");

    legendGrid.innerHTML = `
      <div class="legend-row legend-row-top">${topItems}</div>
      <div class="legend-row legend-row-bottom">${bottomItems}</div>
    `;
  };

  const updateTextFromInput = () => {
    if (!text) return;
    const raw = text.value;
    const caret = text.selectionStart ?? raw.length;

    const sanitized = sanitizeThoughtText(raw);
    const sanitizedBeforeCaret = sanitizeThoughtText(raw.slice(0, caret));

    if (sanitized !== raw) {
      text.value = sanitized;
      const nextCaret = sanitizedBeforeCaret.length;
      text.setSelectionRange(nextCaret, nextCaret);
    }
    state.text = sanitized;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleGenerate();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1) return;
    if (event.key === " ") return;
    if (event.key >= "a" && event.key <= "z") return;
    if (event.key >= "A" && event.key <= "Z") return;
    event.preventDefault();
  };

  const handleGenerate = () => {
    const accountValue = account?.value?.trim() ?? "";
    updateTextFromInput();
    const textValue = state.text;
    if (output) {
      output.dataset.account = accountValue;
      output.dataset.text = textValue;
    }
    render();
  };

  const applyColorFontData = (data: ColorFontData) => {
    state.colorFont = data.map;
    state.colorNames = data.names;
    renderLegend();
    if (state.svg) render();
  };

  const handleImport = async () => {
    const file = importInput?.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const parsed = parseColorFontJson(raw);
      if (parsed) {
        applyColorFontData(parsed);
      } else {
        console.error("Unrecognized color-font JSON format");
      }
    } catch (err) {
      console.error("Failed to import color JSON", err);
    } finally {
      if (importInput) importInput.value = "";
    }
  };

  button?.addEventListener("click", handleGenerate);
  text?.addEventListener("keydown", handleKeyDown);
  text?.addEventListener("input", () => {
    updateTextFromInput();
  });

  importButton?.addEventListener("click", () => {
    importInput?.click();
  });
  importInput?.addEventListener("change", handleImport);

  window.addEventListener("resize", () => {
    if (state.svg) render();
  });

  void (async () => {
    const data = await loadColorFont();
    applyColorFontData(data);
    updateTextFromInput();
  })();
}
