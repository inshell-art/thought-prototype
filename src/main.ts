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
import thoughtInstructionsUrl from "../THOUGHT.md?url";
import colorFontRaw from "../colorFontJSON/colorfont.byToolv2.json?raw";

type ColorFontFile = {
  colors: Array<{
    index: number;
    hex: string;
  }>;
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

type Mode = "connect" | "direct" | "local";

type DirectProviderId = "openai" | "openrouter" | "anthropic";

type ModelSourceId = DirectProviderId | "ollama";

type ProviderConfig = {
  id: DirectProviderId;
  label: string;
  defaultModel: string;
};

type ModelOption = {
  id: string;
  label: string;
};

type LegacyProviderState = {
  apiKey?: string;
  model?: string;
};

type LegacySessionState = {
  authMode?: "connect" | "raw";
  activeProvider?: string;
  providers?: Record<string, LegacyProviderState | undefined>;
};

type ThoughtSessionState = {
  mode: Mode;
  prompt: string;
  connect: {
    apiKey: string;
    model: string;
  };
  direct: {
    provider: DirectProviderId;
    apiKey: string;
    model: string;
  };
  local: {
    available: boolean | null;
    model: string;
  };
};

const MAX_CHARS = 120;
const CANVAS_WIDTH = 960;
const MIN_CANVAS_SIZE = 180;
const IMAGE_SIZE = 29;
const IMAGE_GAP = 6;
const CANVAS_PADDING = 28;
const IMAGE_RADIUS = 0;
const BACKGROUND_FILL = "#050505";
const THOUGHT_SESSION_STORAGE_KEY = "thought-provider-session";
const OPENROUTER_PKCE_VERIFIER_KEY = "thought-openrouter-pkce-verifier";
const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/keys";
const OPENROUTER_MODEL_URL = "https://openrouter.ai/api/v1/models";
const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const MANUAL_MODEL_VALUE = "__manual__";
const LEGACY_OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const LOCAL_ENGINE_ID = "ollama";
const LOCAL_ENGINE_LABEL = "ollama";
const LOCAL_DEFAULT_MODEL = "llama3.2:1b";
const NOTICE_FLASH_MS = 2400;
const COLOR_FONT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CANVAS_TEXT_FAMILY =
  '"Roboto Mono Variable", "Roboto Mono", "Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const OPENROUTER_PREFERRED_MODELS = [
  OPENROUTER_DEFAULT_MODEL,
  "tencent/hy3-preview:free",
  "inclusionai/ling-2.6-flash:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3.6-plus",
  "mistralai/mistral-small-2603",
  "openai/gpt-5.4-mini",
];

const DIRECT_PROVIDERS: Record<DirectProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "openai",
    defaultModel: "gpt-5-mini",
  },
  openrouter: {
    id: "openrouter",
    label: "openrouter",
    defaultModel: OPENROUTER_DEFAULT_MODEL,
  },
  anthropic: {
    id: "anthropic",
    label: "anthropic",
    defaultModel: "claude-3-5-haiku-latest",
  },
};

const STATIC_MODEL_OPTIONS: Record<ModelSourceId, ModelOption[]> = {
  openai: [
    { id: "gpt-5-mini", label: "gpt-5-mini" },
    { id: "gpt-5", label: "gpt-5" },
    { id: "gpt-5.4-mini", label: "gpt-5.4-mini" },
    { id: "gpt-5.4", label: "gpt-5.4" },
  ],
  openrouter: OPENROUTER_PREFERRED_MODELS.map((model) => ({ id: model, label: model })),
  anthropic: [
    { id: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest" },
    { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
    { id: "claude-opus-4-5", label: "claude-opus-4-5" },
  ],
  ollama: [{ id: LOCAL_DEFAULT_MODEL, label: LOCAL_DEFAULT_MODEL }],
};

const parsedColorFont = JSON.parse(colorFontRaw) as ColorFontFile;
const COLOR_FONT = Object.fromEntries(
  parsedColorFont.colors
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((entry, index) => [COLOR_FONT_ALPHABET[index] ?? "?", entry.hex])
    .filter(([letter]) => letter !== "?"),
) as Record<string, string>;

const frontpageShell = document.querySelector(".frontpage-shell") as HTMLElement | null;
const frontpageMain = document.querySelector(".frontpage-main") as HTMLElement | null;
const frontpageTitle = document.getElementById("frontpage-title") as HTMLElement | null;
const modeConnectButton = document.getElementById("mode-connect") as HTMLButtonElement | null;
const modeDirectButton = document.getElementById("mode-direct") as HTMLButtonElement | null;
const modeLocalButton = document.getElementById("mode-local") as HTMLButtonElement | null;
const connectPanel = document.getElementById("connect-panel") as HTMLElement | null;
const connectOpenRouterButton = document.getElementById("connect-openrouter") as HTMLButtonElement | null;
const connectStatusRow = document.getElementById("connect-status-row") as HTMLElement | null;
const connectStatusCopy = document.getElementById("connect-status-copy") as HTMLElement | null;
const disconnectOpenRouterButton = document.getElementById("disconnect-openrouter") as HTMLButtonElement | null;
const providerField = document.getElementById("provider-field") as HTMLElement | null;
const providerBox = document.getElementById("provider-box") as HTMLSelectElement | null;
const apiKeyField = document.getElementById("api-key-field") as HTMLElement | null;
const apiKeyLabel = document.querySelector('label[for="api-key-box"]') as HTMLLabelElement | null;
const apiKeyBox = document.getElementById("api-key-box") as HTMLInputElement | null;
const localEngineField = document.getElementById("local-engine-field") as HTMLElement | null;
const localEngineValue = document.getElementById("local-engine-value") as HTMLElement | null;
const localStatus = document.getElementById("local-status") as HTMLElement | null;
const localHelper = document.getElementById("local-helper") as HTMLElement | null;
const thoughtCanvasPanel = document.querySelector(".thought-canvas-panel") as HTMLElement | null;
const thoughtCanvasFrame = document.querySelector(".thought-canvas-frame") as HTMLElement | null;
const modelBox = document.getElementById("model-box") as HTMLSelectElement | null;
const modelManualBox = document.getElementById("model-manual-box") as HTMLInputElement | null;
const promptBox = document.getElementById("prompt-box") as HTMLInputElement | null;
const runAgentButton = document.getElementById("run-agent") as HTMLButtonElement | null;
const resetThoughtButton = document.getElementById("reset-thought") as HTMLButtonElement | null;
const runStatus = document.getElementById("run-status") as HTMLElement | null;
const warningBox = document.getElementById("input-warning") as HTMLElement | null;
const thoughtInstructionsLink = document.getElementById("thought-instructions-link") as HTMLAnchorElement | null;
const canvas = document.getElementById("thought-grid") as HTMLCanvasElement | null;

if (
  !frontpageShell ||
  !frontpageMain ||
  !frontpageTitle ||
  !modeConnectButton ||
  !modeDirectButton ||
  !modeLocalButton ||
  !connectPanel ||
  !connectOpenRouterButton ||
  !connectStatusRow ||
  !connectStatusCopy ||
  !disconnectOpenRouterButton ||
  !providerField ||
  !providerBox ||
  !apiKeyField ||
  !apiKeyLabel ||
  !apiKeyBox ||
  !localEngineField ||
  !localEngineValue ||
  !localStatus ||
  !localHelper ||
  !thoughtCanvasPanel ||
  !thoughtCanvasFrame ||
  !modelBox ||
  !modelManualBox ||
  !promptBox ||
  !runAgentButton ||
  !resetThoughtButton ||
  !runStatus ||
  !warningBox ||
  !thoughtInstructionsLink ||
  !canvas
) {
  throw new Error("Front page elements are missing.");
}

thoughtInstructionsLink.href = thoughtInstructionsUrl;
localEngineValue.textContent = LOCAL_ENGINE_LABEL;

const context = canvas.getContext("2d");

if (!context) {
  throw new Error("Canvas 2D context is unavailable.");
}

let statusTimer: number | null = null;
let warningTimer: number | null = null;
let ctaMode: "run" | "mint" = "run";
let currentOutputText = "";
let runInFlight = false;
const modelOptionsCache = new Map<ModelSourceId, ModelOption[]>();
const modelOptionsLoading = new Set<ModelSourceId>();

const getDefaultSessionState = (): ThoughtSessionState => ({
  mode: "connect",
  prompt: "",
  connect: {
    apiKey: "",
    model: OPENROUTER_DEFAULT_MODEL,
  },
  direct: {
    provider: "openai",
    apiKey: "",
    model: DIRECT_PROVIDERS.openai.defaultModel,
  },
  local: {
    available: null,
    model: LOCAL_DEFAULT_MODEL,
  },
});

const normalizeStoredModel = (sourceId: ModelSourceId, model: string | undefined) => {
  if (sourceId === "openrouter" && (!model || model === LEGACY_OPENROUTER_DEFAULT_MODEL)) {
    return DIRECT_PROVIDERS.openrouter.defaultModel;
  }

  const fallback =
    sourceId === LOCAL_ENGINE_ID ? LOCAL_DEFAULT_MODEL : DIRECT_PROVIDERS[sourceId].defaultModel;

  return model?.trim() || fallback;
};

const isMode = (value: unknown): value is Mode =>
  value === "connect" || value === "direct" || value === "local";

const isDirectProviderId = (value: unknown): value is DirectProviderId =>
  value === "openai" || value === "openrouter" || value === "anthropic";

const migrateLegacyState = (
  parsed: LegacySessionState,
  fallback: ThoughtSessionState,
): ThoughtSessionState => {
  const legacyProviders = parsed.providers ?? {};
  const connectModel = normalizeStoredModel("openrouter", legacyProviders.openrouter?.model);
  const connectApiKey = legacyProviders.openrouter?.apiKey?.trim() ?? "";
  const directProvider = isDirectProviderId(parsed.activeProvider) ? parsed.activeProvider : "openai";
  const directModel = normalizeStoredModel(directProvider, legacyProviders[directProvider]?.model);
  const directApiKey = legacyProviders[directProvider]?.apiKey?.trim() ?? "";
  const legacyLocalModel =
    legacyProviders.ollama?.model ?? legacyProviders.harness?.model ?? fallback.local.model;

  return {
    mode:
      parsed.authMode === "connect"
        ? "connect"
        : parsed.activeProvider === "ollama" || parsed.activeProvider === "harness"
          ? "local"
          : "direct",
    prompt: "",
    connect: {
      apiKey: connectApiKey,
      model: connectModel,
    },
    direct: {
      provider: directProvider,
      apiKey: directApiKey,
      model: directModel,
    },
    local: {
      available: null,
      model: normalizeStoredModel("ollama", legacyLocalModel),
    },
  };
};

const readSessionState = (): ThoughtSessionState => {
  const fallback = getDefaultSessionState();
  const raw = sessionStorage.getItem(THOUGHT_SESSION_STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ThoughtSessionState> & LegacySessionState;

    if (!("mode" in parsed)) {
      return migrateLegacyState(parsed, fallback);
    }

    const connect = (parsed.connect ?? {}) as Partial<ThoughtSessionState["connect"]>;
    const direct = (parsed.direct ?? {}) as Partial<ThoughtSessionState["direct"]>;
    const local = (parsed.local ?? {}) as Partial<ThoughtSessionState["local"]>;

    return {
      mode: isMode(parsed.mode) ? parsed.mode : fallback.mode,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      connect: {
        apiKey: typeof connect.apiKey === "string" ? connect.apiKey : "",
        model: normalizeStoredModel(
          "openrouter",
          typeof connect.model === "string" ? connect.model : undefined,
        ),
      },
      direct: {
        provider: isDirectProviderId(direct.provider) ? direct.provider : fallback.direct.provider,
        apiKey: typeof direct.apiKey === "string" ? direct.apiKey : "",
        model: normalizeStoredModel(
          isDirectProviderId(direct.provider) ? direct.provider : fallback.direct.provider,
          typeof direct.model === "string" ? direct.model : undefined,
        ),
      },
      local: {
        available:
          typeof local.available === "boolean" ? local.available : fallback.local.available,
        model: normalizeStoredModel(
          "ollama",
          typeof local.model === "string" ? local.model : undefined,
        ),
      },
    };
  } catch {
    return fallback;
  }
};

let sessionState = readSessionState();

const writeSessionState = () => {
  sessionStorage.setItem(THOUGHT_SESSION_STORAGE_KEY, JSON.stringify(sessionState));
};

const clearNoticeTimer = (timer: number | null) => {
  if (timer !== null) {
    window.clearTimeout(timer);
  }
};

const updateNotice = (element: HTMLElement, message: string) => {
  element.textContent = message;
  element.classList.toggle("is-hidden", message.length === 0);
};

const setWarning = (message: string, options?: { flashMs?: number }) => {
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

const setStatus = (message: string, options?: { flashMs?: number }) => {
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
  } else {
    runAgentButton.textContent = "[ run ]";
    resetThoughtButton.classList.add("is-hidden");
  }
};

const readPx = (value: string) => Number.parseFloat(value) || 0;

const getViewportWidthCap = () => {
  if (window.matchMedia("(max-width: 900px)").matches) {
    return CANVAS_WIDTH;
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const shellStyles = window.getComputedStyle(frontpageShell);
  const mainStyles = window.getComputedStyle(frontpageMain);
  const frameStyles = window.getComputedStyle(thoughtCanvasFrame);
  const shellInset = readPx(shellStyles.paddingTop) + readPx(shellStyles.paddingBottom);
  const frameInset = readPx(frameStyles.paddingTop) + readPx(frameStyles.paddingBottom);
  const titleHeight = frontpageTitle.getBoundingClientRect().height;
  const rowGap = readPx(mainStyles.rowGap);
  const availableHeight = Math.floor(
    viewportHeight - shellInset - titleHeight - rowGap - frameInset,
  );

  return Math.max(MIN_CANVAS_SIZE, availableHeight);
};

const getDisplayWidth = () => {
  const panelRect = thoughtCanvasPanel.getBoundingClientRect();
  const frameStyles = window.getComputedStyle(thoughtCanvasFrame);
  const horizontalInset =
    readPx(frameStyles.paddingLeft) +
    readPx(frameStyles.paddingRight) +
    readPx(frameStyles.borderLeftWidth) +
    readPx(frameStyles.borderRightWidth);
  const availableWidth = Math.max(MIN_CANVAS_SIZE, Math.floor(panelRect.width - horizontalInset));

  return Math.max(
    MIN_CANVAS_SIZE,
    Math.min(CANVAS_WIDTH, availableWidth, getViewportWidthCap()),
  );
};

const getMinimumHeight = (displayWidth: number) => displayWidth;

const resizeCanvas = (displayWidth: number, height: number) => {
  const deviceScale = window.devicePixelRatio || 1;

  canvas.width = Math.round(displayWidth * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  canvas.style.width = `${displayWidth}px`;
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

const normalizeEnglishInput = (value: string): NormalizedInput => {
  const upper = value.toUpperCase();
  const hadInvalidChars = /[^A-Z ]/.test(upper);
  const normalized = upper.replace(/[^A-Z]+/g, " ").replace(/\s+/g, " ").trim();
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

const renderCanvas = (rawText: string) => {
  const previewText = normalizeEnglishInput(rawText).value.trim();
  const displayWidth = getDisplayWidth();
  const height = getMinimumHeight(displayWidth);
  resizeCanvas(displayWidth, height);

  context.clearRect(0, 0, displayWidth, height);
  context.fillStyle = BACKGROUND_FILL;
  context.fillRect(0, 0, displayWidth, height);

  if (!previewText) {
    return;
  }

  const images: DrawImage[] = Array.from(previewText, (char) => ({
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

  if (!options?.suppressWarning && normalized.hitLimit) {
    setWarning(`agent output was clipped to ${MAX_CHARS} characters for rendering.`, {
      flashMs: NOTICE_FLASH_MS,
    });
  } else if (options?.suppressWarning) {
    setWarning("");
  }

  renderCanvas(raw);
};

const setAgentOutput = (text: string) => {
  currentOutputText = normalizeEnglishInput(text).value.trim();
  syncOutputToCanvas(text);
};

const recordThoughtRun = (
  mode: Mode,
  provider: string,
  model: string,
  prompt: string,
  rawOutput: string,
  normalizedOutput: string,
) => {
  const run = {
    mode,
    provider,
    model,
    prompt,
    rawOutput,
    normalizedOutput,
  };

  (
    window as Window & {
      __thoughtLastRun?: typeof run;
    }
  ).__thoughtLastRun = run;

  console.info("[thought] provider output", run);
};

const resetThought = () => {
  ctaMode = "run";
  currentOutputText = "";
  syncOutputToCanvas("", { suppressWarning: true });
  setWarning("");
  setStatus("");
  syncCtaState();
  syncRunAvailability();
};

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const createCodeVerifier = () => {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const createCodeChallenge = async (verifier: string) => {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(new Uint8Array(digest));
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

  if (typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }

  if (typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }

  return fallback;
};

const buildOllamaPrompt = (prompt: string) =>
  [thoughtInstructions.trim(), "", "User prompt:", prompt.trim(), "", "Response:"].join("\n");

const requestOllama = async (model: string, prompt: string) => {
  let response: Response;
  const ollamaModel = model.replace(/^ollama:/, "").trim();

  try {
    response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: buildOllamaPrompt(prompt),
        stream: false,
        options: {
          temperature: 0,
          num_predict: 160,
        },
      }),
    });
  } catch {
    throw new Error("ollama not found.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "ollama request failed."));
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "response" in payload &&
    typeof (payload as { response?: unknown }).response === "string"
  ) {
    return ((payload as { response: string }).response).trim();
  }

  return "";
};

const requestOpenAIResponses = async (apiKey: string, model: string, prompt: string) => {
  const response = await fetch("https://api.openai.com/v1/responses", {
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
    throw new Error(readErrorMessage(payload, "openai request failed."));
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
      "anthropic-dangerous-direct-browser-access": "true",
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
    throw new Error(readErrorMessage(payload, "anthropic request failed."));
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
    throw new Error(readErrorMessage(payload, "openrouter request failed."));
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

const extractOpenRouterKey = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const key = (payload as { key?: unknown }).key;
  return typeof key === "string" ? key.trim() : "";
};

const cleanOpenRouterCallbackUrl = () => {
  const url = new URL(window.location.href);
  let changed = false;

  ["code", "error", "error_description"].forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
};

const exchangeOpenRouterCode = async (code: string) => {
  const verifier = sessionStorage.getItem(OPENROUTER_PKCE_VERIFIER_KEY);

  if (!verifier) {
    throw new Error("openrouter verifier is missing. authorize again.");
  }

  const response = await fetch(OPENROUTER_KEY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "openrouter connect failed."));
  }

  const key = extractOpenRouterKey(payload);
  if (!key) {
    throw new Error("openrouter returned no key.");
  }

  sessionStorage.removeItem(OPENROUTER_PKCE_VERIFIER_KEY);
  sessionState.mode = "connect";
  sessionState.connect.apiKey = key;
  sessionState.connect.model =
    sessionState.connect.model || DIRECT_PROVIDERS.openrouter.defaultModel;
  writeSessionState();
};

const handleOpenRouterCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");

  if (error) {
    cleanOpenRouterCallbackUrl();
    throw new Error(params.get("error_description") || error);
  }

  if (!code) {
    return false;
  }

  setStatus("authorizing openrouter...");
  connectOpenRouterButton.disabled = true;

  try {
    await exchangeOpenRouterCode(code);
    cleanOpenRouterCallbackUrl();
    syncInterface();
    setWarning("");
    setStatus("connected via openrouter.", { flashMs: NOTICE_FLASH_MS });
    return true;
  } finally {
    connectOpenRouterButton.disabled = false;
  }
};

const startOpenRouterConnect = async () => {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const callbackUrl = `${window.location.origin}${window.location.pathname}`;
  const authUrl = new URL(OPENROUTER_AUTH_URL);

  authUrl.searchParams.set("callback_url", callbackUrl);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  sessionStorage.setItem(OPENROUTER_PKCE_VERIFIER_KEY, verifier);
  window.location.assign(authUrl.toString());
};

const disconnectOpenRouter = () => {
  sessionState.connect.apiKey = "";
  sessionStorage.removeItem(OPENROUTER_PKCE_VERIFIER_KEY);
  writeSessionState();
  syncInterface();
  setWarning("");
  setStatus("openrouter disconnected.", { flashMs: NOTICE_FLASH_MS });
};

const dedupeModelOptions = (options: ModelOption[]) => {
  const seen = new Set<string>();

  return options.filter((option) => {
    const id = option.id.trim();
    if (!id || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
};

const hasTextModality = (value: unknown) => Array.isArray(value) && value.includes("text");

const fetchOpenRouterModels = async (): Promise<ModelOption[]> => {
  const response = await fetch(OPENROUTER_MODEL_URL);
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "openrouter model list failed."));
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return STATIC_MODEL_OPTIONS.openrouter;
  }

  const preferredRank = new Map(
    OPENROUTER_PREFERRED_MODELS.map((model, index) => [model, index]),
  );

  const options = data
    .flatMap((entry): ModelOption[] => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const model = entry as {
        id?: unknown;
        architecture?: {
          input_modalities?: unknown;
          output_modalities?: unknown;
        };
        pricing?: {
          prompt?: unknown;
          completion?: unknown;
        };
      };
      const id = typeof model.id === "string" ? model.id.trim() : "";

      if (!id) {
        return [];
      }

      if (!hasTextModality(model.architecture?.input_modalities)) {
        return [];
      }

      if (!hasTextModality(model.architecture?.output_modalities)) {
        return [];
      }

      if (
        Array.isArray(model.architecture?.output_modalities) &&
        model.architecture.output_modalities.includes("image")
      ) {
        return [];
      }

      if (String(model.pricing?.prompt) === "-1" || String(model.pricing?.completion) === "-1") {
        return [];
      }

      return [{ id, label: id }];
    })
    .sort((left, right) => {
      const leftRank = preferredRank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = preferredRank.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftFreeRank = left.id.endsWith(":free") ? 0 : 1;
      const rightFreeRank = right.id.endsWith(":free") ? 0 : 1;

      if (leftFreeRank !== rightFreeRank) {
        return leftFreeRank - rightFreeRank;
      }

      return left.id.localeCompare(right.id);
    });

  return dedupeModelOptions(options);
};

const fetchOllamaModels = async (): Promise<ModelOption[]> => {
  const response = await fetch(OLLAMA_TAGS_URL);
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "ollama model list failed."));
  }

  const data = (payload as { models?: unknown })?.models;
  if (!Array.isArray(data)) {
    return STATIC_MODEL_OPTIONS.ollama;
  }

  const options = data.flatMap((entry): ModelOption[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const model = entry as { model?: unknown; name?: unknown };
    const id =
      typeof model.model === "string"
        ? model.model.trim()
        : typeof model.name === "string"
          ? model.name.trim()
          : "";

    return id ? [{ id, label: id }] : [];
  });

  return dedupeModelOptions(options);
};

const getCurrentModelSourceId = (): ModelSourceId => {
  if (sessionState.mode === "connect") {
    return "openrouter";
  }

  if (sessionState.mode === "local") {
    return "ollama";
  }

  return sessionState.direct.provider;
};

const getCurrentModelValue = () => {
  if (sessionState.mode === "connect") {
    return sessionState.connect.model;
  }

  if (sessionState.mode === "local") {
    return sessionState.local.model;
  }

  return sessionState.direct.model;
};

const setCurrentModelValue = (value: string) => {
  if (sessionState.mode === "connect") {
    sessionState.connect.model = value;
  } else if (sessionState.mode === "local") {
    sessionState.local.model = value;
  } else {
    sessionState.direct.model = value;
  }
};

const getModelOptions = (sourceId: ModelSourceId) =>
  modelOptionsCache.get(sourceId) ?? STATIC_MODEL_OPTIONS[sourceId];

const syncManualModelField = () => {
  modelManualBox.classList.toggle("is-hidden", modelBox.value !== MANUAL_MODEL_VALUE);
};

const setModelOptions = (
  sourceId: ModelSourceId,
  options: ModelOption[],
  selectedModel: string,
) => {
  const allowManual = sourceId !== LOCAL_ENGINE_ID;
  const modelOptions = dedupeModelOptions(options.length ? options : STATIC_MODEL_OPTIONS[sourceId]);
  const defaultModel =
    sourceId === LOCAL_ENGINE_ID ? LOCAL_DEFAULT_MODEL : DIRECT_PROVIDERS[sourceId].defaultModel;
  const optionIds = new Set(modelOptions.map((option) => option.id));
  const selected = selectedModel.trim();
  const resolvedModel =
    !selected || (selected === defaultModel && !optionIds.has(selected))
      ? (optionIds.has(defaultModel) ? defaultModel : modelOptions[0]?.id) || defaultModel
      : selected;
  const hasSelectedModel = optionIds.has(resolvedModel);

  modelBox.replaceChildren();
  modelOptions.forEach((option) => {
    modelBox.append(new Option(option.label, option.id));
  });

  if (allowManual) {
    modelBox.append(new Option("custom model id", MANUAL_MODEL_VALUE));
  }

  if (allowManual && !hasSelectedModel) {
    modelBox.value = MANUAL_MODEL_VALUE;
    modelManualBox.value = resolvedModel;
  } else {
    modelBox.value = hasSelectedModel ? resolvedModel : modelOptions[0]?.id ?? "";
    modelManualBox.value = "";
  }

  syncManualModelField();
  modelBox.disabled = false;
  modelManualBox.disabled = !allowManual;
  return allowManual && modelBox.value === MANUAL_MODEL_VALUE
    ? modelManualBox.value.trim()
    : modelBox.value.trim();
};

const disableModelControls = (message: string) => {
  modelBox.replaceChildren(new Option(message, ""));
  modelBox.disabled = true;
  modelManualBox.value = "";
  modelManualBox.disabled = true;
  modelManualBox.classList.add("is-hidden");
};

const getSelectedModelValue = () => {
  if (modelBox.disabled) {
    return "";
  }

  if (modelBox.value === MANUAL_MODEL_VALUE) {
    return modelManualBox.value.trim();
  }

  return modelBox.value.trim();
};

const syncConnectControls = () => {
  const isConnectMode = sessionState.mode === "connect";
  const hasCredential = sessionState.connect.apiKey.trim().length > 0;

  connectPanel.classList.toggle("is-hidden", !isConnectMode);
  connectOpenRouterButton.classList.toggle("is-hidden", hasCredential);
  connectStatusRow.classList.toggle("is-hidden", !hasCredential);
  connectStatusCopy.textContent = "connected via openrouter";
};

const syncModeControls = () => {
  const isConnectMode = sessionState.mode === "connect";
  const isDirectMode = sessionState.mode === "direct";
  const isLocalMode = sessionState.mode === "local";

  modeConnectButton.classList.toggle("is-active", isConnectMode);
  modeDirectButton.classList.toggle("is-active", isDirectMode);
  modeLocalButton.classList.toggle("is-active", isLocalMode);
  providerField.classList.toggle("is-hidden", !isDirectMode);
  apiKeyField.classList.toggle("is-hidden", !isDirectMode);
  localEngineField.classList.toggle("is-hidden", !isLocalMode);
  localStatus.classList.toggle("is-hidden", !isLocalMode);
  localHelper.classList.toggle("is-hidden", !isLocalMode);
  syncConnectControls();
};

const syncDirectControls = () => {
  providerBox.value = sessionState.direct.provider;
  apiKeyLabel.textContent = "api key";
  apiKeyBox.placeholder = "session only. never stored by thought.";
  apiKeyBox.value = sessionState.direct.apiKey;
};

const syncLocalControls = () => {
  if (sessionState.local.available === true) {
    localStatus.textContent = "ollama detected";
  } else if (sessionState.local.available === false) {
    localStatus.textContent = "ollama not found";
  } else {
    localStatus.textContent = "checking ollama...";
  }
};

const syncPromptField = () => {
  if (promptBox.value !== sessionState.prompt) {
    promptBox.value = sessionState.prompt;
  }
};

const syncModelControls = () => {
  const sourceId = getCurrentModelSourceId();

  if (sourceId === "ollama" && sessionState.local.available === false) {
    disableModelControls("ollama not found");
    return;
  }

  const resolvedModel = setModelOptions(sourceId, getModelOptions(sourceId), getCurrentModelValue());

  if (resolvedModel && getCurrentModelValue() !== resolvedModel) {
    setCurrentModelValue(resolvedModel);
    writeSessionState();
  }
};

const syncRunAvailability = () => {
  const blockedByLocal = sessionState.mode === "local" && sessionState.local.available === false;
  runAgentButton.disabled = runInFlight || blockedByLocal;
};

const syncInterface = () => {
  syncModeControls();
  syncDirectControls();
  syncLocalControls();
  syncPromptField();
  syncModelControls();
  syncCtaState();
  syncRunAvailability();
};

const loadModelOptionsForSource = async (
  sourceId: ModelSourceId,
  options?: { silent?: boolean },
) => {
  if (modelOptionsLoading.has(sourceId)) {
    return;
  }

  modelOptionsLoading.add(sourceId);

  try {
    let modelOptions = STATIC_MODEL_OPTIONS[sourceId];

    if (sourceId === "openrouter") {
      modelOptions = await fetchOpenRouterModels();
    } else if (sourceId === LOCAL_ENGINE_ID) {
      modelOptions = await fetchOllamaModels();
      sessionState.local.available = true;
    }

    modelOptionsCache.set(sourceId, modelOptions.length ? modelOptions : STATIC_MODEL_OPTIONS[sourceId]);
    writeSessionState();

    if (getCurrentModelSourceId() === sourceId) {
      syncInterface();
    }
  } catch (error) {
    if (sourceId === LOCAL_ENGINE_ID) {
      sessionState.local.available = false;
      modelOptionsCache.delete(sourceId);
      writeSessionState();

      if (sessionState.mode === "local") {
        syncInterface();
      }
    } else {
      modelOptionsCache.set(sourceId, STATIC_MODEL_OPTIONS[sourceId]);

      if (!options?.silent && getCurrentModelSourceId() === sourceId) {
        const message = error instanceof Error ? error.message : "model list failed.";
        setWarning(message, { flashMs: NOTICE_FLASH_MS });
      }

      if (getCurrentModelSourceId() === sourceId) {
        syncInterface();
      }
    }
  } finally {
    modelOptionsLoading.delete(sourceId);
    syncRunAvailability();
  }
};

const refreshCurrentModels = (options?: { silent?: boolean }) =>
  loadModelOptionsForSource(getCurrentModelSourceId(), options);

const setMode = (mode: Mode) => {
  sessionState.mode = mode;
  writeSessionState();
  syncInterface();

  if (mode === "local") {
    void refreshCurrentModels({ silent: true });
  } else {
    void refreshCurrentModels({ silent: true });
  }

  setWarning("");
  setStatus("");
};

const runAgent = async () => {
  if (ctaMode === "mint") {
    setStatus("mint is not wired yet.", { flashMs: NOTICE_FLASH_MS });
    return;
  }

  const prompt = sessionState.prompt.trim();
  const model = getCurrentModelValue().trim();

  if (!prompt) {
    setWarning("prompt is required.");
    setStatus("");
    return;
  }

  if (!model) {
    setWarning("model is required.");
    setStatus("");
    return;
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    setWarning("authorize openrouter first.");
    setStatus("");
    return;
  }

  if (sessionState.mode === "direct" && !sessionState.direct.apiKey.trim()) {
    setWarning("api key is required.");
    setStatus("");
    return;
  }

  if (sessionState.mode === "local" && sessionState.local.available === false) {
    setWarning("ollama not found.");
    setStatus("");
    return;
  }

  setWarning("");
  setStatus("running...");
  runInFlight = true;
  syncRunAvailability();

  try {
    let text = "";
    let provider = "";

    if (sessionState.mode === "connect") {
      provider = "openrouter";
      text = await requestOpenRouterChat(sessionState.connect.apiKey.trim(), model, prompt);
    } else if (sessionState.mode === "direct") {
      provider = sessionState.direct.provider;
      const apiKey = sessionState.direct.apiKey.trim();

      if (provider === "openai") {
        text = await requestOpenAIResponses(apiKey, model, prompt);
      } else if (provider === "openrouter") {
        text = await requestOpenRouterChat(apiKey, model, prompt);
      } else {
        text = await requestAnthropicMessages(apiKey, model, prompt);
      }
    } else {
      provider = LOCAL_ENGINE_ID;
      text = await requestOllama(model, prompt);
    }

    const normalizedText = normalizeEnglishInput(text).value.trim();

    if (!normalizedText) {
      throw new Error("agent returned no text.");
    }

    recordThoughtRun(sessionState.mode, provider, model, prompt, text, normalizedText);
    setAgentOutput(text);
    ctaMode = "mint";
    syncCtaState();
    setStatus("done.", { flashMs: NOTICE_FLASH_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent request failed.";
    setWarning(message);
    setStatus("failed.");
  } finally {
    runInFlight = false;
    syncRunAvailability();
  }
};

modeConnectButton.addEventListener("click", () => {
  setMode("connect");
});

modeDirectButton.addEventListener("click", () => {
  setMode("direct");
});

modeLocalButton.addEventListener("click", () => {
  setMode("local");
});

providerBox.addEventListener("change", () => {
  if (!isDirectProviderId(providerBox.value)) {
    return;
  }

  sessionState.direct.provider = providerBox.value;
  sessionState.direct.apiKey = "";
  sessionState.direct.model = DIRECT_PROVIDERS[providerBox.value].defaultModel;
  writeSessionState();
  syncInterface();
  void refreshCurrentModels({ silent: true });
  setWarning("");
  setStatus("");
});

apiKeyBox.addEventListener("input", () => {
  sessionState.direct.apiKey = apiKeyBox.value.trim();
  writeSessionState();
  setWarning("");
});

modelBox.addEventListener("change", () => {
  syncManualModelField();

  if (modelBox.value === MANUAL_MODEL_VALUE) {
    modelManualBox.focus();
  }

  setCurrentModelValue(getSelectedModelValue());
  writeSessionState();
  setWarning("");
});

modelManualBox.addEventListener("input", () => {
  setCurrentModelValue(modelManualBox.value.trim());
  writeSessionState();
  setWarning("");
});

promptBox.addEventListener("input", () => {
  sessionState.prompt = promptBox.value;
  writeSessionState();
  setWarning("");
});

promptBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    void runAgent();
  }
});

connectOpenRouterButton.addEventListener("click", () => {
  connectOpenRouterButton.disabled = true;
  setWarning("");
  setStatus("opening openrouter...");

  void startOpenRouterConnect().catch((error) => {
    const message = error instanceof Error ? error.message : "openrouter connect failed.";
    connectOpenRouterButton.disabled = false;
    setWarning(message);
    setStatus("failed.");
  });
});

disconnectOpenRouterButton.addEventListener("click", () => {
  disconnectOpenRouter();
});

runAgentButton.addEventListener("click", () => {
  void runAgent();
});

resetThoughtButton.addEventListener("click", () => {
  resetThought();
});

const handleViewportResize = () => {
  syncOutputToCanvas(currentOutputText, { suppressWarning: true });
};

window.addEventListener("resize", handleViewportResize);
window.visualViewport?.addEventListener("resize", handleViewportResize);

const initFrontpage = async () => {
  syncInterface();
  resetThought();

  try {
    await handleOpenRouterCallback();
    void refreshCurrentModels({ silent: true });
  } catch (error) {
    cleanOpenRouterCallbackUrl();
    const message = error instanceof Error ? error.message : "openrouter connect failed.";
    setWarning(message);
    setStatus("failed.");
  }

  void document.fonts.load(`100 12px ${CANVAS_TEXT_FAMILY}`).then(() => {
    syncOutputToCanvas(currentOutputText, { suppressWarning: true });
  });
};

void initFrontpage();
