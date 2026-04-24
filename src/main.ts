import "@fontsource/source-code-pro/200.css";
import "@fontsource/source-code-pro/300.css";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/source-code-pro/600.css";
import "@fontsource/source-code-pro/700.css";
import "@fontsource/source-code-pro/800.css";
import "@fontsource/source-code-pro/900.css";
import "@fontsource-variable/roboto-mono/wght.css";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

import thoughtInstructions from "../THOUGHT.md?raw";
import thoughtInstructionsUrl from "../THOUGHT.md?url";
import colorFontRaw from "../colorFontJSON/colorfont.byToolv2.json?raw";
import addresses from "../evm/addresses.anvil.json";

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

type ThoughtInstructionsOverride = {
  name: string;
  content: string;
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

type EvmAddresses = {
  rpcUrl?: string;
  chainId?: number;
  thoughtToken?: {
    address?: string;
  };
};

type EthereumProvider = {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

type MintTxState = "idle" | "awaiting_signature" | "submitted" | "failed";

type ThoughtRunState = "idle" | "running" | "output_ready" | "run_failed";

type PrimaryActionState =
  | "run"
  | "retry_run"
  | "connect_wallet"
  | "switch_wallet"
  | "mint"
  | "retry_mint"
  | "none";

type SecondaryActionState = "reset" | "view_tx" | "none";

type ActionPresentation = {
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryAction: PrimaryActionState;
  status: string;
  secondaryLabel: string;
  secondaryAction: SecondaryActionState;
  hidePrimary?: boolean;
};

type WalletDotState = "off" | "on" | "pending" | "error";

type ThoughtWalletState = {
  detected: boolean;
  address: string;
  chainId: number | null;
  txState: MintTxState;
  txHash: string;
  txError: string;
  mintPrice: bigint | null;
  balance: bigint | null;
  preflightLoading: boolean;
  preflightError: string;
  mintedTokenId: number | null;
  menuOpen: boolean;
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
const THOUGHT_INSTRUCTIONS_OVERRIDE_KEY = "thought-instructions-override";
const ENABLE_THOUGHT_UPLOAD = window.location.port === "5188";
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
const EVM_ADDRESSES = addresses as EvmAddresses;
const THOUGHT_RPC_URL = EVM_ADDRESSES.rpcUrl?.trim() ?? "";
const THOUGHT_CHAIN_ID = EVM_ADDRESSES.chainId ?? 31337;
const THOUGHT_CHAIN_ID_HEX = `0x${THOUGHT_CHAIN_ID.toString(16)}`;
const THOUGHT_TOKEN_ADDRESS = EVM_ADDRESSES.thoughtToken?.address?.trim() ?? "";
const THOUGHT_CHAIN_NAME = THOUGHT_CHAIN_ID === 31337 ? "Anvil Local" : THOUGHT_CHAIN_ID === 11155111 ? "Sepolia" : "THOUGHT";
const THOUGHT_EXPLORER_BASE_URL = THOUGHT_CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : "";
const THOUGHT_TOKEN_ABI = [
  "function mint(string rawText) payable returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function thoughtText(uint256 tokenId) view returns (string)",
  "function authorOf(uint256 tokenId) view returns (address)",
  "event ThoughtMinted(uint256 indexed tokenId, address indexed author, string text)",
] as const;

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
const thoughtFileField = document.getElementById("thought-file-field") as HTMLElement | null;
const uploadThoughtFileButton = document.getElementById("upload-thought-file") as HTMLButtonElement | null;
const clearThoughtFileButton = document.getElementById("clear-thought-file") as HTMLButtonElement | null;
const thoughtFileInput = document.getElementById("thought-file-input") as HTMLInputElement | null;
const thoughtFileStatus = document.getElementById("thought-file-status") as HTMLElement | null;
const runAgentButton = document.getElementById("run-agent") as HTMLButtonElement | null;
const actionStatusCopy = document.getElementById("action-status-copy") as HTMLElement | null;
const mintWalletToggle = document.getElementById("mint-wallet-toggle") as HTMLButtonElement | null;
const mintWalletDot = document.getElementById("mint-wallet-dot") as HTMLElement | null;
const mintWalletMenu = document.getElementById("mint-wallet-menu") as HTMLElement | null;
const mintWalletAddress = document.getElementById("mint-wallet-address") as HTMLElement | null;
const mintWalletNetwork = document.getElementById("mint-wallet-network") as HTMLElement | null;
const mintWalletTokenRow = document.getElementById("mint-wallet-token-row") as HTMLElement | null;
const mintWalletToken = document.getElementById("mint-wallet-token") as HTMLElement | null;
const mintWalletCopyAddress = document.getElementById("mint-wallet-copy-address") as HTMLButtonElement | null;
const mintWalletCopyTx = document.getElementById("mint-wallet-copy-tx") as HTMLButtonElement | null;
const mintWalletRefresh = document.getElementById("mint-wallet-refresh") as HTMLButtonElement | null;
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
  !thoughtFileField ||
  !uploadThoughtFileButton ||
  !clearThoughtFileButton ||
  !thoughtFileInput ||
  !thoughtFileStatus ||
  !runAgentButton ||
  !actionStatusCopy ||
  !mintWalletToggle ||
  !mintWalletDot ||
  !mintWalletMenu ||
  !mintWalletAddress ||
  !mintWalletNetwork ||
  !mintWalletTokenRow ||
  !mintWalletToken ||
  !mintWalletCopyAddress ||
  !mintWalletCopyTx ||
  !mintWalletRefresh ||
  !resetThoughtButton ||
  !runStatus ||
  !warningBox ||
  !thoughtInstructionsLink ||
  !canvas
) {
  throw new Error("Front page elements are missing.");
}

localEngineValue.textContent = LOCAL_ENGINE_LABEL;

const context = canvas.getContext("2d");

if (!context) {
  throw new Error("Canvas 2D context is unavailable.");
}

let statusTimer: number | null = null;
let warningTimer: number | null = null;
let currentOutputText = "";
let runInFlight = false;
let runState: ThoughtRunState = "idle";
let walletConnectInFlight = false;
let primaryActionState: PrimaryActionState = "run";
let secondaryActionState: SecondaryActionState = "none";
let thoughtInstructionsObjectUrl: string | null = null;
const modelOptionsCache = new Map<ModelSourceId, ModelOption[]>();
const modelOptionsLoading = new Set<ModelSourceId>();
const walletState: ThoughtWalletState = {
  detected: false,
  address: "",
  chainId: null,
  txState: "idle",
  txHash: "",
  txError: "",
  mintPrice: null,
  balance: null,
  preflightLoading: false,
  preflightError: "",
  mintedTokenId: null,
  menuOpen: false,
};
let readProvider: JsonRpcProvider | null = null;
let readThoughtToken: Contract | null = null;
let walletListenersBound = false;

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

const readThoughtInstructionsOverride = (): ThoughtInstructionsOverride | null => {
  if (!ENABLE_THOUGHT_UPLOAD) {
    sessionStorage.removeItem(THOUGHT_INSTRUCTIONS_OVERRIDE_KEY);
    return null;
  }

  const raw = sessionStorage.getItem(THOUGHT_INSTRUCTIONS_OVERRIDE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ThoughtInstructionsOverride>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const content = typeof parsed.content === "string" ? parsed.content : "";

    if (!name || !content.trim()) {
      return null;
    }

    return { name, content };
  } catch {
    return null;
  }
};

let thoughtInstructionsOverride = readThoughtInstructionsOverride();

const writeThoughtInstructionsOverride = () => {
  if (!ENABLE_THOUGHT_UPLOAD) {
    sessionStorage.removeItem(THOUGHT_INSTRUCTIONS_OVERRIDE_KEY);
    return;
  }

  if (thoughtInstructionsOverride) {
    sessionStorage.setItem(
      THOUGHT_INSTRUCTIONS_OVERRIDE_KEY,
      JSON.stringify(thoughtInstructionsOverride),
    );
  } else {
    sessionStorage.removeItem(THOUGHT_INSTRUCTIONS_OVERRIDE_KEY);
  }
};

const getActiveThoughtInstructions = () =>
  (thoughtInstructionsOverride?.content ?? thoughtInstructions).trim();

const getActiveThoughtInstructionsLabel = () =>
  thoughtInstructionsOverride?.name ?? "bundled THOUGHT.md";

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const isOpenRouterConnectSupported = () => {
  if (isLoopbackHost(window.location.hostname)) {
    return true;
  }

  if (window.location.protocol !== "https:") {
    return false;
  }

  const port = window.location.port;
  return port === "" || port === "443" || port === "3000";
};

const getOpenRouterConnectConstraintMessage = () =>
  "openrouter connect needs localhost or https on port 443 or 3000. use direct mode on LAN http.";

const revokeThoughtInstructionsObjectUrl = () => {
  if (thoughtInstructionsObjectUrl) {
    URL.revokeObjectURL(thoughtInstructionsObjectUrl);
    thoughtInstructionsObjectUrl = null;
  }
};

const syncThoughtInstructionsLink = () => {
  revokeThoughtInstructionsObjectUrl();

  if (thoughtInstructionsOverride) {
    thoughtInstructionsObjectUrl = URL.createObjectURL(
      new Blob([thoughtInstructionsOverride.content], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    thoughtInstructionsLink.href = thoughtInstructionsObjectUrl;
    thoughtInstructionsLink.download = thoughtInstructionsOverride.name || "THOUGHT.md";
    thoughtInstructionsLink.title = `Open ${thoughtInstructionsOverride.name || "THOUGHT.md"}`;
    return;
  }

  thoughtInstructionsLink.href = thoughtInstructionsUrl;
  thoughtInstructionsLink.download = "";
  thoughtInstructionsLink.title = "Open bundled THOUGHT.md";
};

const getInjectedProviders = () => {
  const injected = (window as Window & { ethereum?: EthereumProvider }).ethereum;

  if (!injected) {
    return [];
  }

  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return injected.providers.filter(Boolean);
  }

  return [injected];
};

const getEthereumProvider = () => {
  const providers = getInjectedProviders();
  return providers.find((provider) => provider.isMetaMask) ?? providers[0] ?? null;
};

const extractPrimaryAccount = (accounts: unknown) =>
  Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";

const waitForWalletAddress = async (ethereum: EthereumProvider, timeoutMs = 18000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const account = extractPrimaryAccount(await ethereum.request({ method: "eth_accounts" }));
      if (account) {
        return account;
      }
    } catch {
      // Keep polling while the wallet prompt is open.
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 250);
    });
  }

  return "";
};

const getReadProvider = () => {
  if (!THOUGHT_RPC_URL) {
    return null;
  }

  if (!readProvider) {
    readProvider = new JsonRpcProvider(THOUGHT_RPC_URL);
  }

  return readProvider;
};

const getReadThoughtToken = () => {
  const provider = getReadProvider();
  if (!provider || !THOUGHT_TOKEN_ADDRESS) {
    return null;
  }

  if (!readThoughtToken) {
    readThoughtToken = new Contract(THOUGHT_TOKEN_ADDRESS, THOUGHT_TOKEN_ABI, provider);
  }

  return readThoughtToken;
};

const copyToClipboard = async (value: string) => {
  if (!value) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
};

const getWalletNetworkLabel = () => {
  if (walletState.chainId === null) {
    return "not connected";
  }

  if (walletState.chainId === THOUGHT_CHAIN_ID) {
    return THOUGHT_CHAIN_NAME;
  }

  return `chain ${walletState.chainId}`;
};

const getWalletDotState = (): WalletDotState => {
  if (walletState.txState === "awaiting_signature" || walletState.txState === "submitted") {
    return "pending";
  }

  if (
    walletState.txState === "failed" ||
    (walletState.address && walletState.chainId !== null && walletState.chainId !== THOUGHT_CHAIN_ID) ||
    (!!walletState.preflightError && !!walletState.address && walletState.chainId === THOUGHT_CHAIN_ID)
  ) {
    return "error";
  }

  if (walletState.address && walletState.chainId === THOUGHT_CHAIN_ID) {
    return "on";
  }

  return "off";
};

const hasModelAccess = () => {
  if (sessionState.mode === "connect") {
    return sessionState.connect.apiKey.trim().length > 0;
  }

  if (sessionState.mode === "direct") {
    return sessionState.direct.apiKey.trim().length > 0;
  }

  return sessionState.local.available === true;
};

const getActionPresentation = (): ActionPresentation => {
  const hasOutput = currentOutputText.length > 0;

  if (runState === "running" || runInFlight) {
    return {
      primaryLabel: "[ running ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  if (walletState.txState === "awaiting_signature") {
    return {
      primaryLabel: "[ minting ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "confirm in wallet",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  if (walletState.txState === "submitted") {
    return {
      primaryLabel: "[ minting ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "pending tx",
      secondaryLabel: "[ view tx ]",
      secondaryAction: "view_tx",
    };
  }

  if (walletState.mintedTokenId !== null) {
    return {
      primaryLabel: "",
      primaryDisabled: true,
      primaryAction: "none",
      status: "minted",
      secondaryLabel: "[ view tx ]",
      secondaryAction: "view_tx",
      hidePrimary: true,
    };
  }

  if (walletState.txState === "failed") {
    return {
      primaryLabel: "[ retry ]",
      primaryDisabled: false,
      primaryAction: "retry_mint",
      status: "mint failed",
      secondaryLabel: "[ reset ]",
      secondaryAction: "reset",
    };
  }

  if (hasOutput) {
    if (walletConnectInFlight) {
      return {
        primaryLabel: "[ connect wallet ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "approve in wallet",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (!THOUGHT_RPC_URL || !THOUGHT_TOKEN_ADDRESS) {
      return {
        primaryLabel: "[ mint ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "mint unavailable",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (!walletState.detected || !walletState.address) {
      return {
        primaryLabel: "[ connect wallet ]",
        primaryDisabled: false,
        primaryAction: "connect_wallet",
        status: "output ready",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (walletState.chainId !== THOUGHT_CHAIN_ID) {
      return {
        primaryLabel: "[ switch wallet ]",
        primaryDisabled: false,
        primaryAction: "switch_wallet",
        status: "output ready",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (walletState.preflightLoading) {
      return {
        primaryLabel: "[ mint ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "checking wallet",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (walletState.preflightError) {
      return {
        primaryLabel: "[ mint ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "mint not ready",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    if (
      walletState.mintPrice !== null &&
      walletState.balance !== null &&
      walletState.balance < walletState.mintPrice
    ) {
      return {
        primaryLabel: "[ mint ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "not enough eth",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
    }

    return {
      primaryLabel: "[ mint ]",
      primaryDisabled: false,
      primaryAction: "mint",
      status: "ready",
      secondaryLabel: "[ reset ]",
      secondaryAction: "reset",
    };
  }

  if (runState === "run_failed") {
    return {
      primaryLabel: "[ retry ]",
      primaryDisabled: !hasModelAccess(),
      primaryAction: hasModelAccess() ? "retry_run" : "none",
      status: "generation failed",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  return {
    primaryLabel: "[ run ]",
    primaryDisabled: !hasModelAccess(),
    primaryAction: hasModelAccess() ? "run" : "none",
    status: hasModelAccess() ? "" : "model access needed",
    secondaryLabel: "",
    secondaryAction: "none",
  };
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

const syncWalletMenu = () => {
  mintWalletAddress.textContent = walletState.address || "-";
  mintWalletNetwork.textContent = getWalletNetworkLabel();
  mintWalletToken.textContent =
    walletState.mintedTokenId === null ? "-" : `#${walletState.mintedTokenId}`;
  mintWalletTokenRow.classList.toggle("is-hidden", walletState.mintedTokenId === null);
  mintWalletCopyAddress.disabled = walletState.address.length === 0;
  mintWalletCopyTx.classList.toggle("is-hidden", walletState.txHash.length === 0);
  mintWalletToggle.setAttribute("aria-expanded", walletState.menuOpen ? "true" : "false");
  mintWalletMenu.classList.toggle("is-hidden", !walletState.menuOpen);

  mintWalletDot.classList.remove("is-on", "is-pending", "is-error", "is-off");
  mintWalletDot.classList.add(`is-${getWalletDotState()}`);
};

const syncThoughtInstructionsControls = () => {
  thoughtFileField.classList.toggle("is-hidden", !ENABLE_THOUGHT_UPLOAD);
  thoughtFileStatus.textContent = `using ${getActiveThoughtInstructionsLabel()}.`;
  syncThoughtInstructionsLink();
  clearThoughtFileButton.classList.toggle(
    "is-hidden",
    !ENABLE_THOUGHT_UPLOAD || !thoughtInstructionsOverride,
  );
};

const syncPrimaryCtaAvailability = () => {
  const action = getActionPresentation();
  primaryActionState = action.primaryAction;
  secondaryActionState = action.secondaryAction;
  runAgentButton.disabled = action.primaryDisabled;
};

const refreshMintPreflight = async () => {
  walletState.preflightLoading = true;
  walletState.preflightError = "";
  syncPrimaryCtaAvailability();

  const token = getReadThoughtToken();
  const provider = getReadProvider();

  if (!token || !provider) {
    walletState.mintPrice = null;
    walletState.balance = null;
    walletState.preflightLoading = false;
    walletState.preflightError = "mint contract not configured.";
    syncPrimaryCtaAvailability();
    syncWalletMenu();
    return;
  }

  try {
    walletState.mintPrice = (await token.mintPrice()) as bigint;
    walletState.balance = walletState.address ? await provider.getBalance(walletState.address) : null;
    walletState.preflightError = "";
  } catch (error) {
    walletState.mintPrice = null;
    walletState.balance = null;
    walletState.preflightError =
      error instanceof Error ? error.message : "mint preflight failed.";
  } finally {
    walletState.preflightLoading = false;
    syncPrimaryCtaAvailability();
    syncWalletMenu();
  }
};

const refreshWalletState = async () => {
  const ethereum = getEthereumProvider();
  walletState.detected = ethereum !== null;

  if (!ethereum) {
    walletState.address = "";
    walletState.chainId = null;
    await refreshMintPreflight();
    return;
  }

  try {
    const [accounts, chainHex] = await Promise.all([
      ethereum.request({ method: "eth_accounts" }),
      ethereum.request({ method: "eth_chainId" }),
    ]);

    walletState.address =
      Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    walletState.chainId =
      typeof chainHex === "string" && chainHex.length > 0 ? Number(BigInt(chainHex)) : null;
  } catch {
    walletState.address = "";
    walletState.chainId = null;
  }

  await refreshMintPreflight();
};

const bindWalletProviderEvents = () => {
  if (walletListenersBound) {
    return;
  }

  const providers = getInjectedProviders().filter((provider) => typeof provider.on === "function");
  if (providers.length === 0) {
    return;
  }

  const handleWalletChange = () => {
    void refreshWalletState().then(() => {
      syncInterface();
    });
  };

  providers.forEach((provider) => {
    provider.on?.("accountsChanged", handleWalletChange);
    provider.on?.("chainChanged", handleWalletChange);
  });
  walletListenersBound = true;
};

const requestWalletConnect = async () => {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    setWarning("No supported wallet found.");
    setStatus("");
    return;
  }

  setWarning("");
  walletConnectInFlight = true;
  syncInterface();

  try {
    const existingAccount = extractPrimaryAccount(await ethereum.request({ method: "eth_accounts" }));

    if (!existingAccount) {
      let requestError: unknown = null;
      const requestAccounts = ethereum
        .request({ method: "eth_requestAccounts" })
        .then((accounts) => extractPrimaryAccount(accounts))
        .catch((error) => {
          requestError = error;
          return "";
        });

      const detectedAccount = await Promise.race([
        requestAccounts,
        waitForWalletAddress(ethereum),
      ]);

      if (!detectedAccount) {
        const requestedAccount = await requestAccounts;
        if (!requestedAccount && requestError) {
          throw requestError;
        }
      }
    }

    await refreshWalletState();

    if (!walletState.address) {
      throw new Error("wallet did not expose an account.");
    }

    syncInterface();
    setStatus("wallet connected.", { flashMs: NOTICE_FLASH_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "wallet connect failed.";
    setWarning(message);
    setStatus("");
  } finally {
    walletConnectInFlight = false;
    syncInterface();
  }
};

const switchWalletChain = async () => {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    setWarning("No supported wallet found.");
    setStatus("");
    return;
  }

  setWarning("");
  setStatus("");

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: THOUGHT_CHAIN_ID_HEX }],
    });
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code?: unknown }).code)
        : null;

    if (errorCode === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: THOUGHT_CHAIN_ID_HEX,
            chainName: THOUGHT_CHAIN_NAME,
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: THOUGHT_RPC_URL ? [THOUGHT_RPC_URL] : [],
            blockExplorerUrls: THOUGHT_EXPLORER_BASE_URL ? [THOUGHT_EXPLORER_BASE_URL] : [],
          },
        ],
      });
    } else {
      const message = error instanceof Error ? error.message : "wallet switch failed.";
      setWarning(message);
      setStatus("");
      return;
    }
  }

  await refreshWalletState();
  syncInterface();
  setStatus("chain ready.", { flashMs: NOTICE_FLASH_MS });
};

const extractMintedTokenId = (receipt: { logs?: Array<{ topics: string[]; data: string }> }) => {
  const contract = getReadThoughtToken();
  if (!contract) {
    return null;
  }

  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "ThoughtMinted") {
        return Number(parsed.args[0]);
      }
    } catch {
      continue;
    }
  }

  return null;
};

const handlePendingTx = async () => {
  if (!walletState.txHash) {
    return;
  }

  const copied = await copyToClipboard(walletState.txHash);
  if (copied) {
    setStatus("tx hash copied.", { flashMs: NOTICE_FLASH_MS });
  }
};

const handleMint = async () => {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    setWarning("No supported wallet found.");
    setStatus("");
    return;
  }

  if (!THOUGHT_TOKEN_ADDRESS) {
    setWarning("thought token is not deployed.");
    setStatus("");
    return;
  }

  try {
    const browserProvider = new BrowserProvider(ethereum);
    const signer = await browserProvider.getSigner();
    const mintPrice =
      walletState.mintPrice ?? ((await getReadThoughtToken()?.mintPrice()) as bigint | undefined) ?? 0n;
    const writableToken = new Contract(THOUGHT_TOKEN_ADDRESS, THOUGHT_TOKEN_ABI, signer);

    walletState.txState = "awaiting_signature";
    walletState.txError = "";
    syncInterface();
    setWarning("");
    setStatus("");

    const tx = await writableToken.mint(currentOutputText, { value: mintPrice });
    walletState.txState = "submitted";
    walletState.txHash = tx.hash;
    syncInterface();
    setStatus("");

    const receipt = await tx.wait();
    const mintedTokenId = extractMintedTokenId(receipt ?? { logs: [] });

    walletState.txState = "idle";
    walletState.txError = "";
    walletState.mintedTokenId = mintedTokenId;
    walletState.txHash = tx.hash;
    await refreshMintPreflight();
    syncInterface();
    setStatus(
      mintedTokenId === null ? "minted." : `minted #${mintedTokenId}.`,
      { flashMs: NOTICE_FLASH_MS },
    );
  } catch (error) {
    walletState.txState = "failed";
    walletState.txError = error instanceof Error ? error.message : "mint failed.";
    syncInterface();
    setWarning(walletState.txError);
    setStatus("");
  }
};

const handleViewTx = async () => {
  if (!walletState.txHash) {
    return;
  }

  if (THOUGHT_EXPLORER_BASE_URL) {
    window.open(`${THOUGHT_EXPLORER_BASE_URL}/tx/${walletState.txHash}`, "_blank", "noopener,noreferrer");
    return;
  }

  const copied = await copyToClipboard(walletState.txHash);
  if (copied) {
    setStatus("tx hash copied.", { flashMs: NOTICE_FLASH_MS });
  }
};

const syncCtaState = () => {
  const action = getActionPresentation();

  primaryActionState = action.primaryAction;
  secondaryActionState = action.secondaryAction;
  runAgentButton.textContent = action.primaryLabel;
  runAgentButton.disabled = action.primaryDisabled;
  runAgentButton.classList.toggle("is-hidden", !!action.hidePrimary);
  actionStatusCopy.textContent = action.status;
  actionStatusCopy.classList.toggle("is-hidden", action.status.length === 0);
  resetThoughtButton.textContent = action.secondaryLabel;
  resetThoughtButton.classList.toggle("is-hidden", action.secondaryAction === "none");
  resetThoughtButton.setAttribute("aria-label", action.secondaryLabel.replace(/[\[\]]/g, "").trim() || "Secondary thought action");

  walletState.menuOpen = false;
  mintWalletToggle.classList.add("is-hidden");
  mintWalletMenu.classList.add("is-hidden");
  syncWalletMenu();
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
  runState = "idle";
  walletConnectInFlight = false;
  currentOutputText = "";
  walletState.txState = "idle";
  walletState.txError = "";
  walletState.txHash = "";
  walletState.mintedTokenId = null;
  walletState.menuOpen = false;
  syncOutputToCanvas("", { suppressWarning: true });
  setWarning("");
  setStatus("");
  syncCtaState();
  syncPrimaryCtaAvailability();
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
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const rotateRight = (value: number, shift: number) =>
  (value >>> shift) | (value << (32 - shift));

const sha256Fallback = (input: Uint8Array) => {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);
  const bitLength = input.length * 8;
  const paddingLength = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(input.length + 1 + paddingLength + 8);
  const view = new DataView(padded.buffer);
  const words = new Uint32Array(64);

  padded.set(input);
  padded[input.length] = 0x80;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const sigma0 =
        rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^
        (words[index - 15] >>> 3);
      const sigma1 =
        rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^
        (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  state.forEach((value, index) => {
    digestView.setUint32(index * 4, value, false);
  });
  return digest;
};

const createCodeChallenge = async (verifier: string) => {
  const encoded = new TextEncoder().encode(verifier);
  const subtle = globalThis.crypto?.subtle;

  if (subtle?.digest) {
    const digest = await subtle.digest("SHA-256", encoded);
    return base64UrlEncode(new Uint8Array(digest));
  }

  return base64UrlEncode(sha256Fallback(encoded));
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
  [getActiveThoughtInstructions(), "", "User prompt:", prompt.trim(), "", "Response:"].join("\n");

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
      instructions: getActiveThoughtInstructions(),
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
      system: getActiveThoughtInstructions(),
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
        { role: "system", content: getActiveThoughtInstructions() },
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
    setStatus("openrouter linked.", { flashMs: NOTICE_FLASH_MS });
    return true;
  } finally {
    connectOpenRouterButton.disabled = false;
  }
};

const startOpenRouterConnect = async () => {
  if (!isOpenRouterConnectSupported()) {
    throw new Error(getOpenRouterConnectConstraintMessage());
  }

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

const formatModelLabel = (label: string, maxLength = 28) => {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
};

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
    const renderedOption = new Option(formatModelLabel(option.label), option.id);
    renderedOption.title = option.label;
    modelBox.append(renderedOption);
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
  modelBox.title = resolvedModel;
  modelManualBox.title = modelManualBox.value.trim();
  return allowManual && modelBox.value === MANUAL_MODEL_VALUE
    ? modelManualBox.value.trim()
    : modelBox.value.trim();
};

const disableModelControls = (message: string) => {
  modelBox.replaceChildren(new Option(message, ""));
  modelBox.disabled = true;
  modelBox.title = "";
  modelManualBox.value = "";
  modelManualBox.title = "";
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
  const connectSupported = isOpenRouterConnectSupported();

  connectPanel.classList.toggle("is-hidden", !isConnectMode);
  connectOpenRouterButton.classList.toggle("is-hidden", hasCredential);
  connectStatusRow.classList.toggle("is-hidden", !hasCredential);
  connectStatusCopy.textContent = "openrouter linked";
  connectOpenRouterButton.disabled = hasCredential ? false : !connectSupported;
  connectOpenRouterButton.title = connectSupported ? "" : getOpenRouterConnectConstraintMessage();

  if (!hasCredential) {
    connectOpenRouterButton.textContent = connectSupported
      ? "[ authorize openrouter ]"
      : "[ openrouter connect unavailable ]";
  }
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
  localHelper.classList.add("is-hidden");
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
    localStatus.innerHTML = "ollama detected.<br />runs on this machine.<br />no cloud call.";
  } else if (sessionState.local.available === false) {
    localStatus.innerHTML = "ollama not found.<br />start ollama, then retry.";
  } else {
    localStatus.innerHTML = "checking ollama...";
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
  syncPrimaryCtaAvailability();
};

const syncInterface = () => {
  syncModeControls();
  syncDirectControls();
  syncLocalControls();
  syncPromptField();
  syncModelControls();
  syncThoughtInstructionsControls();
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

  if (mode === "connect" && !sessionState.connect.apiKey.trim() && !isOpenRouterConnectSupported()) {
    setWarning(getOpenRouterConnectConstraintMessage());
  } else {
    setWarning("");
  }

  setStatus("");
};

const setThoughtInstructionsOverride = (override: ThoughtInstructionsOverride | null) => {
  thoughtInstructionsOverride = ENABLE_THOUGHT_UPLOAD ? override : null;
  writeThoughtInstructionsOverride();
  syncThoughtInstructionsControls();
};

const handleThoughtFileSelection = async () => {
  const file = thoughtFileInput.files?.[0];
  thoughtFileInput.value = "";

  if (!file) {
    return;
  }

  try {
    const content = await file.text();

    if (!content.trim()) {
      throw new Error("THOUGHT.md is empty.");
    }

    setThoughtInstructionsOverride({
      name: file.name || "uploaded THOUGHT.md",
      content,
    });
    setWarning("");
    setStatus(`loaded ${file.name || "THOUGHT.md"}.`, { flashMs: NOTICE_FLASH_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "THOUGHT.md upload failed.";
    setWarning(message, { flashMs: NOTICE_FLASH_MS });
    setStatus("failed.");
  }
};

const runAgent = async () => {
  if (primaryActionState === "connect_wallet") {
    await requestWalletConnect();
    return;
  }

  if (primaryActionState === "switch_wallet") {
    await switchWalletChain();
    return;
  }

  if (primaryActionState === "mint" || primaryActionState === "retry_mint") {
    await handleMint();
    return;
  }

  if (primaryActionState === "none") {
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
  setStatus("");
  runState = "running";
  runInFlight = true;
  syncInterface();

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
    runState = "output_ready";
    walletState.txState = "idle";
    walletState.txError = "";
    walletState.txHash = "";
    walletState.mintedTokenId = null;
    syncCtaState();
    void refreshWalletState().then(() => {
      syncInterface();
    });
    setStatus("");
  } catch (error) {
    runState = "run_failed";
    const message = error instanceof Error ? error.message : "agent request failed.";
    setWarning(message);
    setStatus("");
  } finally {
    runInFlight = false;
    syncInterface();
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
  modelBox.title = getSelectedModelValue();
  writeSessionState();
  setWarning("");
});

modelManualBox.addEventListener("input", () => {
  setCurrentModelValue(modelManualBox.value.trim());
  modelManualBox.title = modelManualBox.value.trim();
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

uploadThoughtFileButton.addEventListener("click", () => {
  thoughtFileInput.click();
});

thoughtFileInput.addEventListener("change", () => {
  void handleThoughtFileSelection();
});

clearThoughtFileButton.addEventListener("click", () => {
  setThoughtInstructionsOverride(null);
  setWarning("");
  setStatus("using bundled THOUGHT.md.", { flashMs: NOTICE_FLASH_MS });
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

mintWalletToggle.addEventListener("click", () => {
  if (mintWalletToggle.classList.contains("is-hidden")) {
    return;
  }

  walletState.menuOpen = !walletState.menuOpen;
  syncWalletMenu();
});

mintWalletCopyAddress.addEventListener("click", () => {
  void copyToClipboard(walletState.address).then((copied) => {
    if (copied) {
      walletState.menuOpen = false;
      syncWalletMenu();
      setStatus("address copied.", { flashMs: NOTICE_FLASH_MS });
    }
  });
});

mintWalletCopyTx.addEventListener("click", () => {
  void handlePendingTx().then(() => {
    walletState.menuOpen = false;
    syncWalletMenu();
  });
});

mintWalletRefresh.addEventListener("click", () => {
  void refreshWalletState().then(() => {
    syncInterface();
    setStatus("wallet refreshed.", { flashMs: NOTICE_FLASH_MS });
  });
});

runAgentButton.addEventListener("click", () => {
  void runAgent();
});

resetThoughtButton.addEventListener("click", () => {
  if (secondaryActionState === "reset") {
    resetThought();
    return;
  }

  if (secondaryActionState === "view_tx") {
    void handleViewTx();
  }
});

const handleViewportResize = () => {
  syncOutputToCanvas(currentOutputText, { suppressWarning: true });
};

window.addEventListener("resize", handleViewportResize);
window.visualViewport?.addEventListener("resize", handleViewportResize);
window.addEventListener("beforeunload", revokeThoughtInstructionsObjectUrl);
document.addEventListener("mousedown", (event) => {
  if (!walletState.menuOpen) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (mintWalletToggle.contains(target) || mintWalletMenu.contains(target)) {
    return;
  }

  walletState.menuOpen = false;
  syncWalletMenu();
});

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

  bindWalletProviderEvents();
  await refreshWalletState();
  syncInterface();

  void document.fonts.load(`100 12px ${CANVAS_TEXT_FAMILY}`).then(() => {
    syncOutputToCanvas(currentOutputText, { suppressWarning: true });
  });
};

void initFrontpage();
