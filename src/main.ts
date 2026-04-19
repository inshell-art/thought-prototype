import "@fontsource/source-code-pro/200.css";
import "@fontsource/source-code-pro/300.css";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/source-code-pro/600.css";
import "@fontsource/source-code-pro/700.css";
import "@fontsource/source-code-pro/800.css";
import "@fontsource/source-code-pro/900.css";
import "@fontsource-variable/roboto-mono/wght.css";
import thoughtInstructions from "../THOUGHT.md?raw";
import colorFontRaw from "../colorFontJSON/colorfont.byToolv2.json?raw";

type ColorFontFile = {
  colors: Array<{
    index: number;
    name: string;
    hex: string;
  }>;
};

type ColorFontEntry = {
  letter: string;
  index: number;
  name: string;
  hex: string;
};

type DrawImage = {
  char: string;
  fill: string;
};

type NormalizedInput = {
  value: string;
  hadInvalidChars: boolean;
  hitLimit: boolean;
};

type ProviderId = "harness" | "openai" | "groq" | "anthropic" | "openrouter";

type ProviderConfig = {
  id: ProviderId;
  label: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  modelPlaceholder: string;
  defaultModel: string;
};

type ProviderSessionState = {
  activeProvider: ProviderId;
  providers: Record<ProviderId, { apiKey: string; model: string }>;
};

const MAX_CHARS = 120;
const CANVAS_WIDTH = 960;
const IMAGE_SIZE = 29;
const IMAGE_GAP = 6;
const CANVAS_PADDING = 28;
const IMAGE_RADIUS = 0;
const BACKGROUND_FILL = "#050505";
const PROVIDER_SESSION_STORAGE_KEY = "thought-provider-session";
const CANVAS_TEXT_FAMILY =
  '"Roboto Mono Variable", "Roboto Mono", "Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const NOTICE_FLASH_MS = 2400;
const LIGHT_COLOR_DEFAULT_CUTOFF = 71;

async function requestLocalHarness(
  apiKey: string,
  model: string,
  instructions: string,
  prompt: string
): Promise<string> {
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  void apiKey;
  void model;
  void instructions;

  const normalizedPrompt = normalizeEnglishInput(prompt).value.trim();
  return normalizedPrompt || "THOUGHT";
}

function extractHarnessPrompt(url: string, body: Record<string, unknown>): string {
  if (url.includes("/v1/messages")) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const firstMessage = messages[0] as
      | { content?: string | Array<{ text?: string }> }
      | undefined;

    if (typeof firstMessage?.content === "string") {
      return firstMessage.content;
    }

    if (Array.isArray(firstMessage?.content)) {
      const firstBlock = firstMessage.content[0];
      if (typeof firstBlock?.text === "string") {
        return firstBlock.text;
      }
    }
  }

  if (url.includes("/chat/completions")) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMessage = messages[messages.length - 1] as
      | { content?: string }
      | undefined;
    return typeof lastMessage?.content === "string" ? lastMessage.content : "";
  }

  return typeof body.input === "string" ? body.input : "";
}

function extractHarnessInstructions(
  url: string,
  body: Record<string, unknown>
): string {
  if (url.includes("/v1/messages")) {
    return typeof body.system === "string" ? body.system : "";
  }

  if (url.includes("/chat/completions")) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const firstMessage = messages[0] as { content?: string; role?: string } | undefined;
    return firstMessage?.role === "system" && typeof firstMessage.content === "string"
      ? firstMessage.content
      : "";
  }

  return typeof body.instructions === "string" ? body.instructions : "";
}

function buildHarnessResponseBody(url: string, model: string, text: string) {
  if (url.includes("/v1/messages")) {
    return {
      id: "msg_local_harness",
      type: "message",
      model,
      role: "assistant",
      content: [{ type: "text", text }],
    };
  }

  if (url.includes("/chat/completions")) {
    return {
      id: "chatcmpl_local_harness",
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text } }],
    };
  }

  return {
    id: "resp_local_harness",
    model,
    output_text: text,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text },
          { type: "text", text },
        ],
      },
    ],
  };
}

const nativeFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const providerElement = document.getElementById(
    "provider-box"
  ) as HTMLSelectElement | null;

  if (providerElement?.value !== "harness") {
    return nativeFetch(input, init);
  }

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (
    !url.includes("/v1/responses") &&
    !url.includes("/v1/messages") &&
    !url.includes("/chat/completions") &&
    !url.includes("/openai/v1/responses")
  ) {
    return nativeFetch(input, init);
  }

  const body =
    typeof init?.body === "string"
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};
  const apiKeyInput = document.getElementById("api-key-box") as HTMLInputElement | null;
  const model =
    typeof body.model === "string" && body.model.length > 0
      ? body.model
      : "local-harness-v1";
  const prompt = extractHarnessPrompt(url, body);
  const instructions = extractHarnessInstructions(url, body);
  const text = await requestLocalHarness(
    apiKeyInput?.value ?? "",
    model,
    instructions,
    prompt
  );

  return new Response(JSON.stringify(buildHarnessResponseBody(url, model, text)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
const COLOR_FONT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  harness: {
    id: "harness",
    label: "local harness",
    apiKeyLabel: "local test key",
    apiKeyPlaceholder: "paste any local test key for this browser tab",
    modelPlaceholder: "local-harness-v1",
    defaultModel: "local-harness-v1",
  },
  openai: {
    id: "openai",
    label: "openai",
    apiKeyLabel: "openai api key",
    apiKeyPlaceholder: "paste an openai api key for this browser session",
    modelPlaceholder: "gpt-5-mini",
    defaultModel: "gpt-5-mini",
  },
  groq: {
    id: "groq",
    label: "groq",
    apiKeyLabel: "groq api key",
    apiKeyPlaceholder: "paste a groq api key for this browser session",
    modelPlaceholder: "openai/gpt-oss-20b",
    defaultModel: "openai/gpt-oss-20b",
  },
  anthropic: {
    id: "anthropic",
    label: "anthropic",
    apiKeyLabel: "anthropic api key",
    apiKeyPlaceholder: "paste an anthropic api key for this browser session",
    modelPlaceholder: "claude-3-5-haiku-latest",
    defaultModel: "claude-3-5-haiku-latest",
  },
  openrouter: {
    id: "openrouter",
    label: "openrouter",
    apiKeyLabel: "openrouter api key",
    apiKeyPlaceholder: "paste an openrouter api key for this browser session",
    modelPlaceholder: "openai/gpt-4o-mini",
    defaultModel: "openai/gpt-4o-mini",
  },
};

const parsedColorFont = JSON.parse(colorFontRaw) as ColorFontFile;
const COLOR_FONT_ENTRIES: ColorFontEntry[] = parsedColorFont.colors
  .slice()
  .sort((left, right) => left.index - right.index)
  .map((entry, index) => ({
    letter: COLOR_FONT_ALPHABET[index] ?? "?",
    index: entry.index,
    name: entry.name,
    hex: entry.hex,
  }))
  .filter((entry) => entry.letter !== "?");

const COLOR_FONT = Object.fromEntries(
  COLOR_FONT_ENTRIES.map((entry) => [entry.letter, entry.hex]),
) as Record<string, string>;

const providerBox = document.getElementById("provider-box") as HTMLSelectElement | null;
const apiKeyLabel = document.querySelector('label[for="api-key-box"]') as HTMLLabelElement | null;
const apiKeyBox = document.getElementById("api-key-box") as HTMLInputElement | null;
const modelBox = document.getElementById("model-box") as HTMLInputElement | null;
const promptBox = document.getElementById("prompt-box") as HTMLInputElement | null;
const runAgentButton = document.getElementById("run-agent") as HTMLButtonElement | null;
const resetThoughtButton = document.getElementById("reset-thought") as HTMLButtonElement | null;
const runStatus = document.getElementById("run-status") as HTMLElement | null;
const warningBox = document.getElementById("input-warning") as HTMLElement | null;
const agentOutput = document.getElementById("agent-output") as HTMLElement | null;
const canvas = document.getElementById("thought-grid") as HTMLCanvasElement | null;
const colorFontLegend = document.getElementById("color-font-legend") as HTMLElement | null;

if (
  !providerBox ||
  !apiKeyLabel ||
  !apiKeyBox ||
  !modelBox ||
  !promptBox ||
  !runAgentButton ||
  !resetThoughtButton ||
  !runStatus ||
  !warningBox ||
  !agentOutput ||
  !canvas ||
  !colorFontLegend
) {
  throw new Error("Front page elements are missing.");
}

const context = canvas.getContext("2d");

if (!context) {
  throw new Error("Canvas 2D context is unavailable.");
}

let statusTimer: number | null = null;
let warningTimer: number | null = null;
let ctaMode: "run" | "mint" = "run";

const clearNoticeTimer = (timer: number | null) => {
  if (timer !== null) {
    window.clearTimeout(timer);
  }
};

const updateNotice = (element: HTMLElement, message: string) => {
  element.textContent = message;
  element.classList.toggle("is-hidden", message.length === 0);
};

const setWarning = (
  message: string,
  options?: { flashMs?: number }
) => {
  clearNoticeTimer(warningTimer);
  warningTimer = null;
  updateNotice(warningBox, message);

  if (message && options?.flashMs) {
    warningTimer = window.setTimeout(() => {
      updateNotice(warningBox, "");
      warningTimer = null;
    }, options.flashMs);
  }
};

const setStatus = (
  message: string,
  options?: { flashMs?: number }
) => {
  clearNoticeTimer(statusTimer);
  statusTimer = null;
  updateNotice(runStatus, message);

  if (message && options?.flashMs) {
    statusTimer = window.setTimeout(() => {
      updateNotice(runStatus, "");
      statusTimer = null;
    }, options.flashMs);
  }
};

const syncCtaState = () => {
  if (ctaMode === "mint") {
    runAgentButton.textContent = "[ mint ]";
    resetThoughtButton.classList.remove("is-hidden");
    return;
  }

  runAgentButton.textContent = "[ run ]";
  resetThoughtButton.classList.add("is-hidden");
};

const hexToLightness = (hex: string) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return 0;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return 0;
  }

  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
};

const getDefaultProviderSessionState = (): ProviderSessionState => {
  return {
    activeProvider: "harness",
    providers: {
      harness: { apiKey: "", model: PROVIDERS.harness.defaultModel },
      openai: { apiKey: "", model: PROVIDERS.openai.defaultModel },
      groq: { apiKey: "", model: PROVIDERS.groq.defaultModel },
      anthropic: { apiKey: "", model: PROVIDERS.anthropic.defaultModel },
      openrouter: { apiKey: "", model: PROVIDERS.openrouter.defaultModel },
    },
  };
};

const readProviderSessionState = (): ProviderSessionState => {
  const fallback = getDefaultProviderSessionState();
  const raw = sessionStorage.getItem(PROVIDER_SESSION_STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProviderSessionState>;
    return {
      activeProvider:
        parsed.activeProvider && parsed.activeProvider in PROVIDERS
          ? parsed.activeProvider
          : fallback.activeProvider,
      providers: {
        harness: {
          apiKey: parsed.providers?.harness?.apiKey ?? "",
          model: parsed.providers?.harness?.model ?? PROVIDERS.harness.defaultModel,
        },
        openai: {
          apiKey: parsed.providers?.openai?.apiKey ?? "",
          model: parsed.providers?.openai?.model ?? PROVIDERS.openai.defaultModel,
        },
        groq: {
          apiKey: parsed.providers?.groq?.apiKey ?? "",
          model: parsed.providers?.groq?.model ?? PROVIDERS.groq.defaultModel,
        },
        anthropic: {
          apiKey: parsed.providers?.anthropic?.apiKey ?? "",
          model: parsed.providers?.anthropic?.model ?? PROVIDERS.anthropic.defaultModel,
        },
        openrouter: {
          apiKey: parsed.providers?.openrouter?.apiKey ?? "",
          model: parsed.providers?.openrouter?.model ?? PROVIDERS.openrouter.defaultModel,
        },
      },
    };
  } catch {
    return fallback;
  }
};

let providerSessionState = readProviderSessionState();

const writeProviderSessionState = () => {
  sessionStorage.setItem(PROVIDER_SESSION_STORAGE_KEY, JSON.stringify(providerSessionState));
};

const normalizeEnglishInput = (value: string): NormalizedInput => {
  const upper = value.toUpperCase();
  const hadInvalidChars = /[^A-Z ]/.test(upper);
  const normalized = upper.replace(/[^A-Z]/g, " ").replace(/ +/g, " ");
  const hitLimit = normalized.length > MAX_CHARS;

  return {
    value: normalized.slice(0, MAX_CHARS),
    hadInvalidChars,
    hitLimit,
  };
};

const colorForCharacter = (char: string): string => {
  if (char < "A" || char > "Z") {
    return BACKGROUND_FILL;
  }

  return COLOR_FONT[char] ?? "#ffffff";
};

const getDisplayWidth = () => {
  const frame = canvas.parentElement;

  if (!frame) {
    return CANVAS_WIDTH;
  }

  const frameStyles = window.getComputedStyle(frame);
  const horizontalPadding =
    Number.parseFloat(frameStyles.paddingLeft) + Number.parseFloat(frameStyles.paddingRight);
  const innerWidth = Math.max(320, frame.clientWidth - horizontalPadding);
  return Math.min(CANVAS_WIDTH, innerWidth);
};

const getMinimumHeight = (displayWidth: number) => {
  return Math.max(320, displayWidth);
};

const fitImagesToRow = (count: number, displayWidth: number) => {
  const availableWidth = displayWidth - 2 * CANVAS_PADDING;
  const itemCount = Math.max(1, count);
  const naturalWidth = itemCount * IMAGE_SIZE + Math.max(0, itemCount - 1) * IMAGE_GAP;
  const scale = Math.min(1, availableWidth / naturalWidth);
  const imageSize = IMAGE_SIZE * scale;
  const gap = itemCount > 1 ? IMAGE_GAP * scale : 0;
  const rowWidth = itemCount * imageSize + Math.max(0, itemCount - 1) * gap;

  return { imageSize, gap, rowWidth };
};

const resizeCanvas = (displayWidth: number, height: number) => {
  const deviceScale = window.devicePixelRatio || 1;

  canvas.width = Math.round(displayWidth * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(deviceScale, deviceScale);
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
};

const renderColorFontLegend = () => {
  const lightCutoff = LIGHT_COLOR_DEFAULT_CUTOFF / 100;
  const rowCount = Math.min(2, COLOR_FONT_ENTRIES.length);
  const baseRowSize = Math.floor(COLOR_FONT_ENTRIES.length / rowCount);
  const remainder = COLOR_FONT_ENTRIES.length % rowCount;

  let cursor = 0;
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const size = baseRowSize + (rowIndex < remainder ? 1 : 0);
    const slice = COLOR_FONT_ENTRIES.slice(cursor, cursor + size);
    cursor += size;
    return slice;
  });

  const legendRows = rows
    .map((row) => {
      const rowItems = row
        .map((entry) => {
          const displayName = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
          const initial = displayName.charAt(0);
          const isLight = hexToLightness(entry.hex) >= lightCutoff;
          const letterColor = isLight ? "rgba(24, 24, 24, 0.92)" : "rgba(255, 255, 255, 0.92)";
          const shadowColor = isLight
            ? "rgba(255, 255, 255, 0.18)"
            : "rgba(0, 0, 0, 0.24)";

          return `
            <span
              class="color-font-chip"
              style="--chip-color: ${entry.hex}; --chip-letter-color: ${letterColor}; --chip-letter-shadow: ${shadowColor};"
              tabindex="0"
              aria-label="${displayName} ${entry.hex}"
            >
              <span class="color-font-chip__swatch">
                <span class="color-font-chip__initial">${initial}</span>
              </span>
              <span class="color-font-chip__tooltip" aria-hidden="true">
                <span class="color-font-chip__tooltip-line">${displayName}</span>
                <span class="color-font-chip__tooltip-line">${entry.hex}</span>
              </span>
            </span>
          `;
        })
        .join("");

      const rowClass = row.length <= 1 ? "color-font-row color-font-row--single" : "color-font-row";
      return `<div class="${rowClass}">${rowItems}</div>`;
    })
    .join("");

  colorFontLegend.innerHTML = legendRows;
};

const getActiveProvider = (): ProviderConfig => {
  return PROVIDERS[providerBox.value as ProviderId] ?? PROVIDERS.openai;
};

const setProviderSelection = (providerId: ProviderId) => {
  const provider = PROVIDERS[providerId] ?? PROVIDERS.harness;
  providerBox.value = provider.id;
};

const syncProviderFieldsFromState = () => {
  const provider = getActiveProvider();
  const providerState = providerSessionState.providers[provider.id];

  apiKeyLabel.textContent = provider.apiKeyLabel;
  apiKeyBox.placeholder = provider.apiKeyPlaceholder;
  apiKeyBox.value = providerState.apiKey;
  modelBox.placeholder = provider.modelPlaceholder;
  modelBox.value = providerState.model;
};

const syncStateFromProviderFields = () => {
  const provider = getActiveProvider();

  providerSessionState.activeProvider = provider.id;
  providerSessionState.providers[provider.id] = {
    apiKey: apiKeyBox.value.trim(),
    model: modelBox.value.trim() || provider.defaultModel,
  };

  writeProviderSessionState();
};

const extractResponseText = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts =
    response.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean) ?? [];

  return parts.join(" ").trim();
};

const readErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const error = (payload as { error?: { message?: unknown } }).error;
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const requestOpenAIResponses = async (apiKey: string, model: string, prompt: string, baseUrl: string) => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: thoughtInstructions,
      input: prompt,
      max_output_tokens: 160,
      store: false,
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "Agent request failed."));
  }

  return extractResponseText(payload);
};

const requestAnthropicMessages = async (apiKey: string, model: string, prompt: string) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: thoughtInstructions,
      max_tokens: 160,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "Anthropic request failed."));
  }

  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const content = (payload as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
};

const requestOpenRouterChat = async (apiKey: string, model: string, prompt: string) => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: thoughtInstructions },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "OpenRouter request failed."));
  }

  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const choices =
    (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? [];
  const content = choices[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((part) => {
        if (typeof part === "string") {
          return [part];
        }

        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return [(part as { text: string }).text];
        }

        return [];
      })
      .join(" ")
      .trim();
  }

  return "";
};

const renderCanvas = (rawText: string) => {
  const previewText = rawText.trim();
  const displayWidth = getDisplayWidth();
  const height = getMinimumHeight(displayWidth);
  resizeCanvas(displayWidth, height);

  context.clearRect(0, 0, displayWidth, height);
  context.fillStyle = BACKGROUND_FILL;
  context.fillRect(0, 0, displayWidth, height);

  if (!previewText) {
    return;
  }

  const normalizedForImages = normalizeEnglishInput(previewText).value;
  const imageSource = normalizedForImages;
  const images: DrawImage[] = Array.from(imageSource, (char) => ({
    char,
    fill: colorForCharacter(char),
  }));

  const { imageSize, gap, rowWidth } = fitImagesToRow(images.length, displayWidth);
  const xStart = (displayWidth - rowWidth) / 2;
  const yStart = (height - imageSize) / 2;

  images.forEach((image, index) => {
    const x = xStart + index * (imageSize + gap);
    const y = yStart;

    if (image.char === " ") {
      return;
    }

    drawRoundedRect(context, x, y, imageSize, imageSize, IMAGE_RADIUS);
    context.fillStyle = image.fill;
    context.fill();
  });

  const maxTextWidth = displayWidth - 2 * CANVAS_PADDING;
  let textSize = Math.min(18, displayWidth * 0.034);
  do {
    context.font = `100 ${textSize}px ${CANVAS_TEXT_FAMILY}`;
    if (context.measureText(previewText).width <= maxTextWidth || textSize <= 9) {
      break;
    }
    textSize -= 1;
  } while (textSize > 9);

  context.fillStyle = "rgba(232, 237, 247, 0.72)";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(previewText, displayWidth / 2, height - CANVAS_PADDING);
};

const syncOutputToCanvas = (raw: string, options?: { suppressWarning?: boolean }) => {
  const normalized = normalizeEnglishInput(raw);

  if (!options?.suppressWarning && normalized.hadInvalidChars) {
    setWarning("non-letter characters were converted to spaces for rendering.", {
      flashMs: NOTICE_FLASH_MS,
    });
  } else if (!options?.suppressWarning && normalized.hitLimit) {
    setWarning(`agent output was clipped to ${MAX_CHARS} characters for rendering.`, {
      flashMs: NOTICE_FLASH_MS,
    });
  } else if (options?.suppressWarning) {
    setWarning("");
  }

  renderCanvas(raw);
};

const setAgentOutput = (text: string) => {
  agentOutput.textContent = text;
  syncOutputToCanvas(text);
};

const resetThought = () => {
  ctaMode = "run";
  agentOutput.textContent = "";
  syncOutputToCanvas("", { suppressWarning: true });
  setWarning("");
  setStatus("");
  syncCtaState();
};

const runAgent = async () => {
  if (ctaMode === "mint") {
    setStatus("mint is not wired yet.", { flashMs: NOTICE_FLASH_MS });
    return;
  }

  const provider = getActiveProvider();
  const apiKey = apiKeyBox.value.trim();
  const model = modelBox.value.trim();
  const prompt = promptBox.value.trim();

  if (!apiKey) {
    setWarning("api key is required.");
    setStatus("");
    return;
  }

  if (!model) {
    setWarning("model is required.");
    setStatus("");
    return;
  }

  if (!prompt) {
    setWarning("prompt is required.");
    setStatus("");
    return;
  }

  setWarning("");
  setStatus(`running ${provider.label}...`);
  runAgentButton.disabled = true;
  syncStateFromProviderFields();

  try {
    let text = "";

    if (provider.id === "harness") {
      text = await requestLocalHarness(apiKey, model, thoughtInstructions, prompt);
    } else if (provider.id === "openai") {
      text = await requestOpenAIResponses(apiKey, model, prompt, "https://api.openai.com/v1/responses");
    } else if (provider.id === "groq") {
      text = await requestOpenAIResponses(apiKey, model, prompt, "https://api.groq.com/openai/v1/responses");
    } else if (provider.id === "anthropic") {
      text = await requestAnthropicMessages(apiKey, model, prompt);
    } else if (provider.id === "openrouter") {
      text = await requestOpenRouterChat(apiKey, model, prompt);
    }

    if (!text) {
      throw new Error("agent returned no text.");
    }

    setAgentOutput(text);
    ctaMode = "mint";
    syncCtaState();
    setStatus("done.", { flashMs: NOTICE_FLASH_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent request failed.";
    setWarning(message);
    setStatus("failed.");
  } finally {
    runAgentButton.disabled = false;
  }
};

providerBox.addEventListener("change", () => {
  const provider = getActiveProvider();

  providerSessionState.activeProvider = provider.id;
  writeProviderSessionState();
  syncProviderFieldsFromState();
  setWarning("");
  setStatus(`ready for one-round ${provider.label}.`, { flashMs: NOTICE_FLASH_MS });
});

apiKeyBox.addEventListener("input", () => {
  setWarning("");
  syncStateFromProviderFields();
});

modelBox.addEventListener("input", () => {
  setWarning("");
  syncStateFromProviderFields();
});

promptBox.addEventListener("input", () => {
  setWarning("");
});

runAgentButton.addEventListener("click", () => {
  void runAgent();
});

resetThoughtButton.addEventListener("click", () => {
  resetThought();
});

promptBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    void runAgent();
  }
});

window.addEventListener("resize", () => {
  renderColorFontLegend();
  syncOutputToCanvas(agentOutput.textContent ?? "");
});

setProviderSelection(providerSessionState.activeProvider);
syncProviderFieldsFromState();
syncCtaState();
resetThought();
renderColorFontLegend();
setStatus(`ready for one-round ${getActiveProvider().label}.`, {
  flashMs: NOTICE_FLASH_MS,
});

void document.fonts.load(`100 12px ${CANVAS_TEXT_FAMILY}`).then(() => {
  syncOutputToCanvas(agentOutput.textContent ?? "", { suppressWarning: true });
});
