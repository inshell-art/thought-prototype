import "@fontsource/source-code-pro/200.css";
import "@fontsource/source-code-pro/300.css";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/source-code-pro/600.css";
import "@fontsource/source-code-pro/700.css";
import "@fontsource/source-code-pro/800.css";
import "@fontsource/source-code-pro/900.css";
import "@fontsource-variable/roboto-mono/wght.css";
import {
  AbiCoder,
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  getBytes,
  id,
  keccak256,
  toUtf8Bytes,
  type JsonRpcSigner,
} from "ethers";

import thoughtInstructions from "../THOUGHT.md?raw";
import thoughtInstructionsUrl from "../THOUGHT.md?url";
import colorFontRaw from "../colorFontJSON/colorfont.byToolv2.json?raw";
import colorFontText from "../spec/COLOR_FONT.v1.txt?raw";
import addresses from "../evm/addresses.anvil.json";
import {
  COLOR_FONT_DOC_FORMAT,
  buildColorFontPlainText,
  validateColorFontDataShape,
  type ColorFontDoc,
} from "./color-font-doc";
import {
  appendThoughtWork,
  getLatestWork,
  getNextWork,
  getPreviousWork,
  getWorkById,
  parseWorkId,
  readThoughtWorks,
  writeThoughtWorks,
  type ThoughtWorkRecord,
  type WorkStorage,
} from "./works";
import {
  THOUGHT_MAX_OUTPUT_TOKENS,
  buildThoughtRunPayload,
  thoughtRunProvenanceConfig,
  toAnthropicMessagesPayload,
  toOllamaGeneratePayload,
  toOpenAIResponsesPayload,
  toOpenRouterChatPayload,
  type ThoughtRunPayload,
  type ThoughtRunProvider,
  type ThoughtRunProvenanceRequestConfig,
  type ThoughtRunWebConfig,
} from "./thought-run-payload";

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

type Mode = "connect" | "direct" | "local" | "my-brain";

type DirectProviderId = "openai" | "openrouter" | "anthropic";

type ModelSourceId = DirectProviderId | "ollama" | "my-brain";

type ProviderConfig = {
  id: DirectProviderId;
  label: string;
  defaultModel: string;
};

type ModelOption = {
  id: string;
  label: string;
};

type PendingMyBrainRound = {
  route: "my-brain";
  provider: "me";
  model: "my-brain";
  prompt: string;
  thoughtSpecId: string;
  thoughtSpecRef: string;
  thoughtSpecHash: string;
  startedAt: string;
  payload: ThoughtRunPayload;
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
  routeConfigured: boolean;
  mode: Mode;
  prompt: string;
  connect: {
    apiKey: string;
    model: string;
  };
  direct: {
    provider: DirectProviderId;
    apiKeys: Record<DirectProviderId, string>;
    model: string;
  };
  local: {
    available: boolean | null;
    endpoint: string;
    model: string;
  };
};

type EvmAddresses = {
  rpcUrl?: string;
  chainId?: number;
  explorerUrl?: string;
  recommendedThoughtSpecName?: string;
  recommendedThoughtSpecId?: string;
  recommendedThoughtSpecHash?: string;
  pathNft?: {
    address?: string;
  };
  thoughtSpecRegistry?: {
    address?: string;
  };
  thoughtNft?: {
    address?: string;
  };
  thoughtSpec?: {
    specName?: string;
    id?: string;
    hash?: string;
    ref?: string;
  };
  thoughtSpecs?: Array<{
    specName?: string;
    specId?: string;
    specHash?: string;
    ref?: string;
    pointer?: string;
    byteLength?: number;
  }>;
  colorFontV1?: {
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
type MintFlowErrorKind =
  | "none"
  | "thought"
  | "spec"
  | "path_invalid"
  | "path_not_found"
  | "path_consumed"
  | "path_not_ready"
  | "path_unknown"
  | "wrong_network"
  | "funds"
  | "signature"
  | "mint";
type MintFlowState =
  | "closed"
  | "thought_checking"
  | "text_taken"
  | "wallet_required"
  | "path_required"
  | "path_checking"
  | "path_ready"
  | "authorizing"
  | "authorized"
  | "minting"
  | "minted"
  | "error";

type ThoughtRunState = "idle" | "running" | "output_ready" | "run_failed";

type PrimaryActionState =
  | "run"
  | "retry_run"
  | "connect_wallet"
  | "switch_wallet"
  | "mint"
  | "retry_mint"
  | "none";

type SecondaryActionState = "reset" | "view_thought" | "view_tx" | "none";

type ThoughtDebugCtaOverride =
  | "auto"
  | "run"
  | "running"
  | "retry"
  | "mint"
  | "view_thought";

type ThoughtDebugCtaStatusOverride =
  | "auto"
  | "none"
  | "ready"
  | "minted"
  | "model_needed"
  | "generation_failed"
  | "mint_unavailable";

type ThoughtDebugWarningOverride =
  | "auto"
  | "none"
  | "prompt_required"
  | "model_required"
  | "openrouter_required"
  | "api_key_required"
  | "ollama_not_found"
  | "spec_unavailable"
  | "provider_error"
  | "external_service"
  | "openrouter_connect_constraint"
  | "wallet_missing"
  | "wallet_connect_failed"
  | "wallet_switch_failed"
  | "thought_too_large"
  | "mint_contract_unavailable";

type PanelWarningLevel = "info" | "warn" | "error";

type ThoughtDebugState = {
  open: boolean;
  enabled: boolean;
  cta: ThoughtDebugCtaOverride;
  ctaStatus: ThoughtDebugCtaStatusOverride;
  warning: ThoughtDebugWarningOverride;
};

type ActionPresentation = {
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryAction: PrimaryActionState;
  status: string;
  secondaryLabel: string;
  secondaryAction: SecondaryActionState;
  hidePrimary?: boolean;
};

type MintSheetAction =
  | "none"
  | "continue"
  | "connect_wallet"
  | "authorize"
  | "confirm_mint"
  | "view_tx"
  | "view_thought"
  | "choose_another"
  | "mint_path"
  | "refresh"
  | "reset"
  | "switch_network";

type MintSheetActionConfig = {
  action: MintSheetAction;
  disabled?: boolean;
  hidden?: boolean;
  label: string;
};

type MintFlowUiMode = "sheet" | "cli";

type CliEntryKind = "intro" | "command" | "output" | "error";

type CliEntry = {
  kind: CliEntryKind;
  lines: string[];
};

type CliSuggestion = {
  label: string;
  command: string;
};

type WalletDotState = "off" | "on" | "pending" | "error";

type ThoughtWalletState = {
  detected: boolean;
  address: string;
  chainId: number | null;
  txState: MintTxState;
  txHash: string;
  txError: string;
  balance: bigint | null;
  preflightLoading: boolean;
  preflightError: string;
  mintedTokenId: number | null;
  menuOpen: boolean;
};

type MintFlowData = {
  rawText: string;
  textHash: string;
  promptHash: string;
  thoughtSpecId: string;
  thoughtSpecHash: string;
  provenanceJson: string;
  existingTokenId: number | null;
  pathIdInput: string;
  pathId: bigint | null;
  deadline: bigint | null;
  signature: string;
  txHash: string;
  error: string;
  errorKind: MintFlowErrorKind;
};

type ThoughtRunContext = {
  mode: Mode;
  provider: ThoughtRunProvider;
  model: string;
  prompt: string;
  returnedText?: string;
  clientGeneratedAt: string;
  request?: ThoughtRunProvenanceRequestConfig;
  web?: ThoughtRunWebConfig;
  thoughtSpec?: {
    id: string;
    ref: string;
    hash: string;
  };
};

type ThoughtNFTMetadata = {
  name?: string;
  image?: string;
  thought?: {
    text?: string;
    provenance?: string;
  };
  properties?: {
    rawText?: string;
    provenanceJson?: string;
    textHash?: string;
    promptHash?: string;
    provenanceHash?: string;
    thoughtSpecId?: string;
    thoughtSpecHash?: string;
    pathId?: string | number;
    minter?: string;
    mintedAt?: string | number;
  };
};

type ThoughtNFTUriPayload = {
  metadata: ThoughtNFTMetadata;
  image: string;
};

type GalleryThought = {
  tokenId: number;
  pathId: string;
  minter: string;
  textHash: string;
  promptHash: string;
  provenanceHash: string;
  thoughtSpecId: string;
  thoughtSpecHash: string;
  mintedAt: number | null;
  rawText: string;
  prompt: string;
  mode: string;
  provider: string;
  model: string;
  returnedText: string;
  returnedTextHash: string;
  provenanceJson: string;
  image: string;
  tokenUri: string;
  txHash: string;
  blockNumber: number;
};

type ThoughtDetailSpec = {
  id: string;
  ref: string;
  hash: string;
  text: string;
};

type ThoughtDetail = {
  tokenId: number;
  rawText: string;
  prompt: string;
  returnedText: string;
  pathId: string;
  minter: string;
  mintedAt: number | null;
  txHash: string;
  textHash: string;
  promptHash: string;
  returnedTextHash: string;
  provenanceHash: string;
  mode: string;
  provider: string;
  model: string;
  thoughtSpec: ThoughtDetailSpec;
  provenanceJson: string;
  image: string;
};

type ActiveThoughtSpec = {
  specId: string;
  specHash: string;
  ref: string;
  pointer: string;
  byteLength: number;
  text: string;
  fetchedAt: string;
};

const CANVAS_WIDTH = 960;
const MIN_CANVAS_SIZE = 180;
const STACKED_MIN_CLI_HEIGHT = 160;
const IMAGE_SIZE = 29;
const IMAGE_GAP = 6;
const CANVAS_PADDING = 28;
const IMAGE_RADIUS = 0;
const BACKGROUND_FILL = "#050505";
const THOUGHT_SESSION_STORAGE_KEY = "thought-provider-session";
const THOUGHT_CLI_HISTORY_STORAGE_KEY = "thought-cli-command-history";
const THOUGHT_CLI_TRANSCRIPT_STORAGE_KEY = "thought-cli-transcript";
const THOUGHT_OUTPUT_STORAGE_KEY = "thought-current-output";
const THOUGHT_INSTRUCTIONS_OVERRIDE_KEY = "thought-instructions-override";
const ENABLE_THOUGHT_UPLOAD = window.location.port === "5188";
const OPENROUTER_PKCE_VERIFIER_KEY = "thought-openrouter-pkce-verifier";
const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/keys";
const OPENROUTER_MODEL_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const MANUAL_MODEL_VALUE = "__manual__";
const LEGACY_OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const LOCAL_MODEL_SOURCE_ID = "ollama";
const LOCAL_MODEL_LABEL = "ollama";
const LOCAL_DEFAULT_MODEL = "llama3.2:1b";
const MY_BRAIN_MODE = "my-brain";
const MY_BRAIN_MODEL_SOURCE_ID = "my-brain";
const MY_BRAIN_MODEL = "my-brain";
const MY_BRAIN_PROVIDER = "me";
const MY_BRAIN_DESCRIPTION = "human model route. you write the model return.";
const getStorageOrNull = (storage: () => Storage | null | undefined) => {
  try {
    const resolved = storage();
    resolved?.getItem("__thought_storage_probe__");
    return resolved ?? null;
  } catch {
    return null;
  }
};

const getSharedBrowserStorage = () =>
  getStorageOrNull(() => window.localStorage) ??
  getStorageOrNull(() => window.sessionStorage);

const getSessionStorage = () => getStorageOrNull(() => window.sessionStorage);

const readSharedBrowserItem = (key: string) => {
  const shared = getSharedBrowserStorage();
  const raw = shared?.getItem(key) ?? null;
  if (raw !== null) {
    return raw;
  }

  const session = getSessionStorage();
  const legacy = session?.getItem(key) ?? null;
  if (legacy !== null && shared && shared !== session) {
    shared.setItem(key, legacy);
  }
  return legacy;
};

const writeSharedBrowserItem = (key: string, value: string) => {
  const shared = getSharedBrowserStorage();
  if (!shared) return;
  shared.setItem(key, value);
  const session = getSessionStorage();
  if (session && shared !== session) {
    session.removeItem(key);
  }
};

const removeSharedBrowserItem = (key: string) => {
  getSharedBrowserStorage()?.removeItem(key);
  getSessionStorage()?.removeItem(key);
};

const thoughtBrowserStorage: WorkStorage = {
  getItem: readSharedBrowserItem,
  setItem: writeSharedBrowserItem,
  removeItem: removeSharedBrowserItem,
};

const readStoredThoughtWorks = () => readThoughtWorks(thoughtBrowserStorage);

const writeStoredThoughtWorks = (works: ThoughtWorkRecord[]) => {
  writeThoughtWorks(thoughtBrowserStorage, works);
};
const ROUTE_COPY: Record<Mode, {
  provider: string;
  defaultModelLabel: string;
  brief: string;
  stateLabel: string;
  useLines: string[];
}> = {
  local: {
    provider: LOCAL_MODEL_SOURCE_ID,
    defaultModelLabel: "<ollama model>",
    brief: "local model route. runs on this machine.",
    stateLabel: "ollama",
    useLines: [
      "config local detect",
      "config local endpoint <url>",
      "config local model list",
      "config local model <id>",
      "run",
    ],
  },
  connect: {
    provider: "openrouter",
    defaultModelLabel: "<openrouter model>",
    brief: "delegated model route. uses openrouter authorization.",
    stateLabel: "openrouter",
    useLines: [
      "config connect authorize",
      "config connect disconnect",
      "config connect model list",
      "config connect model <id>",
      "run",
    ],
  },
  direct: {
    provider: "<provider>",
    defaultModelLabel: "<provider model>",
    brief: "raw-key model route. uses a session provider key.",
    stateLabel: "api key",
    useLines: [
      "config direct provider list",
      "config direct provider <id>",
      "config direct key <api-key>",
      "config direct key clear",
      "config direct model list",
      "config direct model <id>",
      "run",
    ],
  },
  "my-brain": {
    provider: MY_BRAIN_PROVIDER,
    defaultModelLabel: MY_BRAIN_MODEL,
    brief: MY_BRAIN_DESCRIPTION,
    stateLabel: MY_BRAIN_MODEL,
    useLines: [
      "prompt <text>",
      "run",
    ],
  },
};
const NOTICE_FLASH_MS = 2400;
const AGENT_REQUEST_TIMEOUT_MS = 45000;
const PREFLIGHT_REQUEST_TIMEOUT_MS = 15000;
const WALLET_TX_SUBMIT_TIMEOUT_MS = 60000;
const MINT_RECEIPT_TIMEOUT_MS = 120000;
const MINT_RECEIPT_POLL_MS = 1000;
const CLI_COMMAND_HISTORY_LIMIT = 80;
const APP_VERSION = "0.0.2";
const APP_BUILD = typeof import.meta.env.VITE_APP_BUILD === "string" && import.meta.env.VITE_APP_BUILD
  ? import.meta.env.VITE_APP_BUILD
  : "dev";
const IS_DEV_MODE = import.meta.env.DEV || import.meta.env.MODE === "development";
const MAX_RAW_RETURN_BYTES = 512;
const MAX_TEXT_BYTES = 128;
const MAX_PROVENANCE_BYTES = 2048;
const COLOR_FONT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SVG_TEXT_MIN_SIZE = 9;
const SVG_TEXT_MAX_SIZE = 18;
const SVG_TEXT_CHAR_ADVANCE = 0.6;
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
const THOUGHT_CHAIN_ID = EVM_ADDRESSES.chainId ?? 31337;
const THOUGHT_CHAIN_ID_HEX = `0x${THOUGHT_CHAIN_ID.toString(16)}`;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const RECOMMENDED_THOUGHT_SPEC_ID =
  EVM_ADDRESSES.recommendedThoughtSpecId?.trim() ||
  EVM_ADDRESSES.thoughtSpec?.id?.trim() ||
  EVM_ADDRESSES.thoughtSpecs?.[0]?.specId?.trim() ||
  "";
const LOCAL_BROWSER_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const resolveThoughtRpcUrl = () => {
  const envRpcUrl =
    typeof import.meta.env.VITE_THOUGHT_RPC_URL === "string" ? import.meta.env.VITE_THOUGHT_RPC_URL.trim() : "";
  const configuredRpcUrl = envRpcUrl || EVM_ADDRESSES.rpcUrl?.trim() || "";
  if (!configuredRpcUrl || envRpcUrl || THOUGHT_CHAIN_ID !== 31337 || !LOCAL_BROWSER_HOSTS.has(window.location.hostname)) {
    return configuredRpcUrl;
  }

  try {
    const parsed = new URL(configuredRpcUrl);
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString();
  } catch {
    return configuredRpcUrl;
  }
};
const THOUGHT_RPC_URL = resolveThoughtRpcUrl();
const PATH_NFT_ADDRESS = EVM_ADDRESSES.pathNft?.address?.trim() ?? "";
const PATH_MINT_URL =
  typeof import.meta.env.VITE_PATH_MINT_URL === "string" && import.meta.env.VITE_PATH_MINT_URL.trim()
    ? import.meta.env.VITE_PATH_MINT_URL.trim()
    : ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
      ? "http://localhost:5173"
      : "https://inshell.art";
const THOUGHT_SPEC_REGISTRY_ADDRESS = EVM_ADDRESSES.thoughtSpecRegistry?.address?.trim() ?? "";
const THOUGHT_NFT_ADDRESS = EVM_ADDRESSES.thoughtNft?.address?.trim() ?? "";
const COLOR_FONT_V1_ADDRESS = EVM_ADDRESSES.colorFontV1?.address?.trim() ?? "";
const THOUGHT_CHAIN_NAME =
  THOUGHT_CHAIN_ID === 31337 ? "Anvil Local" : THOUGHT_CHAIN_ID === 11155111 ? "Sepolia" : "THOUGHT";
const configuredExplorerBaseUrl =
  typeof import.meta.env.VITE_THOUGHT_INDEXER_URL === "string" && import.meta.env.VITE_THOUGHT_INDEXER_URL.trim()
    ? import.meta.env.VITE_THOUGHT_INDEXER_URL.trim().replace(/\/$/, "")
    : typeof import.meta.env.VITE_THOUGHT_EXPLORER_BASE_URL === "string" &&
        import.meta.env.VITE_THOUGHT_EXPLORER_BASE_URL.trim()
      ? import.meta.env.VITE_THOUGHT_EXPLORER_BASE_URL.trim().replace(/\/$/, "")
      : "";
const addressExplorerBaseUrl = EVM_ADDRESSES.explorerUrl?.trim().replace(/\/$/, "") ?? "";
const chainExplorerBaseUrl =
  THOUGHT_CHAIN_ID === 1
    ? "https://etherscan.io"
    : THOUGHT_CHAIN_ID === 11155111
      ? "https://sepolia.etherscan.io"
      : "";
const THOUGHT_EXPLORER_BASE_URL = configuredExplorerBaseUrl || addressExplorerBaseUrl || chainExplorerBaseUrl;
const thoughtTxUrl = (txHash: string) => (THOUGHT_EXPLORER_BASE_URL ? `${THOUGHT_EXPLORER_BASE_URL}/tx/${txHash}` : "");
const PATH_MOVEMENT_THOUGHT = "0x54484f5547485400000000000000000000000000000000000000000000000000";
const ERC721_TRANSFER_TOPIC = id("Transfer(address,address,uint256)");
const CONSUME_AUTHORIZATION_TYPEHASH = id(
  "ConsumeAuthorization(address pathNft,uint256 chainId,uint256 pathId,bytes32 movement,address claimer,address executor,uint256 nonce,uint256 deadline)",
);
const PATH_CONSUME_AUTH_TTL_SECONDS = 3600n;
const ROUTE_SEARCH_PARAMS = new URLSearchParams(window.location.search);
const IS_COLOR_FONT_PAGE = window.location.pathname.replace(/\/+$/, "") === "/color-font";
const RAW_PRESELECTED_PATH_ID = ROUTE_SEARCH_PARAMS.get("path")?.trim() ?? "";
const PRESELECTED_PATH_ID = /^[1-9]\d*$/.test(RAW_PRESELECTED_PATH_ID) ? RAW_PRESELECTED_PATH_ID : "";
const IS_GALLERY_PAGE =
  !IS_COLOR_FONT_PAGE &&
  (ROUTE_SEARCH_PARAMS.get("gallery") === "1" || window.location.hash === "#gallery");
const RAW_ROUTE_THOUGHT_NFT_ID = ROUTE_SEARCH_PARAMS.get("thought")?.trim() ?? "";
const ROUTE_THOUGHT_NFT_ID = /^[1-9]\d*$/.test(RAW_ROUTE_THOUGHT_NFT_ID)
  ? Number(RAW_ROUTE_THOUGHT_NFT_ID)
  : null;
const GALLERY_TARGET_TOKEN_ID = IS_GALLERY_PAGE ? ROUTE_THOUGHT_NFT_ID : null;
const IS_THOUGHT_PAGE = !IS_COLOR_FONT_PAGE && !IS_GALLERY_PAGE && ROUTE_THOUGHT_NFT_ID !== null;
const THOUGHT_MINTED_TOPIC = id(
  "ThoughtMinted(uint256,address,uint256,bytes32,bytes32,bytes32,bytes32,uint64)",
);
const TOKEN_URI_CALL_GAS_LIMIT = 100_000_000n;
const THOUGHT_NFT_ABI = [
  "error EmptyProvenance()",
  "error EmptyThoughtText()",
  "error NonCanonicalThoughtText()",
  "error ProvenanceTooLarge(uint256 size, uint256 max)",
  "error ThoughtAlreadyMinted(bytes32 textHash, uint256 tokenId)",
  "error ThoughtTextTooLarge(uint256 actual, uint256 max)",
  "error InvalidThoughtSpecPair(bytes32 thoughtSpecId, bytes32 thoughtSpecHash)",
  "function mint(string rawText, uint256 pathId, bytes32 thoughtSpecId, bytes32 thoughtSpecHash, bytes32 promptHash, string provenanceJson, uint256 deadline, bytes pathSignature) returns (uint256)",
  "function previewText(string input) pure returns (string normalized, bool valid, uint8 reasonCode)",
  "function previewWork(string rawReturn) pure returns (bool ok, string text, string svg, uint8 reasonCode)",
  "function renderThoughtSvg(string canonicalText) pure returns (string)",
  "function textHashOf(string canonicalText) pure returns (bytes32)",
  "function tokenOfThought(bytes32 textHash) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function rawTextOf(uint256 tokenId) view returns (string)",
  "function provenanceOf(uint256 tokenId) view returns (string)",
  "function recordOf(uint256 tokenId) view returns (bytes32 textHash, bytes32 promptHash, bytes32 provenanceHash, bytes32 thoughtSpecId, bytes32 thoughtSpecHash, uint256 pathId, address minter, uint64 mintedAt)",
  "function thoughtSpecOf(uint256 tokenId) view returns (bytes32 specId, bytes32 specHash, string specName, string ref)",
  "function totalSupply() view returns (uint256)",
  "function thoughtText(uint256 tokenId) view returns (string)",
  "function authorOf(uint256 tokenId) view returns (address)",
  "function colorFont() view returns (address)",
  "function colorFontId() view returns (string)",
  "function colorFontVersion() view returns (string)",
  "function colorFontLength() view returns (uint8)",
  "function colorFontData() view returns (string)",
  "function colorFontHash() view returns (bytes32)",
  "function colorFontGlyph(uint8 index) view returns (string letter, uint8 ordinal, string aliasTerm, string hexColor)",
  "function colorFontGlyphOf(bytes1 letter) view returns (uint8 ordinal, string aliasTerm, string hexColor)",
  "event ThoughtMinted(uint256 indexed tokenId, address indexed minter, uint256 indexed pathId, bytes32 textHash, bytes32 provenanceHash, bytes32 thoughtSpecId, bytes32 thoughtSpecHash, uint64 mintedAt)",
] as const;
const COLOR_FONT_V1_ABI = [
  "function id() pure returns (string)",
  "function version() pure returns (string)",
  "function length() pure returns (uint8)",
  "function data() pure returns (string)",
  "function hash() pure returns (bytes32)",
  "function glyph(uint8 index) pure returns (string letter, uint8 ordinal, string aliasTerm, string hexColor)",
  "function glyphOf(bytes1 letter) pure returns (uint8 ordinal, string aliasTerm, string hexColor)",
] as const;
const PATH_NFT_ABI = [
  "function getConsumeNonce(address claimer) view returns (uint256)",
  "function getAuthorizedMinter(bytes32 movement) view returns (address)",
  "function getMovementQuota(bytes32 movement) view returns (uint32)",
  "function getStage(uint256 tokenId) view returns (uint8)",
  "function getStageMinted(uint256 tokenId) view returns (uint32)",
  "function ownerOf(uint256 tokenId) view returns (address)",
] as const;
const THOUGHT_SPEC_REGISTRY_ABI = [
  "function latestThoughtSpecId() view returns (bytes32)",
  "function thoughtSpecMeta(bytes32 specId) view returns (bool exists, string specName, bytes32 specHash, string ref, address pointer, uint32 byteLength, uint64 registeredAt)",
  "function thoughtSpecText(bytes32 specId) view returns (string)",
  "function validateThoughtSpec(bytes32 specId, bytes32 specHash) view returns (bool)",
  "function isRegisteredThoughtSpec(bytes32 specId, bytes32 specHash) view returns (bool)",
] as const;
const EVM_ABI_CODER = AbiCoder.defaultAbiCoder();

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
  "my-brain": [{ id: MY_BRAIN_MODEL, label: MY_BRAIN_MODEL }],
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
const frontpageStage = document.querySelector(".frontpage-stage") as HTMLElement | null;
const frontpageMain = document.querySelector(".frontpage-main") as HTMLElement | null;
const frontpageTitle = document.getElementById("frontpage-title") as HTMLElement | null;
const modeConnectButton = document.getElementById("mode-connect") as HTMLButtonElement | null;
const modeDirectButton = document.getElementById("mode-direct") as HTMLButtonElement | null;
const modeLocalButton = document.getElementById("mode-local") as HTMLButtonElement | null;
const thoughtCliTranscript = document.getElementById("thought-cli-transcript") as HTMLElement | null;
const thoughtCliSuggestions = document.getElementById("thought-cli-suggestions") as HTMLElement | null;
const thoughtCliForm = document.getElementById("thought-cli-form") as HTMLFormElement | null;
const thoughtCliPrompt = document.querySelector(".thought-cli__prompt") as HTMLLabelElement | null;
const thoughtCliInput = document.getElementById("thought-cli-input") as HTMLInputElement | null;
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
const localModelField = document.getElementById("local-model-field") as HTMLElement | null;
const localModelValue = document.getElementById("local-model-value") as HTMLElement | null;
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
const thoughtDebug = document.getElementById("thought-debug") as HTMLElement | null;
const thoughtDebugToggle = document.getElementById("thought-debug-toggle") as HTMLButtonElement | null;
const thoughtDebugPanel = document.getElementById("thought-debug-panel") as HTMLElement | null;
const thoughtDebugEnabled = document.getElementById("thought-debug-enabled") as HTMLInputElement | null;
const thoughtDebugReset = document.getElementById("thought-debug-reset") as HTMLButtonElement | null;
const thoughtDebugCta = document.getElementById("thought-debug-cta") as HTMLSelectElement | null;
const thoughtDebugCtaStatus = document.getElementById("thought-debug-cta-status") as HTMLSelectElement | null;
const thoughtDebugWarning = document.getElementById("thought-debug-warning") as HTMLSelectElement | null;
const thoughtInstructionsLink = document.getElementById("thought-instructions-link") as HTMLAnchorElement | null;
const thoughtGalleryLink = document.getElementById("thought-gallery-link") as HTMLAnchorElement | null;
const galleryPage = document.getElementById("gallery-page") as HTMLElement | null;
const galleryStatus = document.getElementById("gallery-status") as HTMLElement | null;
const galleryGrid = document.getElementById("gallery-grid") as HTMLElement | null;
const colorFontPage = document.getElementById("color-font-page") as HTMLElement | null;
const colorFontSource = document.getElementById("color-font-source") as HTMLElement | null;
const colorFontId = document.getElementById("color-font-id") as HTMLElement | null;
const colorFontVersion = document.getElementById("color-font-version") as HTMLElement | null;
const colorFontChain = document.getElementById("color-font-chain") as HTMLElement | null;
const colorFontContract = document.getElementById("color-font-contract") as HTMLElement | null;
const colorFontHash = document.getElementById("color-font-hash") as HTMLElement | null;
const colorFontRawBlock = document.getElementById("color-font-raw") as HTMLElement | null;
const colorFontOpenRaw = document.getElementById("color-font-open-raw") as HTMLAnchorElement | null;
const colorFontStatus = document.getElementById("color-font-status") as HTMLElement | null;
const thoughtPage = document.getElementById("thought-page") as HTMLElement | null;
const thoughtDetailTitleToken = document.getElementById("thought-detail-token-id") as HTMLElement | null;
const thoughtDetailGalleryLink = document.getElementById("thought-detail-gallery-link") as HTMLAnchorElement | null;
const thoughtDetailStatus = document.getElementById("thought-detail-status") as HTMLElement | null;
const thoughtDetailBody = document.getElementById("thought-detail-body") as HTMLElement | null;
const thoughtDetailRail = document.querySelector(".thought-detail__rail") as HTMLElement | null;
const thoughtDetailImage = document.getElementById("thought-detail-image") as HTMLImageElement | null;
const thoughtDetailCanonicalTitle = document.getElementById("thought-detail-canonical-title") as HTMLElement | null;
const thoughtDetailPrompt = document.getElementById("thought-detail-prompt") as HTMLElement | null;
const thoughtDetailModel = document.getElementById("thought-detail-model") as HTMLElement | null;
const thoughtDetailModelReturn = document.getElementById("thought-detail-model-return") as HTMLElement | null;
const thoughtDetailPath = document.getElementById("thought-detail-path") as HTMLAnchorElement | null;
const thoughtDetailMinter = document.getElementById("thought-detail-minter") as HTMLElement | null;
const thoughtDetailMinted = document.getElementById("thought-detail-minted") as HTMLElement | null;
const thoughtDetailSpecRef = document.getElementById("thought-detail-spec-ref") as HTMLAnchorElement | null;
const thoughtDetailColorFont = document.getElementById("thought-detail-color-font") as HTMLAnchorElement | null;
const thoughtDetailColorFontStatus = document.getElementById("thought-detail-color-font-status") as HTMLElement | null;
const thoughtDetailViewTx = document.getElementById("thought-detail-view-tx") as HTMLAnchorElement | null;
const thoughtDetailProvenanceBytes = document.getElementById(
  "thought-detail-provenance-bytes",
) as HTMLAnchorElement | null;
const thoughtDetailJsonPanel = document.getElementById("thought-detail-json-panel") as HTMLElement | null;
const thoughtDetailProvenanceViewerTitle = document.getElementById(
  "thought-detail-provenance-viewer-title",
) as HTMLElement | null;
const thoughtDetailProvenanceJson = document.getElementById("thought-detail-provenance-json") as HTMLElement | null;
const thoughtDetailCopyStatus = document.getElementById("thought-detail-copy-status") as HTMLElement | null;
const canvas = document.getElementById("thought-grid") as HTMLCanvasElement | null;
const thoughtSvgPreview = document.getElementById("thought-svg-preview") as HTMLImageElement | null;
const mintSheetBackdrop = document.getElementById("mint-sheet-backdrop") as HTMLElement | null;
const mintSheet = document.getElementById("mint-sheet") as HTMLElement | null;
const mintSheetTitle = document.getElementById("mint-sheet-title") as HTMLElement | null;
const mintSheetClose = document.getElementById("mint-sheet-close") as HTMLButtonElement | null;
const mintSheetCopy = document.getElementById("mint-sheet-copy") as HTMLElement | null;
const mintSheetFlow = document.getElementById("mint-sheet-flow") as HTMLElement | null;
const mintSheetPathField = document.getElementById("mint-sheet-path-field") as HTMLElement | null;
const mintSheetPathBox = document.getElementById("mint-sheet-path-box") as HTMLInputElement | null;
const mintSheetProvenance = document.getElementById("mint-sheet-provenance") as HTMLElement | null;
const mintSheetStatus = document.getElementById("mint-sheet-status") as HTMLElement | null;
const mintSheetContext = document.getElementById("mint-sheet-context") as HTMLElement | null;
const mintSheetPrimary = document.getElementById("mint-sheet-primary") as HTMLButtonElement | null;
const mintSheetSecondary = document.getElementById("mint-sheet-secondary") as HTMLButtonElement | null;
const mintSheetTertiary = document.getElementById("mint-sheet-tertiary") as HTMLButtonElement | null;

if (
  !frontpageShell ||
  !frontpageStage ||
  !frontpageMain ||
  !frontpageTitle ||
  !modeConnectButton ||
  !modeDirectButton ||
  !modeLocalButton ||
  !thoughtCliTranscript ||
  !thoughtCliSuggestions ||
  !thoughtCliForm ||
  !thoughtCliPrompt ||
  !thoughtCliInput ||
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
  !localModelField ||
  !localModelValue ||
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
  !thoughtDebug ||
  !thoughtDebugToggle ||
  !thoughtDebugPanel ||
  !thoughtDebugEnabled ||
  !thoughtDebugReset ||
  !thoughtDebugCta ||
  !thoughtDebugCtaStatus ||
  !thoughtDebugWarning ||
  !thoughtInstructionsLink ||
  !thoughtGalleryLink ||
  !galleryPage ||
  !galleryStatus ||
  !galleryGrid ||
  !colorFontPage ||
  !colorFontSource ||
  !colorFontId ||
  !colorFontVersion ||
  !colorFontChain ||
  !colorFontContract ||
  !colorFontHash ||
  !colorFontRawBlock ||
  !colorFontOpenRaw ||
  !colorFontStatus ||
  !thoughtPage ||
  !thoughtDetailTitleToken ||
  !thoughtDetailGalleryLink ||
  !thoughtDetailStatus ||
  !thoughtDetailBody ||
  !thoughtDetailRail ||
  !thoughtDetailImage ||
  !thoughtDetailCanonicalTitle ||
  !thoughtDetailPrompt ||
  !thoughtDetailModel ||
  !thoughtDetailModelReturn ||
  !thoughtDetailPath ||
  !thoughtDetailMinter ||
  !thoughtDetailMinted ||
  !thoughtDetailSpecRef ||
  !thoughtDetailColorFont ||
  !thoughtDetailColorFontStatus ||
  !thoughtDetailViewTx ||
  !thoughtDetailProvenanceBytes ||
  !thoughtDetailJsonPanel ||
  !thoughtDetailProvenanceViewerTitle ||
  !thoughtDetailProvenanceJson ||
  !thoughtDetailCopyStatus ||
  !canvas ||
  !thoughtSvgPreview ||
  !mintSheetBackdrop ||
  !mintSheet ||
  !mintSheetTitle ||
  !mintSheetClose ||
  !mintSheetCopy ||
  !mintSheetFlow ||
  !mintSheetPathField ||
  !mintSheetPathBox ||
  !mintSheetProvenance ||
  !mintSheetStatus ||
  !mintSheetContext ||
  !mintSheetPrimary ||
  !mintSheetSecondary ||
  !mintSheetTertiary
) {
  throw new Error("Front page elements are missing.");
}

localModelValue.textContent = LOCAL_MODEL_LABEL;

const context = canvas.getContext("2d");

if (!context) {
  throw new Error("Canvas 2D context is unavailable.");
}

let statusTimer: number | null = null;
let warningTimer: number | null = null;
let panelWarningMessage = "";
let panelWarningLevel: PanelWarningLevel = "error";
let lastRunErrorCliLines: string[] = [];
let currentOutputText = "";
let currentWorkSvg = "";
let runInFlight = false;
let runState: ThoughtRunState = "idle";
let currentWorkId: number | null = null;
let currentThoughtDetail: ThoughtDetail | null = null;
let thoughtDetailStatusTimer: number | null = null;
let thoughtDetailEmbeddedHeightFrame = 0;
let thoughtDetailTextFrame = 0;
let cliSuggestionContext: "auto" | "help" | "current" | "config" = "auto";
let pageUnloading = false;
let walletConnectInFlight = false;
let walletDisconnectedByUser = false;
let primaryActionState: PrimaryActionState = "run";
let secondaryActionState: SecondaryActionState = "none";
let thoughtInstructionsObjectUrl: string | null = null;
const DEFAULT_DEBUG_STATE: ThoughtDebugState = {
  open: false,
  enabled: false,
  cta: "auto",
  ctaStatus: "auto",
  warning: "auto",
};
const DEBUG_CTA_LABELS: Record<ThoughtDebugCtaOverride, string> = {
  auto: "auto",
  run: "run",
  running: "running",
  retry: "retry",
  mint: "mint",
  view_thought: "view THOUGHT",
};
const DEBUG_CTA_STATUS_LABELS: Record<ThoughtDebugCtaStatusOverride, string> = {
  auto: "auto",
  none: "none",
  ready: "ready",
  minted: "minted",
  model_needed: "model access needed",
  generation_failed: "generation failed",
  mint_unavailable: "mint unavailable",
};
const DEBUG_WARNING_LABELS: Record<ThoughtDebugWarningOverride, string> = {
  auto: "auto",
  none: "none",
  prompt_required: "prompt required",
  model_required: "model required",
  openrouter_required: "openrouter required",
  api_key_required: "api key required",
  ollama_not_found: "ollama not found",
  spec_unavailable: "spec unavailable",
  provider_error: "provider error",
  external_service: "external service",
  openrouter_connect_constraint: "openrouter constraint",
  wallet_missing: "wallet missing",
  wallet_connect_failed: "wallet connect failed",
  wallet_switch_failed: "wallet switch failed",
  thought_too_large: "THOUGHT too large",
  mint_contract_unavailable: "mint unavailable",
};
const DEBUG_CTA_OPTIONS = Object.keys(DEBUG_CTA_LABELS) as ThoughtDebugCtaOverride[];
const DEBUG_STATUS_BY_CTA: Record<ThoughtDebugCtaOverride, ThoughtDebugCtaStatusOverride[]> = {
  auto: ["auto"],
  run: ["auto", "none", "model_needed"],
  running: ["auto", "none"],
  retry: ["auto", "generation_failed"],
  mint: ["auto", "ready", "mint_unavailable"],
  view_thought: ["auto", "minted"],
};
const DEBUG_DEFAULT_STATUS_BY_CTA: Record<ThoughtDebugCtaOverride, ThoughtDebugCtaStatusOverride> = {
  auto: "auto",
  run: "none",
  running: "none",
  retry: "generation_failed",
  mint: "ready",
  view_thought: "minted",
};
const DEBUG_WARNINGS_BY_CTA_STATUS: Record<
  ThoughtDebugCtaOverride,
  Partial<Record<ThoughtDebugCtaStatusOverride, ThoughtDebugWarningOverride[]>>
> = {
  auto: {
    auto: ["auto"],
  },
  run: {
    none: [
      "auto",
      "none",
      "prompt_required",
      "model_required",
      "spec_unavailable",
      "provider_error",
      "external_service",
    ],
    model_needed: [
      "auto",
      "none",
      "openrouter_required",
      "api_key_required",
      "ollama_not_found",
      "openrouter_connect_constraint",
    ],
  },
  running: {
    none: ["auto", "none"],
  },
  retry: {
    generation_failed: [
      "auto",
      "provider_error",
      "external_service",
      "ollama_not_found",
      "spec_unavailable",
    ],
  },
  mint: {
    ready: ["auto", "none", "thought_too_large"],
    mint_unavailable: ["auto", "none", "mint_contract_unavailable", "spec_unavailable"],
  },
  view_thought: {
    minted: ["auto", "none"],
  },
};
let debugState: ThoughtDebugState = { ...DEFAULT_DEBUG_STATE };

const getDebugStatusOptions = () => DEBUG_STATUS_BY_CTA[debugState.cta];

const getEffectiveDebugCtaStatus = () =>
  debugState.ctaStatus === "auto"
    ? DEBUG_DEFAULT_STATUS_BY_CTA[debugState.cta]
    : debugState.ctaStatus;

const getDebugWarningOptions = () => {
  const status = getEffectiveDebugCtaStatus();
  return DEBUG_WARNINGS_BY_CTA_STATUS[debugState.cta][status] ?? ["auto"];
};

const normalizeDebugHierarchy = () => {
  const statusOptions = getDebugStatusOptions();
  if (!statusOptions.includes(debugState.ctaStatus)) {
    debugState.ctaStatus = "auto";
  }

  const warningOptions = getDebugWarningOptions();
  if (!warningOptions.includes(debugState.warning)) {
    debugState.warning = "auto";
  }
};

const syncDebugSelect = <T extends string>(
  select: HTMLSelectElement,
  values: T[],
  labels: Record<T, string>,
  selectedValue: T,
) => {
  const options = values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[value];
    return option;
  });

  select.replaceChildren(...options);
  select.value = selectedValue;
};
const modelOptionsCache = new Map<ModelSourceId, ModelOption[]>();
const modelOptionsLoading = new Set<ModelSourceId>();
const walletState: ThoughtWalletState = {
  detected: false,
  address: "",
  chainId: null,
  txState: "idle",
  txHash: "",
  txError: "",
  balance: null,
  preflightLoading: false,
  preflightError: "",
  mintedTokenId: null,
  menuOpen: false,
};
let mintFlowState: MintFlowState = "closed";
let mintFlowUiMode: MintFlowUiMode = "sheet";
const mintFlowData: MintFlowData = {
  rawText: "",
  textHash: "",
  promptHash: "",
  thoughtSpecId: "",
  thoughtSpecHash: "",
  provenanceJson: "",
  existingTokenId: null,
  pathIdInput: "",
  pathId: null,
  deadline: null,
  signature: "",
  txHash: "",
  error: "",
  errorKind: "none",
};
let currentRunContext: ThoughtRunContext | null = null;
let activeThoughtSpec: ActiveThoughtSpec | null = null;
let activeThoughtSpecPromise: Promise<ActiveThoughtSpec> | null = null;
let thoughtDetailSpecJsonUrl = "";
let thoughtDetailColorFontUrl = "";
let thoughtDetailProvenanceJsonUrl = "";
let colorFontPageRawUrl = "";
let readProvider: JsonRpcProvider | null = null;
let readThoughtNFT: Contract | null = null;
let readColorFontV1: Contract | null = null;
let readThoughtSpecRegistry: Contract | null = null;
let readPathNft: Contract | null = null;
let walletListenersBound = false;
let mintSheetPrimaryAction: MintSheetAction = "none";
let mintSheetSecondaryAction: MintSheetAction = "none";
let mintSheetTertiaryAction: MintSheetAction = "none";
let lastMintSheetFocusRefreshAt = 0;
const cliEntries: CliEntry[] = [];
const cliCommandHistory: string[] = [];
let cliCommandInFlight = false;
let cliHistoryIndex: number | null = null;
let cliHistoryDraft = "";
let cliCompletionPrefix = "";
let cliCompletionMatches: string[] = [];
let cliCompletionIndex: number | null = null;
let cliProgressEntry: CliEntry | null = null;
let cliProgressBaseLines: string[] = [];
let cliProgressTimer = 0;
let cliProgressTick = 0;
let activeRunId = 0;
let pendingMyBrainRunPayload: PendingMyBrainRound | null = null;

const getDefaultSessionState = (): ThoughtSessionState => ({
  routeConfigured: false,
  mode: "connect",
  prompt: "",
  connect: {
    apiKey: "",
    model: OPENROUTER_DEFAULT_MODEL,
  },
  direct: {
    provider: "openai",
    apiKeys: {
      openai: "",
      openrouter: "",
      anthropic: "",
    },
    model: DIRECT_PROVIDERS.openai.defaultModel,
  },
  local: {
    available: null,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    model: LOCAL_DEFAULT_MODEL,
  },
});

const defaultModelForSource = (sourceId: ModelSourceId) => {
  if (sourceId === LOCAL_MODEL_SOURCE_ID) {
    return LOCAL_DEFAULT_MODEL;
  }

  if (sourceId === MY_BRAIN_MODEL_SOURCE_ID) {
    return MY_BRAIN_MODEL;
  }

  return DIRECT_PROVIDERS[sourceId].defaultModel;
};

const normalizeStoredModel = (sourceId: ModelSourceId, model: string | undefined) => {
  if (sourceId === "openrouter" && (!model || model === LEGACY_OPENROUTER_DEFAULT_MODEL)) {
    return DIRECT_PROVIDERS.openrouter.defaultModel;
  }

  const fallback = defaultModelForSource(sourceId);

  return model?.trim() || fallback;
};

const normalizeStoredDirectApiKeys = (
  apiKeys: unknown,
  activeProvider: DirectProviderId,
  legacyApiKey?: string,
) => {
  const record = typeof apiKeys === "object" && apiKeys !== null
    ? apiKeys as Partial<Record<DirectProviderId, unknown>>
    : {};
  return {
    openai: typeof record.openai === "string" ? record.openai.trim() : "",
    openrouter: typeof record.openrouter === "string" ? record.openrouter.trim() : "",
    anthropic: typeof record.anthropic === "string" ? record.anthropic.trim() : "",
    [activeProvider]: typeof legacyApiKey === "string" && legacyApiKey.trim()
      ? legacyApiKey.trim()
      : typeof record[activeProvider] === "string"
        ? record[activeProvider].trim()
        : "",
  };
};

const normalizeModeInput = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "mybrain" || normalized === "my-brain") {
    return MY_BRAIN_MODE;
  }
  return normalized;
};

const isMode = (value: unknown): value is Mode =>
  value === "connect" || value === "direct" || value === "local" || value === MY_BRAIN_MODE;

const parseModeInput = (value: string): Mode | null => {
  const normalized = normalizeModeInput(value);
  return isMode(normalized) ? normalized : null;
};

const isDirectProviderId = (value: unknown): value is DirectProviderId =>
  value === "openai" || value === "openrouter" || value === "anthropic";

const isRouteConfigured = () => sessionState.routeConfigured;

const routeRequiredLines = () => [
  "config route not selected.",
  "use: config route <local|connect|direct|my-brain>",
];

function normalizeOllamaEndpoint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("endpoint empty.");
  }

  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("endpoint must start with http:// or https://");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/api\/(?:tags|generate)\/?$/i, "").replace(/\/+$/g, "");
  return url.toString().replace(/\/+$/g, "");
}

const safeNormalizeOllamaEndpoint = (value: string | undefined, fallback = DEFAULT_OLLAMA_ENDPOINT) => {
  try {
    return normalizeOllamaEndpoint(value ?? "");
  } catch {
    return fallback;
  }
};

const getOllamaEndpoint = () =>
  safeNormalizeOllamaEndpoint(sessionState.local.endpoint);

const buildOllamaApiUrl = (path: "tags" | "generate") =>
  `${getOllamaEndpoint()}/api/${path}`;

const migrateLegacyState = (
  parsed: LegacySessionState,
  fallback: ThoughtSessionState,
): ThoughtSessionState => {
  const legacyProviders = parsed.providers ?? {};
  const connectModel = normalizeStoredModel("openrouter", legacyProviders.openrouter?.model);
  const connectApiKey = legacyProviders.openrouter?.apiKey?.trim() ?? "";
  const directProvider = isDirectProviderId(parsed.activeProvider) ? parsed.activeProvider : "openai";
  const directModel = normalizeStoredModel(directProvider, legacyProviders[directProvider]?.model);
  const legacyLocalModel =
    legacyProviders.ollama?.model ?? legacyProviders.harness?.model ?? fallback.local.model;

  return {
    routeConfigured: true,
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
      apiKeys: {
        openai: legacyProviders.openai?.apiKey?.trim() ?? "",
        openrouter: legacyProviders.openrouter?.apiKey?.trim() ?? "",
        anthropic: legacyProviders.anthropic?.apiKey?.trim() ?? "",
      },
      model: directModel,
    },
    local: {
      available: null,
      endpoint: fallback.local.endpoint,
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
    const direct = (parsed.direct ?? {}) as Partial<ThoughtSessionState["direct"]> & {
      apiKey?: unknown;
    };
    const local = (parsed.local ?? {}) as Partial<ThoughtSessionState["local"]>;
    const directProvider = isDirectProviderId(direct.provider) ? direct.provider : fallback.direct.provider;
    const hasAnyDirectApiKey =
      typeof direct.apiKey === "string" && direct.apiKey.trim().length > 0 ||
      (typeof direct.apiKeys === "object" &&
        direct.apiKeys !== null &&
        Object.values(direct.apiKeys).some((value) => typeof value === "string" && value.trim().length > 0));
    const routeConfigured =
      typeof parsed.routeConfigured === "boolean"
        ? parsed.routeConfigured
        : isMode(parsed.mode) && (
            parsed.mode !== "connect" ||
            (typeof connect.apiKey === "string" && connect.apiKey.trim().length > 0) ||
            hasAnyDirectApiKey ||
            typeof local.available === "boolean"
          );

    return {
      routeConfigured,
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
        provider: directProvider,
        apiKeys: normalizeStoredDirectApiKeys(
          direct.apiKeys,
          directProvider,
          typeof direct.apiKey === "string" ? direct.apiKey : undefined,
        ),
        model: normalizeStoredModel(
          directProvider,
          typeof direct.model === "string" ? direct.model : undefined,
        ),
      },
      local: {
        available:
          typeof local.available === "boolean" ? local.available : fallback.local.available,
        endpoint:
          typeof local.endpoint === "string" && local.endpoint.trim()
            ? safeNormalizeOllamaEndpoint(local.endpoint, fallback.local.endpoint)
            : fallback.local.endpoint,
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
  activeThoughtSpec?.text ?? thoughtInstructionsOverride?.content ?? thoughtInstructions;

const getActiveThoughtInstructionsLabel = () => {
  if (activeThoughtSpec) {
    return `${activeThoughtSpec.ref} from chain`;
  }
  return THOUGHT_SPEC_REGISTRY_ADDRESS
    ? "onchain THOUGHT.md"
    : (thoughtInstructionsOverride?.name ?? "bundled THOUGHT.md");
};

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
  "openrouter connect needs localhost or https on port 443 or 3000. use config direct on LAN http.";

const revokeThoughtInstructionsObjectUrl = () => {
  if (thoughtInstructionsObjectUrl) {
    URL.revokeObjectURL(thoughtInstructionsObjectUrl);
    thoughtInstructionsObjectUrl = null;
  }
};

const syncThoughtInstructionsLink = () => {
  revokeThoughtInstructionsObjectUrl();

  if (activeThoughtSpec) {
    thoughtInstructionsObjectUrl = URL.createObjectURL(
      new Blob([activeThoughtSpec.text], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    thoughtInstructionsLink.href = thoughtInstructionsObjectUrl;
    thoughtInstructionsLink.download = "THOUGHT.md";
    thoughtInstructionsLink.title = `Open ${activeThoughtSpec.ref} from chain`;
    return;
  }

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

const getReadThoughtNFT = () => {
  const provider = getReadProvider();
  if (!provider || !THOUGHT_NFT_ADDRESS) {
    return null;
  }

  if (!readThoughtNFT) {
    readThoughtNFT = new Contract(THOUGHT_NFT_ADDRESS, THOUGHT_NFT_ABI, provider);
  }

  return readThoughtNFT;
};

const getReadColorFontV1 = () => {
  const provider = getReadProvider();
  if (!provider || !COLOR_FONT_V1_ADDRESS) {
    return null;
  }

  if (!readColorFontV1) {
    readColorFontV1 = new Contract(COLOR_FONT_V1_ADDRESS, COLOR_FONT_V1_ABI, provider);
  }

  return readColorFontV1;
};

const getReadThoughtSpecRegistry = () => {
  const provider = getReadProvider();
  if (!provider || !THOUGHT_SPEC_REGISTRY_ADDRESS) {
    return null;
  }

  if (!readThoughtSpecRegistry) {
    readThoughtSpecRegistry = new Contract(
      THOUGHT_SPEC_REGISTRY_ADDRESS,
      THOUGHT_SPEC_REGISTRY_ABI,
      provider,
    );
  }

  return readThoughtSpecRegistry;
};

const getReadPathNft = () => {
  const provider = getReadProvider();
  if (!provider || !PATH_NFT_ADDRESS) {
    return null;
  }

  if (!readPathNft) {
    readPathNft = new Contract(PATH_NFT_ADDRESS, PATH_NFT_ABI, provider);
  }

  return readPathNft;
};

const byteLength = (value: string) => new TextEncoder().encode(value).length;

const formatProvenanceBytes = (bytes: number) => `provenance: ${bytes} bytes`;

const provenanceTooLargeLines = (bytes: number, scope: "mint" | "work" = "mint") => [
  `${scope} blocked.`,
  "provenance too large.",
  `${bytes} / ${MAX_PROVENANCE_BYTES} bytes.`,
  "",
  `prompt: ${byteLength(currentRunContext?.prompt ?? sessionState.prompt)} bytes`,
  `model return: ${byteLength(currentRunContext?.returnedText ?? "")} bytes`,
  "",
  "shorten prompt or run again.",
];

const provenanceTooLargeMessage = (bytes: number) => provenanceTooLargeLines(bytes).join(" ");

const provenanceTooLargeLinesFromMessage = (message: string) => {
  const match = message.match(/(\d+)\s*\/\s*\d+\s*bytes/);
  return match ? provenanceTooLargeLines(Number(match[1])) : [message];
};

const hashText = (value: string) => keccak256(toUtf8Bytes(value));

const canonicalThoughtTitle = (value: string) => value.replace(/[^A-Za-z]+/g, " ").trim().replace(/\s+/g, " ").toUpperCase();

type ContractWorkPreview = {
  ok: boolean;
  text: string;
  svg: string;
  reasonCode: number;
};

type LastRejectedRun = {
  kind: "rejected-run";
  reasonCode: number;
  reasonLabel: string;
  prompt: string;
  modelReturn: string;
  normalizedCandidate?: string;
  normalizedLength?: number;
  maxTextLength: typeof MAX_TEXT_BYTES;
  route: Mode;
  provider: ThoughtRunProvider;
  model: string;
  thoughtSpecRef: string;
  createdAt: string;
  repeatedCount: number;
};

type LastPreviewRetryContext = {
  payload: ThoughtRunPayload;
  modelReturn: string;
};

type ContractWorkPreviewError = Error & {
  previewReasonCode?: number;
  cliLines?: string[];
  kind?: "model-return-rejected" | "contract-preview-unavailable";
};

const previewWorkReasonLabel = (reasonCode: number) => {
  if (reasonCode === 1) {
    return "empty after normalization";
  }
  if (reasonCode === 2) {
    return "raw return too large";
  }
  if (reasonCode === 3) {
    return "text too long";
  }
  if (reasonCode === 4) {
    return "unsupported characters";
  }
  if (reasonCode === 5) {
    return "not canonical";
  }
  return "unknown preview error";
};

const createContractPreviewUnavailableError = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "";
  const lines = /wallet not connected/i.test(message)
    ? ["wallet not connected.", "use: wallet connect"]
    : [
        "contract preview unavailable.",
        "wallet/RPC could not return the SVG.",
        "",
        "work is not finalized.",
        "mint is blocked until contract preview succeeds.",
        "",
        "use: preview retry",
        "use: wallet",
      ];
  const error = new Error(lines.join(" ")) as ContractWorkPreviewError;
  error.kind = "contract-preview-unavailable";
  error.cliLines = lines;
  return error;
};

let lastRejectedRun: LastRejectedRun | null = null;
let lastPreviewRetryContext: LastPreviewRetryContext | null = null;

const sameRejectedRunContext = (
  previous: LastRejectedRun,
  payload: ThoughtRunPayload,
  reasonCode: number,
) =>
  previous.prompt === payload.input.prompt &&
  previous.route === payload.config.route &&
  previous.provider === payload.config.provider &&
  previous.model === payload.config.model &&
  previous.reasonCode === reasonCode;

const rememberRejectedRun = (
  payload: ThoughtRunPayload,
  preview: ContractWorkPreview,
  modelReturn: string,
): LastRejectedRun => {
  const repeatedCount =
    lastRejectedRun && sameRejectedRunContext(lastRejectedRun, payload, preview.reasonCode)
      ? lastRejectedRun.repeatedCount + 1
      : 1;
  const normalizedCandidate = preview.text || undefined;
  const rejectedRun: LastRejectedRun = {
    kind: "rejected-run",
    reasonCode: preview.reasonCode,
    reasonLabel: previewWorkReasonLabel(preview.reasonCode),
    prompt: payload.input.prompt,
    modelReturn,
    normalizedCandidate,
    normalizedLength: normalizedCandidate ? normalizedCandidate.length : undefined,
    maxTextLength: MAX_TEXT_BYTES,
    route: payload.config.route,
    provider: payload.config.provider,
    model: payload.config.model,
    thoughtSpecRef: payload.input.thoughtSpec.ref,
    createdAt: new Date().toISOString(),
    repeatedCount,
  };
  lastRejectedRun = rejectedRun;
  return rejectedRun;
};

const rejectedRunReasonLines = (rejected: LastRejectedRun) => {
  if (rejected.reasonCode === 1) {
    return ["canonical text is empty after normalization."];
  }
  if (rejected.reasonCode === 2) {
    const rawLength = byteLength(rejected.modelReturn);
    return [
      "raw model return too large to process.",
      `model return: ${rawLength} / ${MAX_RAW_RETURN_BYTES} bytes before normalization.`,
      "",
      "this model ignored the output rules.",
    ];
  }
  if (rejected.reasonCode === 3) {
    return [
      `canonical text: ${rejected.normalizedLength ?? 0} / ${MAX_TEXT_BYTES} characters.`,
      "",
      "this model returned too much text.",
    ];
  }
  if (rejected.reasonCode === 4) {
    return ["unsupported characters in model return.", "letters and spaces only."];
  }
  if (rejected.reasonCode === 5) {
    return ["text is not canonical."];
  }
  return ["model return did not fit THOUGHT rules."];
};

const rejectedRunCliLines = (rejected: LastRejectedRun, previousWorkId: number | null) => {
  const lines = [
    "model return rejected.",
    ...rejectedRunReasonLines(rejected),
    "",
    previousWorkId ? "no new work created." : "no work created.",
    ...(previousWorkId ? [`current work remains #${previousWorkId}.`] : []),
  ];

  if (rejected.repeatedCount >= 2) {
    lines.push(
      "",
      "same rejection repeated.",
      "this model may not follow THOUGHT output rules.",
      "try another model or use my-brain.",
    );
  }

  lines.push(
    "",
    "use: prompt <text>",
    "use: config",
    "use: config my-brain",
  );

  return lines;
};

const createRejectedRunError = (
  rejected: LastRejectedRun,
  previousWorkId: number | null,
) => {
  const lines = rejectedRunCliLines(rejected, previousWorkId);
  const error = new Error(lines.join(" ")) as ContractWorkPreviewError;
  error.kind = "model-return-rejected";
  error.previewReasonCode = rejected.reasonCode;
  error.cliLines = lines;
  return error;
};

const isContractWorkPreviewError = (error: unknown): error is ContractWorkPreviewError =>
  error instanceof Error && Array.isArray((error as ContractWorkPreviewError).cliLines);

const previewWorkViaWallet = async (rawReturn: string): Promise<ContractWorkPreview> => {
  if (!THOUGHT_NFT_ADDRESS) {
    throw new Error("contract preview unavailable.");
  }

  const ethereum = getEthereumProvider();
  if (!ethereum || !walletState.address) {
    throw new Error("wallet not connected.");
  }

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const token = new Contract(THOUGHT_NFT_ADDRESS, THOUGHT_NFT_ABI, signer);
  const [ok, text, svg, reasonCode] = await token.previewWork(rawReturn) as [
    boolean,
    string,
    string,
    bigint | number,
  ];

  return {
    ok: Boolean(ok),
    text: String(text),
    svg: String(svg),
    reasonCode: Number(reasonCode),
  };
};

const textHashFromContract = async (canonicalText: string) => {
  const token = getReadThoughtNFT();
  if (!token) {
    throw new Error("text hash unavailable.");
  }

  return String(await token.textHashOf(canonicalText));
};

const getThoughtSpecCacheKey = (specId: string, specHash: string) =>
  `thought.spec.${THOUGHT_CHAIN_ID}.${THOUGHT_SPEC_REGISTRY_ADDRESS.toLowerCase()}.${specId.toLowerCase()}.${specHash.toLowerCase()}`;

const getThoughtSpecStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readCachedThoughtSpec = (meta: Omit<ActiveThoughtSpec, "text" | "fetchedAt">) => {
  try {
    const storage = getThoughtSpecStorage();
    if (!storage) {
      return null;
    }

    const cacheKey = getThoughtSpecCacheKey(meta.specId, meta.specHash);
    const raw = storage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ActiveThoughtSpec> & {
      chainId?: number;
      registry?: string;
    };
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (
      parsed.chainId !== THOUGHT_CHAIN_ID ||
      typeof parsed.registry !== "string" ||
      parsed.registry.toLowerCase() !== THOUGHT_SPEC_REGISTRY_ADDRESS.toLowerCase() ||
      parsed.specId?.toLowerCase() !== meta.specId.toLowerCase() ||
      parsed.specHash?.toLowerCase() !== meta.specHash.toLowerCase() ||
      byteLength(text) !== meta.byteLength ||
      hashText(text).toLowerCase() !== meta.specHash.toLowerCase()
    ) {
      storage.removeItem(cacheKey);
      return null;
    }

    return {
      ...meta,
      text,
      fetchedAt: parsed.fetchedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeCachedThoughtSpec = (spec: ActiveThoughtSpec) => {
  try {
    const storage = getThoughtSpecStorage();
    if (!storage) {
      return;
    }

    storage.setItem(
      getThoughtSpecCacheKey(spec.specId, spec.specHash),
      JSON.stringify({
        chainId: THOUGHT_CHAIN_ID,
        registry: THOUGHT_SPEC_REGISTRY_ADDRESS,
        specId: spec.specId,
        specHash: spec.specHash,
        ref: spec.ref,
        byteLength: spec.byteLength,
        text: spec.text,
        fetchedAt: spec.fetchedAt,
      }),
    );
  } catch {
    // Public immutable cache is best-effort.
  }
};

const revokeThoughtDetailSpecJsonUrl = () => {
  if (!thoughtDetailSpecJsonUrl) {
    return;
  }

  URL.revokeObjectURL(thoughtDetailSpecJsonUrl);
  thoughtDetailSpecJsonUrl = "";
};

const revokeThoughtDetailColorFontUrl = () => {
  if (!thoughtDetailColorFontUrl) {
    return;
  }

  URL.revokeObjectURL(thoughtDetailColorFontUrl);
  thoughtDetailColorFontUrl = "";
};

const revokeThoughtDetailProvenanceJsonUrl = () => {
  if (!thoughtDetailProvenanceJsonUrl) {
    return;
  }

  URL.revokeObjectURL(thoughtDetailProvenanceJsonUrl);
  thoughtDetailProvenanceJsonUrl = "";
};

const clearThoughtDetailColorFontFallback = () => {
  delete thoughtDetailColorFont.dataset.blobReady;
  thoughtDetailColorFont.href = "#";
  thoughtDetailColorFont.removeAttribute("target");
  thoughtDetailColorFont.removeAttribute("rel");
  thoughtDetailColorFontStatus.textContent = "";
};

const revokeColorFontPageRawUrl = () => {
  if (!colorFontPageRawUrl) {
    return;
  }

  URL.revokeObjectURL(colorFontPageRawUrl);
  colorFontPageRawUrl = "";
};

const setColorFontPageRawLink = (raw: string) => {
  revokeColorFontPageRawUrl();
  colorFontPageRawUrl = URL.createObjectURL(new Blob([raw], { type: "text/plain;charset=utf-8" }));
  colorFontOpenRaw.href = colorFontPageRawUrl;
  colorFontOpenRaw.target = "_blank";
  colorFontOpenRaw.rel = "noopener noreferrer";
};

const renderColorFontPage = (input: {
  source: string;
  id: string;
  version: string;
  chain: string;
  contract: string;
  hash: string;
  data: string;
  status: string;
}) => {
  colorFontSource.textContent = input.source;
  colorFontId.textContent = input.id;
  colorFontVersion.textContent = input.version;
  colorFontChain.textContent = input.chain;
  colorFontContract.textContent = input.contract;
  colorFontHash.textContent = input.hash;
  colorFontRawBlock.textContent = input.data;
  colorFontStatus.textContent = input.status;
  setColorFontPageRawLink(input.data);
};

const loadColorFontPage = async () => {
  colorFontStatus.textContent = "loading color font...";
  colorFontRawBlock.textContent = "loading color font...";

  try {
    const doc = await fetchColorFontDoc();
    renderColorFontPage({
      source: "onchain ABI",
      id: doc.id,
      version: doc.version,
      chain: doc.chainName ? `${doc.chainName} (${doc.chainId})` : doc.chainId.toString(),
      contract: doc.contractAddress,
      hash: doc.hash,
      data: doc.data,
      status: COLOR_FONT_V1_ADDRESS ? "source: ColorFontV1.data()" : "source: ThoughtNFT.colorFontData()",
    });
  } catch {
    const fallbackText = colorFontText.trim();
    renderColorFontPage({
      source: "bundled mirror",
      id: "inshell.colorfont.v1",
      version: "v1",
      chain: "-",
      contract: "-",
      hash: keccak256(toUtf8Bytes(fallbackText)),
      data: fallbackText,
      status: "onchain color font unavailable; showing bundled mirror.",
    });
  }
};

const fetchColorFontDoc = async (): Promise<ColorFontDoc> => {
  const colorFont = getReadColorFontV1();
  const token = getReadThoughtNFT();
  if (!COLOR_FONT_V1_ADDRESS && (!THOUGHT_NFT_ADDRESS || !token)) {
    throw new Error("Color Font contract not configured for this network.");
  }

  try {
    const source = colorFont ?? token;
    if (!source) {
      throw new Error("contract read failed.");
    }

    const [id, version, hash, data] = colorFont
      ? await Promise.all([
          colorFont.id() as Promise<string>,
          colorFont.version() as Promise<string>,
          colorFont.hash() as Promise<`0x${string}`>,
          colorFont.data() as Promise<string>,
        ])
      : await Promise.all([
          source.colorFontId() as Promise<string>,
          source.colorFontVersion() as Promise<string>,
          source.colorFontHash() as Promise<`0x${string}`>,
          source.colorFontData() as Promise<string>,
        ]);

    if (!validateColorFontDataShape(data)) {
      throw new Error("contract read failed.");
    }

    return {
      id,
      version,
      chainId: THOUGHT_CHAIN_ID,
      chainName: THOUGHT_CHAIN_NAME,
      contractAddress: (COLOR_FONT_V1_ADDRESS || THOUGHT_NFT_ADDRESS) as `0x${string}`,
      hash,
      format: COLOR_FONT_DOC_FORMAT,
      data,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "contract read failed.") {
      throw error;
    }
    throw new Error("contract read failed.");
  }
};

const openColorFontDocument = async (options?: {
  appendCliResult?: boolean;
  raw?: boolean;
  rawDocument?: boolean;
}) => {
  const shouldAppendCliResult = options?.appendCliResult ?? false;
  clearThoughtDetailColorFontFallback();

  try {
    const doc = await fetchColorFontDoc();
    if (options?.raw) {
      if (shouldAppendCliResult) {
        appendCliOutput(doc.data.split("\n"), { preserveSpacing: true });
      }
      return doc;
    }

    const plainText = options?.rawDocument ? doc.data : buildColorFontPlainText(doc);
    revokeThoughtDetailColorFontUrl();
    thoughtDetailColorFontUrl = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
    const opened = window.open(thoughtDetailColorFontUrl, "_blank");
    if (opened) {
      opened.opener = null;
    }

    if (!opened) {
      thoughtDetailColorFont.href = thoughtDetailColorFontUrl;
      thoughtDetailColorFont.target = "_blank";
      thoughtDetailColorFont.rel = "noopener noreferrer";
      thoughtDetailColorFont.dataset.blobReady = "true";
      thoughtDetailColorFontStatus.textContent = "popup blocked. click title again.";
    }

    if (shouldAppendCliResult) {
      appendCliOutput([
        "opening Color Font v1.",
        "source: onchain ABI.",
        opened ? "" : "popup blocked. click color font title again.",
      ].filter(Boolean));
    }

    return doc;
  } catch (error) {
    const message = error instanceof Error ? error.message : "contract read failed.";
    const lines = message.includes("not configured")
      ? ["color font unavailable.", "THOUGHT contract not configured for this network."]
      : ["color font unavailable.", "contract read failed."];
    thoughtDetailColorFontStatus.textContent = lines.join(" ");
    if (shouldAppendCliResult) {
      appendCliError(lines);
    }
    return null;
  }
};

const thoughtSpecCachePayload = (spec: ActiveThoughtSpec) => ({
  chainId: THOUGHT_CHAIN_ID,
  registry: THOUGHT_SPEC_REGISTRY_ADDRESS,
  cacheKey: getThoughtSpecCacheKey(spec.specId, spec.specHash),
  source: {
    contract: "ThoughtSpecRegistry",
    read: "thoughtSpecText(bytes32)",
  },
  specId: spec.specId,
  specHash: spec.specHash,
  ref: spec.ref,
  pointer: spec.pointer,
  byteLength: spec.byteLength,
  text: spec.text,
  fetchedAt: spec.fetchedAt,
});

const specJsonFilename = (spec: ActiveThoughtSpec) =>
  `${(spec.ref || "THOUGHT.md").replace(/[^A-Za-z0-9._-]+/g, "-")}.${shortHex(spec.specId, 8, 6)}.json`;

const specLinkText = (ref?: string) => `${ref || "THOUGHT.v1.md"} ↗`;

const setThoughtDetailSpecJsonLink = (spec: ActiveThoughtSpec) => {
  revokeThoughtDetailSpecJsonUrl();
  const json = JSON.stringify(thoughtSpecCachePayload(spec), null, 2);
  thoughtDetailSpecJsonUrl = URL.createObjectURL(new Blob([`${json}\n`], { type: "application/json" }));
  thoughtDetailSpecRef.textContent = specLinkText(spec.ref);
  thoughtDetailSpecRef.href = thoughtDetailSpecJsonUrl;
  thoughtDetailSpecRef.target = "_blank";
  thoughtDetailSpecRef.rel = "noopener noreferrer";
  thoughtDetailSpecRef.title = `Open local cached spec JSON: ${specJsonFilename(spec)}`;
};

const clearThoughtDetailSpecJsonLink = (title = "Spec JSON loads after the spec is verified.") => {
  revokeThoughtDetailSpecJsonUrl();
  thoughtDetailSpecRef.href = "#";
  thoughtDetailSpecRef.removeAttribute("target");
  thoughtDetailSpecRef.removeAttribute("rel");
  thoughtDetailSpecRef.title = title;
};

const setThoughtDetailProvenanceJsonLink = (detail: ThoughtDetail, byteCount: number) => {
  revokeThoughtDetailProvenanceJsonUrl();
  thoughtDetailProvenanceJsonUrl = URL.createObjectURL(
    new Blob([detail.provenanceJson], { type: "application/json" }),
  );
  thoughtDetailProvenanceBytes.textContent = `${byteCount} bytes ↗`;
  thoughtDetailProvenanceBytes.href = thoughtDetailProvenanceJsonUrl;
  thoughtDetailProvenanceBytes.target = "_blank";
  thoughtDetailProvenanceBytes.rel = "noopener noreferrer";
  thoughtDetailProvenanceBytes.title = `Open local provenance bytes from ThoughtNFT.provenanceOf(${detail.tokenId})`;
};

const clearThoughtDetailProvenanceJsonLink = (text = "provenance unavailable.") => {
  revokeThoughtDetailProvenanceJsonUrl();
  thoughtDetailProvenanceBytes.textContent = text;
  thoughtDetailProvenanceBytes.href = "#";
  thoughtDetailProvenanceBytes.removeAttribute("target");
  thoughtDetailProvenanceBytes.removeAttribute("rel");
  thoughtDetailProvenanceBytes.title = "Provenance bytes unavailable.";
};

const resolveRecommendedThoughtSpecId = async (registry: Contract) => {
  if (RECOMMENDED_THOUGHT_SPEC_ID && RECOMMENDED_THOUGHT_SPEC_ID !== ZERO_BYTES32) {
    return RECOMMENDED_THOUGHT_SPEC_ID;
  }

  const latest = await withTimeout(
    registry.latestThoughtSpecId() as Promise<string>,
    PREFLIGHT_REQUEST_TIMEOUT_MS,
    "THOUGHT.md request timed out.",
  );
  if (!latest || latest === ZERO_BYTES32) {
    throw new Error("spec unavailable.");
  }
  return latest;
};

const loadThoughtSpecMeta = async (registry: Contract, specId: string) => {
  const [exists, specName, specHash, ref, pointer, byteLength_] = (await withTimeout(
    registry.thoughtSpecMeta(specId) as Promise<unknown>,
    PREFLIGHT_REQUEST_TIMEOUT_MS,
    "THOUGHT.md request timed out.",
  )) as [boolean, string, string, string, string, bigint, bigint];

  if (!exists || !specId || specId === ZERO_BYTES32) {
    throw new Error("spec unavailable.");
  }

  return {
    specId,
    specHash,
    ref: ref || specName || "THOUGHT.md",
    pointer,
    byteLength: Number(byteLength_),
  };
};

const loadActiveThoughtSpec = async () => {
  const registry = getReadThoughtSpecRegistry();
  if (!registry) {
    throw new Error("spec unavailable.");
  }

  const specId = await resolveRecommendedThoughtSpecId(registry);
  const meta = await loadThoughtSpecMeta(registry, specId);

  const cached = readCachedThoughtSpec(meta);
  if (
    cached &&
    await withTimeout(
      registry.validateThoughtSpec(specId, meta.specHash) as Promise<boolean>,
      PREFLIGHT_REQUEST_TIMEOUT_MS,
      "THOUGHT.md request timed out.",
    )
  ) {
    return cached;
  }

  const [validSpec, text] = await Promise.all([
    withTimeout(
      registry.validateThoughtSpec(specId, meta.specHash) as Promise<boolean>,
      PREFLIGHT_REQUEST_TIMEOUT_MS,
      "THOUGHT.md request timed out.",
    ),
    withTimeout(
      registry.thoughtSpecText(specId) as Promise<string>,
      PREFLIGHT_REQUEST_TIMEOUT_MS,
      "THOUGHT.md request timed out.",
    ),
  ]);
  if (!validSpec) {
    throw new Error("spec mismatch.");
  }
  if (byteLength(text) !== meta.byteLength || hashText(text).toLowerCase() !== meta.specHash.toLowerCase()) {
    throw new Error("spec mismatch.");
  }

  const spec = {
    ...meta,
    text,
    fetchedAt: new Date().toISOString(),
  };
  writeCachedThoughtSpec(spec);
  return spec;
};

const loadThoughtSpecById = async (specId: string) => {
  const registry = getReadThoughtSpecRegistry();
  if (!registry || !specId) {
    throw new Error("spec unavailable.");
  }

  const meta = await loadThoughtSpecMeta(registry, specId);
  const cached = readCachedThoughtSpec(meta);
  if (cached) {
    return cached;
  }

  const [validSpec, text] = await Promise.all([
    withTimeout(
      registry.validateThoughtSpec(specId, meta.specHash) as Promise<boolean>,
      PREFLIGHT_REQUEST_TIMEOUT_MS,
      "THOUGHT.md request timed out.",
    ),
    withTimeout(
      registry.thoughtSpecText(specId) as Promise<string>,
      PREFLIGHT_REQUEST_TIMEOUT_MS,
      "THOUGHT.md request timed out.",
    ),
  ]);
  if (!validSpec || byteLength(text) !== meta.byteLength || hashText(text).toLowerCase() !== meta.specHash.toLowerCase()) {
    throw new Error("spec mismatch.");
  }

  const spec = {
    ...meta,
    text,
    fetchedAt: new Date().toISOString(),
  };
  writeCachedThoughtSpec(spec);
  return spec;
};

const ensureActiveThoughtSpec = async (options: { force?: boolean } = {}) => {
  if (options.force) {
    activeThoughtSpec = null;
    activeThoughtSpecPromise = null;
  }

  if (activeThoughtSpec) {
    return activeThoughtSpec;
  }

  activeThoughtSpecPromise ??= loadActiveThoughtSpec()
    .then((spec) => {
      activeThoughtSpec = spec;
      activeThoughtSpecPromise = null;
      return spec;
    })
    .catch((error) => {
      activeThoughtSpecPromise = null;
      throw error;
    });

  return activeThoughtSpecPromise;
};

const formatThoughtSpecError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|network|connection refused|could not connect|econnrefused/i.test(message)) {
    return "Failed to fetch THOUGHT.md.";
  }

  if (!message || message === "spec unavailable.") {
    return "THOUGHT.md unavailable.";
  }

  if (message === "spec mismatch.") {
    return "THOUGHT.md spec mismatch.";
  }

  return message.includes("THOUGHT.md") ? message : `THOUGHT.md ${message}`;
};

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

const stableStringify = (value: StableJsonValue): string => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const getCurrentProviderForProvenance = (): ThoughtRunProvider => {
  if (sessionState.mode === "connect") {
    return "openrouter";
  }

  if (sessionState.mode === "direct") {
    return sessionState.direct.provider;
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    return MY_BRAIN_PROVIDER;
  }

  return LOCAL_MODEL_SOURCE_ID;
};

const isThoughtRunProvider = (value: string): value is ThoughtRunProvider =>
  value === "openrouter" ||
  value === "openai" ||
  value === "anthropic" ||
  value === "ollama" ||
  value === MY_BRAIN_PROVIDER;

const buildCurrentThoughtRunPayload = (prompt: string, model: string) => {
  const spec = activeThoughtSpec;
  if (!spec) {
    throw new Error("spec unavailable.");
  }

  return buildThoughtRunPayload({
    route: sessionState.mode,
    provider: getCurrentProviderForProvenance(),
    model,
    prompt,
    thoughtSpec: {
      id: spec.specId,
      ref: spec.ref,
      hash: spec.specHash,
      text: getActiveThoughtInstructions(),
    },
  });
};

const buildThoughtRunPayloadFromContext = (context: ThoughtRunContext) => {
  const spec = activeThoughtSpec;
  if (!spec) {
    throw new Error("spec unavailable.");
  }

  return buildThoughtRunPayload({
    route: context.mode,
    provider: isThoughtRunProvider(context.provider) ? context.provider : getCurrentProviderForProvenance(),
    model: context.model,
    prompt: context.prompt,
    thoughtSpec: {
      id: spec.specId,
      ref: spec.ref,
      hash: spec.specHash,
      text: getActiveThoughtInstructions(),
    },
  });
};

const provenanceRequestConfig = (request?: ThoughtRunProvenanceRequestConfig | { maxOutputTokens?: unknown }) => ({
  maxOutputTokens: String(request?.maxOutputTokens ?? THOUGHT_MAX_OUTPUT_TOKENS),
  stop: "stop" in (request ?? {}) ? String((request as { stop?: unknown }).stop ?? "none") : "none",
});

const provenanceWebConfig = (context: ThoughtRunContext, payload: ThoughtRunPayload): ThoughtRunWebConfig => {
  if (context.web) {
    return context.web;
  }

  const provenanceConfig = thoughtRunProvenanceConfig(payload);
  return provenanceConfig.web;
};

const buildProvenanceJson = (
  textHash: string,
  mint?: {
    minter: string;
    pathId: string | bigint;
    promptHash?: string;
  },
) => {
  const spec = activeThoughtSpec;
  if (!spec) {
    throw new Error("spec unavailable.");
  }

  const context = currentRunContext ?? {
    mode: sessionState.mode,
    provider: getCurrentProviderForProvenance(),
    model: getCurrentModelValue().trim(),
    prompt: sessionState.prompt,
    clientGeneratedAt: new Date().toISOString(),
  };
  const fallbackPayload = buildThoughtRunPayloadFromContext(context);
  const isMyBrainRun = context.mode === MY_BRAIN_MODE;
  const request = isMyBrainRun ? null : provenanceRequestConfig(context.request);
  const web = isMyBrainRun ? null : provenanceWebConfig(context, fallbackPayload);
  const thoughtSpec = context.thoughtSpec ?? {
    hash: spec.specHash,
    id: spec.specId,
    ref: spec.ref,
  };
  const promptHash = mint?.promptHash || hashText(context.prompt);
  const returnedText = context.returnedText ?? currentOutputText;
  const returnedTextHash = hashText(returnedText);
  const chain = mint
    ? {
        chainId: String(THOUGHT_CHAIN_ID),
        pathNFT: PATH_NFT_ADDRESS,
        thoughtNft: THOUGHT_NFT_ADDRESS,
      }
    : undefined;
  const mintContext = mint
    ? {
        minter: mint.minter,
        movement: "THOUGHT",
        pathId: typeof mint.pathId === "bigint" ? mint.pathId.toString() : mint.pathId,
      }
    : undefined;

  return stableStringify({
    app: "THOUGHT",
    appBuild: APP_BUILD,
    appVersion: APP_VERSION,
    ...(chain ? { chain } : {}),
    client: {
      generatedAt: context.clientGeneratedAt,
    },
    hashes: {
      promptHash,
      returnedTextHash,
      textHash,
    },
    route: context.mode,
    model: context.model,
    ...(mintContext ? { mint: mintContext } : {}),
    output: {
      returnedText,
      format: "thought.text.v1",
      normalizer: "thought.normalize.v1",
      textHash,
    },
    prompt: context.prompt,
    provider: context.provider,
    ...(request ? { request } : {}),
    schema: "thought.provenance.v1",
    thoughtSpec,
    ...(web ? { web } : {}),
  });
};

const parsePathTokenId = (value: string) => {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  return BigInt(trimmed);
};

const indexedAddressTopic = (address: string) =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

const transferLogTokenId = (topics: readonly string[]) => {
  const tokenIdTopic = topics[3];
  if (!tokenIdTopic) {
    return null;
  }

  try {
    return BigInt(tokenIdTopic);
  } catch {
    return null;
  }
};

const verifyThoughtSpecAnchor = async () => {
  const registry = getReadThoughtSpecRegistry();
  if (!registry || !activeThoughtSpec) {
    return false;
  }

  return Boolean(await registry.isRegisteredThoughtSpec(
    activeThoughtSpec.specId,
    activeThoughtSpec.specHash,
  ));
};

const clearMintAuthorization = () => {
  mintFlowData.deadline = null;
  mintFlowData.signature = "";
};

const resetMintFlow = () => {
  mintFlowState = "closed";
  mintFlowUiMode = "sheet";
  mintFlowData.rawText = "";
  mintFlowData.textHash = "";
  mintFlowData.promptHash = "";
  mintFlowData.thoughtSpecId = "";
  mintFlowData.thoughtSpecHash = "";
  mintFlowData.provenanceJson = "";
  mintFlowData.existingTokenId = null;
  mintFlowData.pathIdInput = "";
  mintFlowData.pathId = null;
  mintFlowData.txHash = "";
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  clearMintAuthorization();
};

const resetMintRuntimeState = () => {
  resetMintFlow();
  walletState.txState = "idle";
  walletState.txError = "";
  walletState.txHash = "";
  walletState.mintedTokenId = null;
};

const closeMintSheet = () => {
  resetMintFlow();
  syncInterface();
};

const signPathConsumeAuthorization = async (
  signer: JsonRpcSigner,
  claimer: string,
  pathId: bigint,
) => {
  const pathNft = new Contract(PATH_NFT_ADDRESS, PATH_NFT_ABI, signer);
  const nonce = (await pathNft.getConsumeNonce(claimer)) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + PATH_CONSUME_AUTH_TTL_SECONDS;
  const structHash = keccak256(
    EVM_ABI_CODER.encode(
      [
        "bytes32",
        "address",
        "uint256",
        "uint256",
        "bytes32",
        "address",
        "address",
        "uint256",
        "uint256",
      ],
      [
        CONSUME_AUTHORIZATION_TYPEHASH,
        PATH_NFT_ADDRESS,
        BigInt(THOUGHT_CHAIN_ID),
        pathId,
        PATH_MOVEMENT_THOUGHT,
        claimer,
        THOUGHT_NFT_ADDRESS,
        nonce,
        deadline,
      ],
    ),
  );
  const signature = await signer.signMessage(getBytes(structHash));
  return { deadline, signature };
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
  if (!isRouteConfigured()) {
    return false;
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    return true;
  }

  if (sessionState.mode === "connect") {
    return sessionState.connect.apiKey.trim().length > 0;
  }

  if (sessionState.mode === "direct") {
    return getDirectApiKey().length > 0;
  }

  return sessionState.local.available === true;
};

const isDebugActive = () => IS_DEV_MODE && debugState.enabled;

const isDebugCtaOverrideActive = () => isDebugActive() && debugState.cta !== "auto";

const getDebugActionPresentation = (): ActionPresentation | null => {
  if (!isDebugCtaOverrideActive()) {
    return null;
  }

  if (debugState.cta === "run") {
    return {
      primaryLabel: "[ run ]",
      primaryDisabled: false,
      primaryAction: "none",
      status: "",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  if (debugState.cta === "running") {
    return {
      primaryLabel: "[ running ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  if (debugState.cta === "retry") {
    return {
      primaryLabel: "[ retry ]",
      primaryDisabled: false,
      primaryAction: "none",
      status: "generation failed",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  if (debugState.cta === "mint") {
    return {
      primaryLabel: "[ mint ]",
      primaryDisabled: debugState.ctaStatus === "mint_unavailable",
      primaryAction: "none",
      status: "ready",
      secondaryLabel: "[ reset ]",
      secondaryAction: "reset",
    };
  }

  if (debugState.cta === "view_thought") {
    return {
      primaryLabel: "[ view THOUGHT ]",
      primaryDisabled: false,
      primaryAction: "none",
      status: "minted",
      secondaryLabel: "",
      secondaryAction: "none",
    };
  }

  return null;
};

const applyDebugStatusOverride = (action: ActionPresentation): ActionPresentation => {
  if (!isDebugActive() || debugState.ctaStatus === "auto") {
    return action;
  }

  const debugStatusText: Record<Exclude<ThoughtDebugCtaStatusOverride, "auto">, string> = {
    none: "",
    ready: "ready",
    minted: "minted",
    model_needed: "model access needed",
    generation_failed: "generation failed",
    mint_unavailable: "mint unavailable",
  };

  return {
    ...action,
    status: debugStatusText[debugState.ctaStatus],
  };
};

const getActionPresentation = (): ActionPresentation => {
  const debugAction = getDebugActionPresentation();
  if (debugAction) {
    return applyDebugStatusOverride(debugAction);
  }

  const hasOutput = currentOutputText.length > 0;
  let action: ActionPresentation;

  if (runState === "running" || runInFlight) {
    action = {
      primaryLabel: "[ running ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "",
      secondaryLabel: "",
      secondaryAction: "none",
    };
    return applyDebugStatusOverride(action);
  }

  if (walletState.mintedTokenId !== null) {
    action = {
      primaryLabel: "",
      primaryDisabled: true,
      primaryAction: "none",
      status: "minted",
      secondaryLabel: "[ view THOUGHT ]",
      secondaryAction: "view_thought",
      hidePrimary: true,
    };
    return applyDebugStatusOverride(action);
  }

  if (hasOutput) {
    if (!THOUGHT_RPC_URL || !THOUGHT_NFT_ADDRESS) {
      action = {
        primaryLabel: "[ mint ]",
        primaryDisabled: true,
        primaryAction: "none",
        status: "mint unavailable",
        secondaryLabel: "[ reset ]",
        secondaryAction: "reset",
      };
      return applyDebugStatusOverride(action);
    }

    action = {
      primaryLabel: "[ mint ]",
      primaryDisabled: false,
      primaryAction: "mint",
      status: "ready",
      secondaryLabel: "[ reset ]",
      secondaryAction: "reset",
    };
    return applyDebugStatusOverride(action);
  }

  if (runState === "run_failed") {
    action = {
      primaryLabel: "[ retry ]",
      primaryDisabled: !hasModelAccess(),
      primaryAction: hasModelAccess() ? "retry_run" : "none",
      status: "generation failed",
      secondaryLabel: "",
      secondaryAction: "none",
    };
    return applyDebugStatusOverride(action);
  }

  if (!isRouteConfigured()) {
    action = {
      primaryLabel: "[ run ]",
      primaryDisabled: true,
      primaryAction: "none",
      status: "config needed",
      secondaryLabel: "",
      secondaryAction: "none",
    };
    return applyDebugStatusOverride(action);
  }

  action = {
    primaryLabel: "[ run ]",
    primaryDisabled: !hasModelAccess(),
    primaryAction: hasModelAccess() ? "run" : "none",
    status: hasModelAccess() ? "" : "model access needed",
    secondaryLabel: "",
    secondaryAction: "none",
  };
  return applyDebugStatusOverride(action);
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

const setWarning = (message: string, options?: { flashMs?: number; level?: PanelWarningLevel }) => {
  clearNoticeTimer(warningTimer);
  warningTimer = null;
  panelWarningMessage = message;
  panelWarningLevel = options?.level ?? "error";
  syncWarningBox();

  if (message && options?.flashMs) {
    warningTimer = window.setTimeout(() => {
      panelWarningMessage = "";
      panelWarningLevel = "error";
      syncWarningBox();
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

const getDebugWarningPresentation = () => {
  const debugWarningCopy: Record<
    Exclude<ThoughtDebugWarningOverride, "auto">,
    { level: PanelWarningLevel; text: string }
  > = {
    none: { level: "info", text: "" },
    prompt_required: { level: "warn", text: "prompt is required." },
    model_required: { level: "warn", text: "model is required." },
    openrouter_required: { level: "warn", text: "authorize openrouter first." },
    api_key_required: { level: "warn", text: "api key is required." },
    ollama_not_found: { level: "error", text: "ollama not found." },
    spec_unavailable: { level: "error", text: "spec unavailable." },
    provider_error: { level: "error", text: "provider returned error." },
    external_service: { level: "error", text: "external service returned error." },
    openrouter_connect_constraint: {
      level: "warn",
      text: "openrouter connect needs localhost or https.",
    },
    wallet_missing: { level: "warn", text: "No supported wallet found." },
    wallet_connect_failed: { level: "error", text: "wallet connect failed." },
    wallet_switch_failed: { level: "error", text: "wallet switch failed." },
    thought_too_large: {
      level: "warn",
      text: `work exceeds the ${MAX_TEXT_BYTES}-byte mint limit.`,
    },
    mint_contract_unavailable: { level: "error", text: "mint contract not configured." },
  };

  return debugState.warning === "auto" ? null : debugWarningCopy[debugState.warning];
};

const syncWarningBox = () => {
  const debugWarning = isDebugActive() ? getDebugWarningPresentation() : null;
  const warningCopy = debugWarning?.text ?? panelWarningMessage;
  const warningLevel = debugWarning?.level ?? panelWarningLevel;
  warningBox.classList.remove("is-info", "is-warn", "is-error");
  warningBox.classList.add(`is-${warningLevel}`);
  updateNotice(warningBox, warningCopy);
};

const setMintFlowError = (message: string, kind: MintFlowErrorKind = "mint") => {
  mintFlowState = "error";
  mintFlowData.error = message;
  mintFlowData.errorKind = kind;
  clearMintAuthorization();
  walletState.txState = "failed";
  walletState.txError = message;
};

const hiddenMintSheetAction = (): MintSheetActionConfig => ({
  action: "none",
  hidden: true,
  label: "",
});

const mintSheetAction = (
  action: MintSheetAction,
  label: string,
  disabled = false,
): MintSheetActionConfig => ({
  action,
  disabled,
  label,
});

const isPathRecoveryError = () =>
  mintFlowState === "error" &&
  (
    mintFlowData.errorKind === "path_invalid" ||
    mintFlowData.errorKind === "path_not_found" ||
    mintFlowData.errorKind === "path_consumed" ||
    mintFlowData.errorKind === "path_not_ready" ||
    mintFlowData.errorKind === "path_unknown"
  );

const isThoughtLevelMintError = () =>
  mintFlowState === "error" &&
  (
    mintFlowData.errorKind === "thought" ||
    mintFlowData.errorKind === "spec" ||
    mintFlowData.errorKind === "mint" ||
    mintFlowData.errorKind === "funds" ||
    mintFlowData.errorKind === "signature"
  );

const canContinueWithPathInput = () => parsePathTokenId(mintFlowData.pathIdInput) !== null;

const getMintSheetActionConfigs = (): [
  MintSheetActionConfig,
  MintSheetActionConfig,
  MintSheetActionConfig,
] => {
  if (mintFlowState === "thought_checking") {
    return [
      mintSheetAction("none", "[ checking ]", true),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "text_taken") {
    return [
      mintSheetAction("view_thought", "[ view THOUGHT ]"),
      mintSheetAction("reset", "[ reset ]"),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "wallet_required") {
    return [
      mintSheetAction("connect_wallet", "[ connect wallet ]", walletConnectInFlight),
      mintSheetAction("mint_path", "[ mint a $PATH ]"),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "path_required") {
    return [
      mintSheetAction("continue", "[ continue ]", !canContinueWithPathInput()),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "path_checking") {
    return [
      mintSheetAction("none", "[ checking ]", true),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "path_ready") {
    return [
      mintSheetAction("authorize", "[ authorize ]"),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "authorizing") {
    return [
      mintSheetAction("none", "[ authorizing ]", true),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "authorized") {
    return [
      mintSheetAction("confirm_mint", "[ confirm mint ]"),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "minting") {
    return [
      mintSheetAction("none", "[ minting ]", true),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "minted") {
    return [
      mintSheetAction("view_tx", "[ view tx ]"),
      mintSheetAction("view_thought", "[ view THOUGHT ]"),
      hiddenMintSheetAction(),
    ];
  }

  if (mintFlowState === "error") {
    if (mintFlowData.errorKind === "wrong_network") {
      return [
        mintSheetAction("switch_network", "[ switch network ]"),
        mintSheetAction("mint_path", "[ mint a $PATH ]"),
        hiddenMintSheetAction(),
      ];
    }

    if (isPathRecoveryError()) {
      return [
        mintSheetAction("choose_another", "[ choose another ]"),
        mintSheetAction("mint_path", "[ mint a $PATH ]"),
        mintSheetAction("refresh", "[ refresh ]"),
      ];
    }

    return [
      mintSheetAction("refresh", "[ refresh ]"),
      hiddenMintSheetAction(),
      hiddenMintSheetAction(),
    ];
  }

  return [
    mintSheetAction("continue", "[ continue ]", true),
    hiddenMintSheetAction(),
    hiddenMintSheetAction(),
  ];
};

const syncMintSheetFlow = () => {
  const activeStep =
    mintFlowState === "authorized" || mintFlowState === "minting" || mintFlowState === "minted"
      ? "confirm"
      : mintFlowState === "path_ready" || mintFlowState === "authorizing"
        ? "authorize"
        : "select";
  const completedSteps =
    activeStep === "authorize"
      ? new Set(["select"])
      : activeStep === "confirm"
        ? new Set(["select", "authorize"])
        : new Set<string>();

  mintSheetFlow.querySelectorAll<HTMLElement>("[data-step]").forEach((step) => {
    const stepId = step.dataset.step ?? "";
    step.classList.toggle("is-active", stepId === activeStep);
    step.classList.toggle("is-complete", completedSteps.has(stepId) || mintFlowState === "minted");
  });
};

const getMintSheetStatusCopy = () => {
  const selectedPathId = mintFlowData.pathId?.toString() ?? mintFlowData.pathIdInput.trim();

  if (mintFlowState === "thought_checking") {
    return "checking THOUGHT.";
  }
  if (mintFlowState === "text_taken") {
    return "already minted.";
  }
  if (mintFlowState === "wallet_required") {
    return "connect wallet to read $PATH.";
  }
  if (mintFlowState === "path_required") {
    return canContinueWithPathInput() ? "" : "enter a valid $PATH #.";
  }
  if (mintFlowState === "path_checking") {
    return `checking $PATH #${selectedPathId}.`;
  }
  if (mintFlowState === "path_ready") {
    return `$PATH #${selectedPathId} selected.`;
  }
  if (mintFlowState === "authorizing") {
    return "wallet authorization pending.";
  }
  if (mintFlowState === "authorized") {
    return selectedPathId ? `$PATH #${selectedPathId} authorized for this THOUGHT.` : "authorized.";
  }
  if (mintFlowState === "minting") {
    return walletState.txState === "submitted" ? "minting." : "confirm in wallet.";
  }
  if (mintFlowState === "minted") {
    return "minted.";
  }
  if (mintFlowState === "error") {
    return mintFlowData.error || "mint failed.";
  }
  return "";
};

const getMintSheetContextCopy = () => {
  const selectedPathId = mintFlowData.pathId?.toString() ?? mintFlowData.pathIdInput.trim();

  if (mintFlowState === "path_ready" || mintFlowState === "authorizing") {
    return "one THOUGHT needs one usable $PATH.";
  }
  if ((mintFlowState === "authorized" || mintFlowState === "minting") && selectedPathId) {
    return `$PATH #${selectedPathId} selected.`;
  }
  return "";
};

const getMintSheetProvenanceCopy = () => {
  if (!mintFlowData.provenanceJson) {
    return "";
  }

  return formatProvenanceBytes(byteLength(mintFlowData.provenanceJson));
};

const syncMintSheetButton = (
  button: HTMLButtonElement,
  config: MintSheetActionConfig,
) => {
  button.textContent = config.label;
  button.disabled = !!config.disabled;
  button.classList.toggle("is-hidden", !!config.hidden);
};

const syncMintSheet = () => {
  const isOpen = mintFlowUiMode === "sheet" && mintFlowState !== "closed";
  mintSheetBackdrop.classList.toggle("is-hidden", !isOpen);
  mintSheet.classList.toggle("is-hidden", !isOpen);

  if (!isOpen) {
    return;
  }

  const thoughtLevelMintError = isThoughtLevelMintError();
  mintSheetTitle.textContent = "mint THOUGHT";
  mintSheetCopy.textContent = "one THOUGHT needs one $PATH.";
  syncMintSheetFlow();

  const pathInputVisible =
    mintFlowState === "path_required" ||
    mintFlowState === "path_checking" ||
    mintFlowState === "path_ready" ||
    mintFlowState === "authorizing" ||
    mintFlowState === "authorized" ||
    (mintFlowState === "error" && !thoughtLevelMintError);
  mintSheetPathField.classList.toggle("is-hidden", !pathInputVisible);
  mintSheetPathBox.value = mintFlowData.pathIdInput;
  mintSheetPathBox.disabled =
    mintFlowState === "path_checking" ||
    mintFlowState === "path_ready" ||
    mintFlowState === "authorizing" ||
    mintFlowState === "authorized" ||
    mintFlowState === "minting" ||
    mintFlowState === "minted";

  const provenanceCopy = pathInputVisible ? getMintSheetProvenanceCopy() : "";
  mintSheetProvenance.textContent = provenanceCopy;
  mintSheetProvenance.classList.toggle("is-hidden", !provenanceCopy);

  mintSheetStatus.textContent = getMintSheetStatusCopy();
  const contextCopy = getMintSheetContextCopy();
  mintSheetContext.textContent = contextCopy;
  mintSheetContext.classList.toggle("is-hidden", !contextCopy);
  const [primary, secondary, tertiary] = getMintSheetActionConfigs();
  mintSheetPrimaryAction = primary.action;
  mintSheetSecondaryAction = secondary.action;
  mintSheetTertiaryAction = tertiary.action;
  syncMintSheetButton(mintSheetPrimary, primary);
  syncMintSheetButton(mintSheetSecondary, secondary);
  syncMintSheetButton(mintSheetTertiary, tertiary);
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

  const provider = getReadProvider();

  if (!provider || !THOUGHT_NFT_ADDRESS) {
    walletState.balance = null;
    walletState.preflightLoading = false;
    walletState.preflightError = "mint contract not configured.";
    syncPrimaryCtaAvailability();
    syncWalletMenu();
    return;
  }

  try {
    walletState.balance = walletState.address ? await provider.getBalance(walletState.address) : null;
    walletState.preflightError = "";
  } catch (error) {
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
  const previousAddress = walletState.address;
  const previousChainId = walletState.chainId;
  walletState.detected = ethereum !== null;

  if (walletDisconnectedByUser) {
    walletState.address = "";
    walletState.chainId = null;
    await refreshMintPreflight();
    return;
  }

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

  if (walletState.address !== previousAddress || walletState.chainId !== previousChainId) {
    clearMintAuthorization();
    if (mintFlowState !== "closed" && mintFlowState !== "wallet_required") {
      mintFlowState = walletState.address ? "path_required" : "wallet_required";
      mintFlowData.error = "";
      mintFlowData.errorKind = "none";
    }
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
    setWarning("No supported wallet found.", { level: "warn" });
    setStatus("");
    return;
  }

  walletDisconnectedByUser = false;
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
    setWarning("No supported wallet found.", { level: "warn" });
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

const extractMintedTokenId = (receipt: { logs?: readonly { topics: readonly string[]; data: string }[] }) => {
  const contract = getReadThoughtNFT();
  if (!contract) {
    return null;
  }

  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
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

const openMintSheet = async (uiMode: MintFlowUiMode = "sheet") => {
  if (!currentOutputText) {
    return;
  }

  if (!hasCurrentContractWorkSvg()) {
    setMintFlowError("contract SVG missing.", "thought");
    syncInterface();
    return;
  }

  resetMintFlow();
  mintFlowUiMode = uiMode;
  mintFlowData.rawText = currentOutputText;
  try {
    mintFlowData.textHash = await textHashFromContract(currentOutputText);
  } catch {
    setMintFlowError("text preview unavailable.", "thought");
    syncInterface();
    return;
  }
  mintFlowData.promptHash = currentRunContext?.prompt ? hashText(currentRunContext.prompt) : "";
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  mintFlowData.txHash = "";
  walletState.txState = "idle";
  walletState.txError = "";
  mintFlowState = "thought_checking";
  syncInterface();

  if (byteLength(mintFlowData.rawText) > MAX_TEXT_BYTES) {
    setMintFlowError("THOUGHT too large.", "thought");
    syncInterface();
    return;
  }

  let spec: ActiveThoughtSpec;
  try {
    spec = await ensureActiveThoughtSpec();
    syncThoughtInstructionsControls();
  } catch (error) {
    const message = formatThoughtSpecError(error);
    setMintFlowError(message, message.includes("THOUGHT.md") ? "spec" : "thought");
    syncInterface();
    return;
  }

  mintFlowData.thoughtSpecId = spec.specId;
  mintFlowData.thoughtSpecHash = spec.specHash;
  const provenanceJson = buildProvenanceJson(mintFlowData.textHash);
  const provenanceBytes = byteLength(provenanceJson);
  if (provenanceBytes > MAX_PROVENANCE_BYTES) {
    setMintFlowError(provenanceTooLargeMessage(provenanceBytes), "thought");
    syncInterface();
    return;
  }
  mintFlowData.provenanceJson = provenanceJson;

  const token = getReadThoughtNFT();
  if (!token) {
    setMintFlowError("mint unavailable.", "thought");
    syncInterface();
    return;
  }

  try {
    if (!await verifyThoughtSpecAnchor()) {
      setMintFlowError("spec mismatch.", "spec");
      syncInterface();
      return;
    }

    const existingTokenId = (await token.tokenOfThought(mintFlowData.textHash)) as bigint;
    if (existingTokenId !== 0n) {
      mintFlowData.existingTokenId = Number(existingTokenId);
      mintFlowState = "text_taken";
      syncInterface();
      return;
    }

    if (!mintFlowData.pathIdInput && PRESELECTED_PATH_ID) {
      mintFlowData.pathIdInput = PRESELECTED_PATH_ID;
    }

    mintFlowData.pathId = parsePathTokenId(mintFlowData.pathIdInput);
    await refreshWalletState();
    mintFlowState = walletState.address ? "path_required" : "wallet_required";
    syncInterface();
  } catch {
    setMintFlowError("mint unavailable.", "thought");
    syncInterface();
  }
};

const checkPathEligibility = async () => {
  clearMintAuthorization();
  walletState.txState = "idle";
  walletState.txError = "";

  if (!PATH_NFT_ADDRESS || !THOUGHT_NFT_ADDRESS) {
    setMintFlowError("mint unavailable.", "thought");
    syncInterface();
    return;
  }

  const ethereum = getEthereumProvider();
  if (!ethereum) {
    mintFlowState = "wallet_required";
    syncInterface();
    return;
  }

  await refreshWalletState();

  if (!walletState.address) {
    mintFlowState = "wallet_required";
    syncInterface();
    return;
  }

  if (walletState.chainId !== THOUGHT_CHAIN_ID) {
    setMintFlowError("wrong network.", "wrong_network");
    syncInterface();
    return;
  }

  const pathId = parsePathTokenId(mintFlowData.pathIdInput);
  if (pathId === null) {
    setMintFlowError("enter a valid $PATH #.", "path_invalid");
    syncInterface();
    return;
  }

  const pathNft = getReadPathNft();
  if (!pathNft) {
    setMintFlowError("mint unavailable.", "thought");
    syncInterface();
    return;
  }

  mintFlowData.pathId = pathId;
  mintFlowState = "path_checking";
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  syncInterface();

  try {
    const owner = (await pathNft.ownerOf(pathId)) as string;
    const [authorizedMinter, stage, stageMinted, movementQuota] =
      await Promise.all([
        pathNft.getAuthorizedMinter(PATH_MOVEMENT_THOUGHT) as Promise<string>,
        pathNft.getStage(pathId) as Promise<bigint>,
        pathNft.getStageMinted(pathId) as Promise<bigint>,
        pathNft.getMovementQuota(PATH_MOVEMENT_THOUGHT) as Promise<bigint>,
      ]);
    const wallet = walletState.address.toLowerCase();
    if (owner.toLowerCase() !== wallet) {
      setMintFlowError(`wallet does not hold $PATH #${pathId.toString()}.`, "path_not_found");
      syncInterface();
      return;
    }

    if (authorizedMinter.toLowerCase() !== THOUGHT_NFT_ADDRESS.toLowerCase()) {
      setMintFlowError(`$PATH #${pathId.toString()} not ready for THOUGHT.`, "path_not_ready");
      syncInterface();
      return;
    }

    if (movementQuota === 0n) {
      setMintFlowError(`$PATH #${pathId.toString()} not ready for THOUGHT.`, "path_not_ready");
      syncInterface();
      return;
    }

    if (stage !== 0n || stageMinted >= movementQuota) {
      setMintFlowError(
        `$PATH #${pathId.toString()} has no THOUGHT unit available.`,
        "path_consumed",
      );
      syncInterface();
      return;
    }

    mintFlowState = "path_ready";
    mintFlowData.error = "";
    mintFlowData.errorKind = "none";
    syncInterface();
  } catch (error) {
    const notFound = error instanceof Error && /invalid token|nonexistent|erc721|owner query/i.test(error.message);
    setMintFlowError(
      notFound ? `wallet does not hold $PATH #${pathId.toString()}.` : `$PATH #${pathId.toString()} status unknown.`,
      notFound ? "path_not_found" : "path_unknown",
    );
    syncInterface();
  }
};

const authorizeMint = async () => {
  const ethereum = getEthereumProvider();
  if (!ethereum || !walletState.address || mintFlowData.pathId === null) {
    mintFlowState = "wallet_required";
    syncInterface();
    return;
  }

  try {
    await rebuildFinalMintProvenance();

    mintFlowState = "authorizing";
    walletState.txError = "";
    mintFlowData.error = "";
    mintFlowData.errorKind = "none";
    syncInterface();
    setWarning("");
    setStatus("");

    const browserProvider = new BrowserProvider(ethereum);
    const signer = await browserProvider.getSigner();
    const consumeAuth = await signPathConsumeAuthorization(signer, await signer.getAddress(), mintFlowData.pathId);
    mintFlowData.deadline = consumeAuth.deadline;
    mintFlowData.signature = consumeAuth.signature;
    mintFlowState = "authorized";
    syncInterface();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("provenance too large")) {
      setMintFlowError(message, "thought");
      syncInterface();
      return;
    }
    setMintFlowError(
      message.startsWith("spec ") ? message : "authorization rejected.",
      message.startsWith("spec ") ? "spec" : "signature",
    );
    syncInterface();
  }
};

type MintTransactionResponse = {
  hash: string;
  nonce?: number;
  from?: string;
  wait: () => Promise<{ logs?: Array<{ topics: string[]; data: string }> } | null>;
};

type MintReceipt = {
  logs?: readonly { topics: readonly string[]; data: string }[];
};

const mintErrorMessage = (error: unknown) => {
  const errorName =
    typeof error === "object" && error !== null && "errorName" in error
      ? String((error as { errorName?: unknown }).errorName ?? "")
      : "";
  const shortMessage =
    typeof error === "object" && error !== null && "shortMessage" in error
      ? String((error as { shortMessage?: unknown }).shortMessage ?? "")
      : "";
  const message = error instanceof Error ? error.message : shortMessage;

  if (errorName === "ThoughtAlreadyMinted" || /ThoughtAlreadyMinted/i.test(message)) {
    return "this exact text is already minted.";
  }
  if (/expired/i.test(message)) {
    return "authorization expired.";
  }
  if (/rejected|denied|cancel/i.test(message)) {
    return "transaction rejected.";
  }
  if (/not submitted|timed out|timeout/i.test(message)) {
    return "wallet transaction not submitted.";
  }
  if (/BAD_MOVEMENT_ORDER|QUOTA_EXHAUSTED/i.test(message)) {
    return "$PATH has no THOUGHT unit available.";
  }
  if (/BAD_CONSUME_AUTH/i.test(message)) {
    return "authorization expired.";
  }
  if (/ERR_NOT_OWNER/i.test(message)) {
    return "wallet does not hold this $PATH.";
  }
  return shortMessage || message || "mint failed.";
};

const sleep = (ms: number) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const waitForMintReceiptByHash = async (tx: MintTransactionResponse): Promise<MintReceipt | null> => {
  const provider = getReadProvider();
  const deadline = Date.now() + MINT_RECEIPT_TIMEOUT_MS;

  if (provider) {
    while (Date.now() < deadline) {
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt) {
        return receipt;
      }
      await sleep(MINT_RECEIPT_POLL_MS);
    }
  }

  return tx.wait();
};

const resolveMintedTokenId = async (receipt: MintReceipt | null) => {
  const fromReceipt = extractMintedTokenId(receipt ?? { logs: [] });
  if (fromReceipt !== null) {
    return fromReceipt;
  }

  if (!mintFlowData.textHash) {
    return null;
  }

  try {
    const token = getReadThoughtNFT();
    const tokenId = token ? ((await token.tokenOfThought(mintFlowData.textHash)) as bigint) : 0n;
    return tokenId === 0n ? null : Number(tokenId);
  } catch {
    return null;
  }
};

const resolveExistingThoughtTokenId = async () => {
  if (!mintFlowData.textHash) {
    return null;
  }

  try {
    const token = getReadThoughtNFT();
    const tokenId = token ? ((await token.tokenOfThought(mintFlowData.textHash)) as bigint) : 0n;
    return tokenId === 0n ? null : Number(tokenId);
  } catch {
    return null;
  }
};

const selectedPathAlreadyConsumed = async () => {
  const pathId = mintFlowData.pathId;
  const pathNft = getReadPathNft();
  if (pathId === null || !pathNft) {
    return false;
  }

  try {
    const [stage, stageMinted, movementQuota] = await Promise.all([
      pathNft.getStage(pathId) as Promise<bigint>,
      pathNft.getStageMinted(pathId) as Promise<bigint>,
      pathNft.getMovementQuota(PATH_MOVEMENT_THOUGHT) as Promise<bigint>,
    ]);
    return stage !== 0n || (movementQuota !== 0n && stageMinted >= movementQuota);
  } catch {
    return false;
  }
};

const recoverMintStateAfterRevert = async (shouldAppendCliResult: boolean) => {
  const existingTokenId = await resolveExistingThoughtTokenId();
  if (existingTokenId !== null) {
    walletState.txState = "idle";
    walletState.txError = "";
    walletState.mintedTokenId = existingTokenId;
    mintFlowData.existingTokenId = existingTokenId;
    mintFlowState = "minted";
    pendingMyBrainRunPayload = null;
    await refreshMintPreflight();
    syncInterface();

    if (shouldAppendCliResult) {
      const consumedPathId = selectedCliPathId();
      appendCliOutput([
        "already minted.",
        `THOUGHT: #${existingTokenId}`,
        consumedPathId ? `$PATH #${consumedPathId} THOUGHT unit already consumed.` : "",
        walletState.txHash || mintFlowData.txHash ? "use: view tx" : "",
        viewThoughtUseLine(existingTokenId),
        "use: gallery",
      ].filter(Boolean));
    }
    return true;
  }

  if (await selectedPathAlreadyConsumed()) {
    const pathId = selectedCliPathId();
    setMintFlowError(
      pathId ? `$PATH #${pathId} has no THOUGHT unit available.` : "$PATH has no THOUGHT unit available.",
      "path_consumed",
    );
    syncInterface();
    return true;
  }

  return false;
};

const waitForMintReceipt = async (tx: MintTransactionResponse, shouldAppendCliResult: boolean) => {
  try {
    const receipt = await waitForMintReceiptByHash(tx);
    const mintedTokenId = await resolveMintedTokenId(receipt);

    walletState.txState = "idle";
    walletState.txError = "";
    walletState.mintedTokenId = mintedTokenId;
    walletState.txHash = tx.hash;
    mintFlowData.txHash = tx.hash;
    mintFlowState = "minted";
    pendingMyBrainRunPayload = null;
    await refreshMintPreflight();
    syncInterface();

    if (shouldAppendCliResult) {
      const consumedPathId = selectedCliPathId();
      appendCliOutput([
        "minted.",
        mintedTokenId !== null ? `THOUGHT: #${mintedTokenId}` : "THOUGHT: minted",
        consumedPathId ? `$PATH #${consumedPathId} THOUGHT unit consumed.` : "",
        "use: view tx",
        viewThoughtUseLine(mintedTokenId),
        "use: gallery",
      ].filter(Boolean));
    }
  } catch (error) {
    if (await recoverMintStateAfterRevert(shouldAppendCliResult)) {
      return;
    }

    const message = mintErrorMessage(error);
    setMintFlowError(
      message,
      message.includes("provenance too large") ? "thought" : message.includes("expired") ? "signature" : "mint",
    );
    syncInterface();
    setStatus("");

    if (shouldAppendCliResult) {
      appendCliError([message, "use: current"]);
    }
  }
};

const detectSubmittedTxNonceGap = async (
  tx: MintTransactionResponse,
  fallbackAddress: string,
  provider: JsonRpcProvider | BrowserProvider | null,
) => {
  if (typeof tx.nonce !== "number" || !provider) {
    return null;
  }

  const from = tx.from || fallbackAddress || walletState.address;
  if (!from) {
    return null;
  }

  try {
    const expectedNonce = await provider.getTransactionCount(from, "pending");
    return tx.nonce > expectedNonce ? { actual: tx.nonce, expected: expectedNonce } : null;
  } catch {
    return null;
  }
};

const registerSubmittedMintTx = async (
  tx: MintTransactionResponse,
  shouldAppendCliResult: boolean,
  fallbackAddress: string,
  provider: JsonRpcProvider | BrowserProvider | null,
) => {
  const nonceGap = await detectSubmittedTxNonceGap(tx, fallbackAddress, provider);
  walletState.txState = "submitted";
  walletState.txHash = tx.hash;
  mintFlowData.txHash = tx.hash;
  setStatus("");

  if (nonceGap) {
    const message = `transaction queued with nonce ${nonceGap.actual}; chain expects ${nonceGap.expected}.`;
    setMintFlowError(message, "mint");
    syncInterface();

    if (shouldAppendCliResult) {
      appendCliError([
        "transaction queued.",
        `tx: ${shortHex(tx.hash, 10, 8)}`,
        `wallet nonce: ${nonceGap.actual}`,
        `chain expects: ${nonceGap.expected}`,
        "mint is not pending onchain yet.",
        "reset Rabby nonce/activity, then retry confirm.",
        "use: current",
      ]);
    }
    return;
  }

  syncInterface();

  if (shouldAppendCliResult) {
    appendCliOutput(["transaction submitted.", `tx: ${shortHex(tx.hash, 10, 8)}`, "waiting for chain confirmation...", "use: view tx"]);
  }

  void waitForMintReceipt(tx, shouldAppendCliResult);
};

const rebuildFinalMintProvenance = async () => {
  if (!walletState.address || mintFlowData.pathId === null) {
    throw new Error("mint context unavailable.");
  }

  const spec = await ensureActiveThoughtSpec();
  mintFlowData.thoughtSpecId = spec.specId;
  mintFlowData.thoughtSpecHash = spec.specHash;
  if (!mintFlowData.textHash) {
    mintFlowData.textHash = await textHashFromContract(mintFlowData.rawText);
  }
  const promptHash = currentRunContext?.prompt ? hashText(currentRunContext.prompt) : hashText(sessionState.prompt);
  mintFlowData.promptHash = promptHash;
  const provenanceJson = buildProvenanceJson(mintFlowData.textHash, {
    minter: walletState.address,
    pathId: mintFlowData.pathId,
    promptHash,
  });
  const provenanceBytes = byteLength(provenanceJson);
  if (provenanceBytes > MAX_PROVENANCE_BYTES) {
    throw new Error(provenanceTooLargeMessage(provenanceBytes));
  }
  mintFlowData.provenanceJson = provenanceJson;
};

const confirmMint = async (options?: { appendCliResult?: boolean }) => {
  const shouldAppendCliResult = options?.appendCliResult ?? false;
  const ethereum = getEthereumProvider();
  if (
    !ethereum ||
    mintFlowData.pathId === null ||
    !mintFlowData.provenanceJson ||
    !mintFlowData.thoughtSpecId ||
    !mintFlowData.thoughtSpecHash ||
    !mintFlowData.deadline ||
    !mintFlowData.signature
  ) {
    clearMintAuthorization();
    mintFlowState = "path_ready";
    syncInterface();
    return;
  }

  if (mintFlowData.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    setMintFlowError("authorization expired.", "signature");
    syncInterface();
    return;
  }

  let txTimedOut = false;

  try {
    await rebuildFinalMintProvenance();
    const browserProvider = new BrowserProvider(ethereum);
    const signer = await browserProvider.getSigner();
    const signerAddress = await signer.getAddress();
    const nonceProvider = getReadProvider() ?? browserProvider;
    const nonce = await nonceProvider.getTransactionCount(signerAddress, "pending");
    const writableToken = new Contract(THOUGHT_NFT_ADDRESS, THOUGHT_NFT_ABI, signer);

    mintFlowState = "minting";
    walletState.txState = "awaiting_signature";
    walletState.txError = "";
    mintFlowData.error = "";
    mintFlowData.errorKind = "none";
    syncInterface();

    let txHandled = false;
    const txPromise = writableToken.mint(
      mintFlowData.rawText,
      mintFlowData.pathId,
      mintFlowData.thoughtSpecId,
      mintFlowData.thoughtSpecHash,
      mintFlowData.promptHash,
      mintFlowData.provenanceJson,
      mintFlowData.deadline,
      mintFlowData.signature,
      { nonce },
    ) as Promise<MintTransactionResponse>;

    void txPromise.then((lateTx) => {
      if (txHandled || !txTimedOut) {
        return;
      }
      txHandled = true;
      void registerSubmittedMintTx(lateTx, shouldAppendCliResult, signerAddress, nonceProvider);
    }).catch(() => {
      // The awaited path below owns the visible error state.
    });

    const tx = await withTimeout(
      txPromise,
      WALLET_TX_SUBMIT_TIMEOUT_MS,
      "wallet transaction not submitted.",
    );
    if (!txHandled) {
      txHandled = true;
      await registerSubmittedMintTx(tx, shouldAppendCliResult, signerAddress, nonceProvider);
    }
    return tx.hash;
  } catch (error) {
    if (await recoverMintStateAfterRevert(shouldAppendCliResult)) {
      setStatus("");
      return walletState.txHash || mintFlowData.txHash || null;
    }

    const message = mintErrorMessage(error);
    txTimedOut = message.includes("not submitted");
    setMintFlowError(message, message.includes("expired") ? "signature" : "mint");
    syncInterface();
    setStatus("");
    return null;
  }
};

const pathMintUrl = () => {
  try {
    const url = new URL(PATH_MINT_URL, window.location.href);
    url.searchParams.set("intent", "mint-path");
    url.searchParams.set("from", "thought");
    url.searchParams.set("returnTo", window.location.href);
    return url.toString();
  } catch {
    return PATH_MINT_URL;
  }
};

const handleMintPath = () => {
  window.open(pathMintUrl(), "_blank", "noopener,noreferrer");
};

const chooseAnotherPath = () => {
  clearMintAuthorization();
  walletState.txState = "idle";
  walletState.txError = "";
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  mintFlowData.pathIdInput = "";
  mintFlowData.pathId = null;
  mintFlowState = walletState.address ? "path_required" : "wallet_required";
  syncInterface();
  if (mintFlowState === "path_required") {
    mintSheetPathBox.focus();
  }
};

const refreshMintSheetPath = async () => {
  await refreshWalletState();

  if (!walletState.address) {
    mintFlowState = "wallet_required";
    mintFlowData.error = "";
    mintFlowData.errorKind = "none";
    syncInterface();
    return;
  }

  if (walletState.chainId !== THOUGHT_CHAIN_ID) {
    setMintFlowError("wrong network.", "wrong_network");
    syncInterface();
    return;
  }

  if (canContinueWithPathInput()) {
    await checkPathEligibility();
    return;
  }

  mintFlowState = "path_required";
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  syncInterface();
};

const handleMintSheetAction = async (action: MintSheetAction) => {
  if (action === "none") {
    return;
  }

  if (action === "continue") {
    await checkPathEligibility();
    return;
  }

  if (action === "connect_wallet") {
    await requestWalletConnect();
    mintFlowState = walletState.address ? "path_required" : "wallet_required";
    syncInterface();
    return;
  }

  if (action === "authorize") {
    await authorizeMint();
    return;
  }

  if (action === "confirm_mint") {
    await confirmMint();
    return;
  }

  if (action === "view_tx") {
    await handleViewTx();
    return;
  }

  if (action === "view_thought") {
    await handleViewThought(walletState.mintedTokenId ?? mintFlowData.existingTokenId);
    return;
  }

  if (action === "choose_another") {
    chooseAnotherPath();
    return;
  }

  if (action === "mint_path") {
    handleMintPath();
    return;
  }

  if (action === "refresh") {
    await refreshMintSheetPath();
    return;
  }

  if (action === "reset") {
    closeMintSheet();
    resetThought();
    return;
  }

  if (action === "switch_network") {
    await switchWalletChain();
    mintFlowState = walletState.address ? "path_required" : "wallet_required";
    syncInterface();
  }
};

const handleViewTx = async () => {
  if (!walletState.txHash) {
    return;
  }

  const txUrl = thoughtTxUrl(walletState.txHash);
  if (txUrl) {
    window.open(txUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const copied = await copyToClipboard(walletState.txHash);
  if (copied) {
    setStatus("tx hash copied.", { flashMs: NOTICE_FLASH_MS });
  }
};

const handleViewThought = async (tokenId?: number | null) => {
  const thoughtNftId = tokenId ?? walletState.mintedTokenId ?? mintFlowData.existingTokenId;
  if (thoughtNftId === null || thoughtNftId === undefined) {
    setStatus("THOUGHT unavailable.", { flashMs: NOTICE_FLASH_MS });
    return;
  }

  window.location.href = thoughtDetailUrl(thoughtNftId);
};

const galleryUrl = (targetTokenId?: number | null) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("gallery", "1");
  if (targetTokenId !== null && targetTokenId !== undefined) {
    url.searchParams.set("thought", targetTokenId.toString());
  }
  return url.toString();
};

const thoughtDetailUrl = (tokenId: number) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("thought", tokenId.toString());
  return url.toString();
};

const parseThoughtNFTIdInput = (input: string) => {
  const trimmed = input.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const tokenId = Number(trimmed);
  return Number.isSafeInteger(tokenId) ? tokenId : null;
};

const viewThoughtUseLine = (tokenId?: number | null) =>
  `use: view THOUGHT ${tokenId ?? "<id>"}`;

const configureGalleryLink = () => {
  thoughtGalleryLink.href = galleryUrl();
  thoughtDetailGalleryLink.href = galleryUrl();
};

const decodeBase64Utf8 = (value: string) => {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const decodeDataUriText = (uri: string) => {
  const commaIndex = uri.indexOf(",");
  if (!uri.startsWith("data:") || commaIndex === -1) {
    throw new Error("unsupported token uri");
  }

  const header = uri.slice(0, commaIndex);
  const payload = uri.slice(commaIndex + 1);
  return header.includes(";base64") ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
};

const readTokenMetadata = (uri: string): ThoughtNFTMetadata => {
  const decoded = decodeDataUriText(uri);
  const parsed = JSON.parse(decoded) as unknown;
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed as ThoughtNFTMetadata;
};

const svgToImageUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const readTokenUriPayload = (uri: string): ThoughtNFTUriPayload => {
  const trimmed = uri.trim();
  if (!trimmed) {
    return { metadata: {}, image: "" };
  }

  if (/^<svg[\s>]/i.test(trimmed)) {
    return { metadata: {}, image: svgToImageUri(trimmed) };
  }

  if (trimmed.startsWith("data:image/svg+xml")) {
    return { metadata: {}, image: trimmed };
  }

  try {
    const metadata = readTokenMetadata(trimmed);
    return { metadata, image: metadata.image ?? "" };
  } catch {
    return { metadata: {}, image: "" };
  }
};

const metadataString = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  return "";
};

const metadataNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
};

const shortHex = (value: string, front = 6, back = 4) =>
  value.length > front + back + 3 ? `${value.slice(0, front)}...${value.slice(-back)}` : value;

const quoteCliText = (value: string, maxLength = 48) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  const clipped =
    normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
  return `"${clipped}"`;
};

const quoteCliFullText = (value: string) => `"${value.replace(/\s+/g, " ").trim()}"`;

const formatCliModelReturnValue = (returnedText: string, canonicalText: string) => {
  const normalizedReturn = returnedText.replace(/\s+/g, " ").trim();
  if (!normalizedReturn) {
    return "unavailable";
  }
  return normalizedReturn === canonicalText.replace(/\s+/g, " ").trim()
    ? "same as text"
    : quoteCliFullText(returnedText);
};

const galleryTipTime = (mintedAt: number | null) =>
  mintedAt === null
    ? "unknown time"
    : `${new Date(mintedAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const detailTime = (mintedAt: number | null) => {
  if (mintedAt === null) {
    return "unknown time";
  }

  return new Date(mintedAt * 1000)
    .toISOString()
    .replace(".000Z", "Z")
    .replace("T", " ")
    .replace("Z", " UTC");
};

const shortDetailAddress = (value: string) => shortHex(value, 18, 10);

const parseThoughtDetailSpec = (thought: GalleryThought): ThoughtDetailSpec => {
  const fallback = {
    id: thought.thoughtSpecId,
    ref: "THOUGHT.v1.md",
    hash: thought.thoughtSpecHash,
    text: "",
  };

  if (!thought.provenanceJson) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(thought.provenanceJson) as {
      thoughtSpec?: {
        id?: unknown;
        ref?: unknown;
        hash?: unknown;
      };
    };
    const thoughtSpec = parsed.thoughtSpec;
    return {
      id: typeof thoughtSpec?.id === "string" ? thoughtSpec.id : fallback.id,
      ref: typeof thoughtSpec?.ref === "string" ? thoughtSpec.ref : fallback.ref,
      hash: typeof thoughtSpec?.hash === "string" ? thoughtSpec.hash : fallback.hash,
      text: "",
    };
  } catch {
    return fallback;
  }
};

const parseProvenanceMaterial = (provenanceJson: string) => {
  if (!provenanceJson) {
    return { prompt: "", promptHash: "", returnedText: "", returnedTextHash: "", mode: "", provider: "", model: "" };
  }

  try {
    const parsed = JSON.parse(provenanceJson) as {
      prompt?: unknown;
      route?: unknown;
      provider?: unknown;
      model?: unknown;
      output?: {
        returnedText?: unknown;
      };
      hashes?: {
        promptHash?: unknown;
        returnedTextHash?: unknown;
      };
    };
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
    const mode = typeof parsed.route === "string" ? parsed.route : "";
    const provider = typeof parsed.provider === "string" ? parsed.provider : "";
    const model = typeof parsed.model === "string" ? parsed.model : "";
    const promptHash = typeof parsed.hashes?.promptHash === "string" ? parsed.hashes.promptHash : "";
    const returnedText = typeof parsed.output?.returnedText === "string" ? parsed.output.returnedText : "";
    const returnedTextHash =
      typeof parsed.hashes?.returnedTextHash === "string" ? parsed.hashes.returnedTextHash : "";
    return {
      prompt,
      promptHash: promptHash || (prompt ? hashText(prompt) : ""),
      returnedText,
      returnedTextHash: returnedTextHash || (returnedText ? hashText(returnedText) : ""),
      mode,
      provider,
      model,
    };
  } catch {
    return { prompt: "", promptHash: "", returnedText: "", returnedTextHash: "", mode: "", provider: "", model: "" };
  }
};

const normalizeThoughtDetail = (thought: GalleryThought): ThoughtDetail => ({
  tokenId: thought.tokenId,
  rawText: thought.rawText,
  prompt: thought.prompt,
  returnedText: thought.returnedText,
  pathId: thought.pathId,
  minter: thought.minter,
  mintedAt: thought.mintedAt,
  txHash: thought.txHash,
  textHash: thought.textHash,
  promptHash: thought.promptHash,
  returnedTextHash: thought.returnedTextHash,
  provenanceHash: thought.provenanceHash,
  mode: thought.mode,
  provider: thought.provider,
  model: thought.model,
  thoughtSpec: parseThoughtDetailSpec(thought),
  provenanceJson: thought.provenanceJson,
  image: thought.image,
});

const showThoughtDetailStatus = (message: string) => {
  if (thoughtDetailStatusTimer !== null) {
    window.clearTimeout(thoughtDetailStatusTimer);
  }
  thoughtDetailCopyStatus.textContent = message;
  if (!message) {
    return;
  }
  thoughtDetailStatusTimer = window.setTimeout(() => {
    thoughtDetailCopyStatus.textContent = "";
    thoughtDetailStatusTimer = null;
  }, NOTICE_FLASH_MS);
};

const copyThoughtDetailValue = async (value: string, label = "copied.") => {
  const copied = await copyToClipboard(value);
  showThoughtDetailStatus(copied ? label : "copy unavailable.");
};

const formatProvenanceJson = (value: string) => {
  if (!value) {
    return "{}";
  }

  try {
    return JSON.stringify(JSON.parse(value) as unknown, null, 2);
  } catch {
    return value;
  }
};

const thoughtDetailTextBlocks = [
  thoughtDetailCanonicalTitle,
  thoughtDetailPrompt,
  thoughtDetailModelReturn,
];

const thoughtDetailTextLineHeight = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  return Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.55;
};

const thoughtDetailNeedsTextWindow = (element: HTMLElement) =>
  element.scrollHeight > thoughtDetailTextLineHeight(element) * 2 + 1;

const syncThoughtDetailTextBlocks = () => {
  window.cancelAnimationFrame(thoughtDetailTextFrame);

  thoughtDetailTextFrame = window.requestAnimationFrame(() => {
    thoughtDetailTextBlocks.forEach((element) => {
      element.classList.remove("is-embedded");
      element.scrollTop = 0;
    });

    thoughtDetailTextBlocks.forEach((element) => {
      element.classList.toggle("is-embedded", thoughtDetailNeedsTextWindow(element));
    });

    syncThoughtDetailEmbeddedHeights();
  });
};

const setThoughtDetailTextBlock = (element: HTMLElement, value: string) => {
  element.textContent = value;
  element.classList.remove("is-embedded");
  syncThoughtDetailTextBlocks();
};

const visibleThoughtDetailEmbeds = () =>
  [
    thoughtDetailJsonPanel.classList.contains("is-hidden") ? null : thoughtDetailProvenanceJson,
  ].filter((element): element is HTMLElement => element !== null);

const thoughtDetailRailContentBottom = () =>
  Array.from(thoughtDetailRail.children).reduce(
    (bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom),
    thoughtDetailRail.getBoundingClientRect().top,
  );

const syncThoughtDetailEmbeddedHeights = () => {
  window.cancelAnimationFrame(thoughtDetailEmbeddedHeightFrame);

  thoughtDetailEmbeddedHeightFrame = window.requestAnimationFrame(() => {
    const embeddedWindows = visibleThoughtDetailEmbeds();
    embeddedWindows.forEach((element) => {
      element.style.maxHeight = "";
    });

    if (
      !embeddedWindows.length ||
      window.matchMedia("(max-width: 900px)").matches ||
      thoughtDetailBody.classList.contains("is-hidden")
    ) {
      return;
    }

    const canvasFrame = thoughtDetailImage.closest(".thought-detail__canvas-frame") as HTMLElement | null;
    if (!canvasFrame) {
      return;
    }

    const targetBottom = canvasFrame.getBoundingClientRect().bottom;
    const railBottom = thoughtDetailRailContentBottom();
    const overflow = Math.ceil(railBottom - targetBottom);

    if (overflow <= 0) {
      return;
    }

    const minimumHeight = 120;
    const reducibleHeights = embeddedWindows.map((element) =>
      Math.max(0, element.getBoundingClientRect().height - minimumHeight),
    );
    const totalReducibleHeight = reducibleHeights.reduce((sum, value) => sum + value, 0);

    if (totalReducibleHeight <= 0) {
      embeddedWindows.forEach((element) => {
        element.style.maxHeight = `${minimumHeight}px`;
      });
      return;
    }

    embeddedWindows.forEach((element, index) => {
      const currentHeight = element.getBoundingClientRect().height;
      const reduction = overflow * (reducibleHeights[index] / totalReducibleHeight);
      element.style.maxHeight = `${Math.max(minimumHeight, currentHeight - reduction - 2)}px`;
    });

    thoughtDetailEmbeddedHeightFrame = window.requestAnimationFrame(() => {
      const remainingOverflow = Math.ceil(thoughtDetailRailContentBottom() - targetBottom);
      if (remainingOverflow <= 0) {
        return;
      }

      const lastWindow = embeddedWindows[embeddedWindows.length - 1];
      const currentMaxHeight =
        Number.parseFloat(lastWindow.style.maxHeight) || lastWindow.getBoundingClientRect().height;
      lastWindow.style.maxHeight = `${Math.max(minimumHeight, currentMaxHeight - remainingOverflow - 2)}px`;
    });
  });
};

const escapeSvgText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const galleryThumbnailUri = (rawText: string) => {
  const title = canonicalThoughtTitle(rawText);
  const chars = Array.from(title);
  const { imageSize, gap, rowWidth } = fitImagesToRow(chars.length, CANVAS_WIDTH);
  const xStart = (CANVAS_WIDTH - rowWidth) / 2;
  const yStart = (CANVAS_WIDTH - imageSize) / 2;
  const blocks = chars.map((char, index) => {
    if (char === " ") {
      return "";
    }

    const x = xStart + index * (imageSize + gap);
    return `<rect x="${x}" y="${yStart}" width="${imageSize}" height="${imageSize}" fill="${colorForCharacter(char)}"/>`;
  }).join("");
  const textSize = contractLikeSvgTextSize(chars.length);
  const label = title
    ? `<text x="${CANVAS_WIDTH / 2}" y="${CANVAS_WIDTH - CANVAS_PADDING}" font-family="monospace" font-size="${textSize}" font-weight="100" text-anchor="middle" fill="#E8EDF7" fill-opacity="0.72">${escapeSvgText(title)}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_WIDTH}" shape-rendering="crispEdges"><rect width="${CANVAS_WIDTH}" height="${CANVAS_WIDTH}" fill="${BACKGROUND_FILL}"/>${blocks}${label}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const contractLikeSvgTextSize = (charCount: number) => {
  if (charCount <= 0) {
    return SVG_TEXT_MAX_SIZE;
  }

  const availableWidth = CANVAS_WIDTH - 2 * CANVAS_PADDING;
  const fitSize = Math.floor(availableWidth / (charCount * SVG_TEXT_CHAR_ADVANCE));
  return Math.max(SVG_TEXT_MIN_SIZE, Math.min(SVG_TEXT_MAX_SIZE, fitSize));
};

const renderGalleryCard = (thought: GalleryThought) => {
  const card = document.createElement("article");
  card.className = "thought-gallery__card";
  card.dataset.tokenId = thought.tokenId.toString();
  const title = canonicalThoughtTitle(thought.rawText);

  const imageLink = document.createElement("a");
  imageLink.className = "thought-gallery__thumb";
  imageLink.href = thoughtDetailUrl(thought.tokenId);
  imageLink.setAttribute("aria-label", `Open THOUGHT #${thought.tokenId}`);

  const image = document.createElement("img");
  image.className = "thought-gallery__image";
  image.src = thought.image || galleryThumbnailUri(title);
  image.alt = `THOUGHT #${thought.tokenId}`;
  image.loading = "lazy";

  const tip = document.createElement("span");
  tip.className = "thought-gallery__tip";
  const tipTitle = document.createElement("strong");
  tipTitle.textContent = `THOUGHT #${thought.tokenId}`;
  const tipText = document.createElement("span");
  tipText.textContent = title || "(empty)";
  const tipBreak = document.createElement("span");
  tipBreak.className = "thought-gallery__tip-break";
  tipBreak.setAttribute("aria-hidden", "true");
  const tipPath = document.createElement("span");
  tipPath.textContent = `$PATH #${thought.pathId} THOUGHT unit consumed`;
  const tipMinted = document.createElement("span");
  tipMinted.textContent = `minted ${galleryTipTime(thought.mintedAt)}`;
  const tipMinter = document.createElement("span");
  tipMinter.textContent = `by ${shortHex(thought.minter, 6, 4)}`;
  tip.append(tipTitle, tipText, tipBreak, tipPath, tipMinted, tipMinter);

  imageLink.append(image, tip);
  card.append(imageLink);
  return card;
};

const isGalleryThought = (value: GalleryThought | null): value is GalleryThought => value !== null;

const readGalleryThoughts = async (): Promise<GalleryThought[] | null> => {
  const provider = getReadProvider();
  const token = getReadThoughtNFT();
  if (!provider || !token || !THOUGHT_NFT_ADDRESS) {
    return null;
  }

  const logs = await provider.getLogs({
    address: THOUGHT_NFT_ADDRESS,
    fromBlock: 0,
    toBlock: "latest",
    topics: [THOUGHT_MINTED_TOPIC],
  });

  const thoughts = (
    await Promise.all(logs.map(async (log): Promise<GalleryThought | null> => {
      try {
        const parsed = token.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed || parsed.name !== "ThoughtMinted") {
          return null;
        }

        const tokenId = Number(parsed.args[0] as bigint);
        const minter = String(parsed.args[1]);
        const pathId = (parsed.args[2] as bigint).toString();
        const textHash = String(parsed.args[3]);
        const provenanceHash = String(parsed.args[4]);
        const thoughtSpecId = String(parsed.args[5]);
        const thoughtSpecHash = String(parsed.args[6]);
        const eventMintedAt = Number(parsed.args[7] as bigint);
        let tokenUri = "";
        let metadata: ThoughtNFTMetadata = {};
        let tokenImage = "";
        try {
          tokenUri = (await token.tokenURI(tokenId, { gasLimit: TOKEN_URI_CALL_GAS_LIMIT })) as string;
          const payload = readTokenUriPayload(tokenUri);
          metadata = payload.metadata;
          tokenImage = payload.image;
        } catch {
          // Long v0.8 works can exceed conservative eth_call gas defaults for tokenURI.
          tokenUri = "";
        }
        const properties = metadata.properties ?? {};
        const thoughtEnvelope = metadata.thought ?? {};
        const rawText =
          metadataString(properties.rawText) ||
          metadataString(thoughtEnvelope.text) ||
          String(await token.rawTextOf(tokenId));
        let onchainProvenanceJson = "";
        try {
          onchainProvenanceJson = String(await token.provenanceOf(tokenId));
        } catch {
          onchainProvenanceJson = "";
        }
        const provenanceJson =
          onchainProvenanceJson ||
          metadataString(properties.provenanceJson) ||
          metadataString(thoughtEnvelope.provenance) ||
          "";
        const provenanceMaterial = parseProvenanceMaterial(provenanceJson);

        return {
          tokenId,
          pathId: metadataString(properties.pathId) || pathId,
          minter: metadataString(properties.minter) || minter,
          textHash: metadataString(properties.textHash) || textHash,
          promptHash: metadataString(properties.promptHash) || provenanceMaterial.promptHash,
          provenanceHash: metadataString(properties.provenanceHash) || provenanceHash,
          thoughtSpecId: metadataString(properties.thoughtSpecId) || thoughtSpecId,
          thoughtSpecHash: metadataString(properties.thoughtSpecHash) || thoughtSpecHash,
          mintedAt: metadataNumber(properties.mintedAt) ?? eventMintedAt,
          rawText,
          prompt: provenanceMaterial.prompt,
          mode: provenanceMaterial.mode,
          provider: provenanceMaterial.provider,
          model: provenanceMaterial.model,
          returnedText: provenanceMaterial.returnedText,
          returnedTextHash: provenanceMaterial.returnedTextHash,
          provenanceJson,
          image: tokenImage || galleryThumbnailUri(rawText),
          tokenUri,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      } catch {
        return null;
      }
    }))
  ).filter(isGalleryThought);

  thoughts.sort((left, right) => left.tokenId - right.tokenId);
  return thoughts;
};

const highlightGalleryTarget = () => {
  if (GALLERY_TARGET_TOKEN_ID === null) {
    return;
  }

  const target = galleryGrid.querySelector<HTMLElement>(
    `.thought-gallery__card[data-token-id="${GALLERY_TARGET_TOKEN_ID}"]`,
  );
  if (!target) {
    return;
  }

  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("is-highlighted");
  window.setTimeout(() => {
    target.classList.remove("is-highlighted");
  }, 1000);
};

const loadThoughtGallery = async () => {
  galleryStatus.textContent = "loading minted THOUGHTs...";
  galleryGrid.replaceChildren();

  try {
    const thoughts = await readGalleryThoughts();
    if (!thoughts) {
      galleryStatus.textContent = "gallery unavailable.";
      return;
    }

    galleryStatus.textContent = thoughts.length === 0 ? "no minted THOUGHTs yet." : `${thoughts.length} minted THOUGHT${thoughts.length === 1 ? "" : "s"}.`;
    galleryGrid.replaceChildren(...thoughts.map(renderGalleryCard));
    highlightGalleryTarget();
  } catch {
    galleryStatus.textContent = "failed to read gallery.";
  }
};

const loadThoughtDetail = async () => {
  if (ROUTE_THOUGHT_NFT_ID === null) {
    thoughtDetailStatus.textContent = "THOUGHT unavailable.";
    return;
  }

  thoughtDetailTitleToken.textContent = ROUTE_THOUGHT_NFT_ID.toString();
  thoughtDetailBody.classList.add("is-hidden");
  thoughtDetailStatus.textContent = `loading THOUGHT #${ROUTE_THOUGHT_NFT_ID}...`;
  currentThoughtDetail = null;
  thoughtDetailJsonPanel.classList.add("is-hidden");
  clearThoughtDetailSpecJsonLink();
  revokeThoughtDetailColorFontUrl();
  clearThoughtDetailColorFontFallback();
  clearThoughtDetailProvenanceJsonLink();
  syncThoughtDetailEmbeddedHeights();
  showThoughtDetailStatus("");

  try {
    const thoughts = await readGalleryThoughts();
    if (!thoughts) {
      thoughtDetailStatus.textContent = "THOUGHT unavailable.";
      return;
    }

    const thought = thoughts.find((item) => item.tokenId === ROUTE_THOUGHT_NFT_ID);
    if (!thought) {
      thoughtDetailStatus.textContent = `THOUGHT #${ROUTE_THOUGHT_NFT_ID} not found.`;
      return;
    }

    const detail = normalizeThoughtDetail(thought);
    currentThoughtDetail = detail;
    const title = canonicalThoughtTitle(detail.rawText);
    const rawText = detail.rawText || title || "-";
    const provenanceBytes = detail.provenanceJson ? byteLength(detail.provenanceJson) : 0;
    const txUrl = thoughtTxUrl(detail.txHash);
    document.title = `THOUGHT #${thought.tokenId}`;
    thoughtDetailTitleToken.textContent = detail.tokenId.toString();
    thoughtDetailStatus.textContent = "";
    thoughtDetailImage.src = detail.image || galleryThumbnailUri(title);
    thoughtDetailImage.alt = `THOUGHT #${detail.tokenId} canvas`;
    thoughtDetailModel.textContent = detail.model || "model unavailable.";
    setThoughtDetailTextBlock(thoughtDetailCanonicalTitle, rawText);
    setThoughtDetailTextBlock(thoughtDetailPrompt, detail.prompt || "prompt unavailable.");
    setThoughtDetailTextBlock(
      thoughtDetailModelReturn,
      detail.returnedText ? detail.returnedText : "model return unavailable.",
    );
    thoughtDetailPath.textContent = `#${detail.pathId} THOUGHT unit consumed ↗`;
    thoughtDetailPath.href = txUrl || "#";
    thoughtDetailPath.title = txUrl
      ? `Open mint transaction where $PATH #${detail.pathId} THOUGHT unit was consumed`
      : "Transaction page unavailable.";
    thoughtDetailMinter.textContent = shortDetailAddress(detail.minter);
    thoughtDetailMinter.title = detail.minter;
    thoughtDetailMinted.textContent = detailTime(detail.mintedAt);
    thoughtDetailSpecRef.textContent = specLinkText(detail.thoughtSpec.ref);
    thoughtDetailColorFont.textContent = "Color Font v1 ↗";
    thoughtDetailColorFont.title = "Open local raw color-font mapping from ThoughtNFT color-font ABI";
    clearThoughtDetailSpecJsonLink("Loading local cached spec JSON...");
    if (detail.provenanceJson) {
      setThoughtDetailProvenanceJsonLink(detail, provenanceBytes);
    } else {
      clearThoughtDetailProvenanceJsonLink();
    }
    thoughtDetailProvenanceJson.textContent = formatProvenanceJson(detail.provenanceJson);
    thoughtDetailProvenanceViewerTitle.textContent = `source: ThoughtNFT.provenanceOf(${detail.tokenId})`;
    thoughtDetailViewTx.href = txUrl || "#";
    thoughtDetailViewTx.textContent = detail.txHash ? `${shortHex(detail.txHash, 22, 14)} ↗` : "-";
    thoughtDetailViewTx.title = detail.txHash;
    thoughtDetailBody.classList.remove("is-hidden");
    syncThoughtDetailEmbeddedHeights();
    void prepareThoughtDetailSpecJsonLink(detail);
  } catch {
    thoughtDetailStatus.textContent = "failed to load THOUGHT.";
  }
};

const prepareThoughtDetailSpecJsonLink = async (detail: ThoughtDetail) => {
  try {
    const spec = await loadThoughtSpecById(detail.thoughtSpec.id);
    if (currentThoughtDetail?.tokenId !== detail.tokenId) {
      return;
    }

    setThoughtDetailSpecJsonLink(spec);
  } catch {
    if (currentThoughtDetail?.tokenId === detail.tokenId) {
      clearThoughtDetailSpecJsonLink("Spec JSON unavailable.");
    }
  }
};

const openThoughtDetailSpecJson = async () => {
  if (!currentThoughtDetail) {
    return;
  }

  const pendingWindow = window.open("about:blank", "_blank");
  try {
    const spec = await loadThoughtSpecById(currentThoughtDetail.thoughtSpec.id);
    setThoughtDetailSpecJsonLink(spec);
    if (pendingWindow) {
      pendingWindow.opener = null;
      pendingWindow.location.href = thoughtDetailSpecJsonUrl;
    } else {
      window.location.href = thoughtDetailSpecJsonUrl;
    }
  } catch {
    if (pendingWindow) {
      pendingWindow.close();
    }
    showThoughtDetailStatus("spec json unavailable.");
  }
};

const getActionStatusKind = (status: string): "info" | "success" | "warn" | "error" => {
  if (status === "ready" || status === "minted") {
    return "success";
  }

  if (status === "model access needed" || status === "config needed") {
    return "warn";
  }

  if (status === "generation failed" || status === "mint unavailable") {
    return "error";
  }

  return "info";
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
  actionStatusCopy.classList.remove("is-info", "is-success", "is-warn", "is-error");
  actionStatusCopy.classList.add(`is-${getActionStatusKind(action.status)}`);
  resetThoughtButton.textContent = action.secondaryLabel;
  resetThoughtButton.classList.toggle("is-hidden", action.secondaryAction === "none");
  resetThoughtButton.setAttribute("aria-label", action.secondaryLabel.replace(/[\[\]]/g, "").trim() || "Secondary THOUGHT action");

  walletState.menuOpen = false;
  mintWalletToggle.classList.add("is-hidden");
  mintWalletMenu.classList.add("is-hidden");
  syncWalletMenu();
};

const readPx = (value: string) => Number.parseFloat(value) || 0;

const isStackedOperatorLayout = () =>
  window.matchMedia("(max-width: 900px)").matches &&
  !frontpageStage.classList.contains("is-hidden");

const getStackedOperatorAvailableHeight = () => {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const shellStyles = window.getComputedStyle(frontpageShell);
  const mainStyles = window.getComputedStyle(frontpageMain);
  const columnStyles = window.getComputedStyle(
    frontpageTitle.parentElement ?? frontpageMain,
  );
  const frameStyles = window.getComputedStyle(thoughtCanvasFrame);
  const footer = document.querySelector(".frontpage-side .color-font-footer") as HTMLElement | null;
  const shellInset = readPx(shellStyles.paddingTop) + readPx(shellStyles.paddingBottom);
  const titleHeight = frontpageTitle.getBoundingClientRect().height;
  const canvasColumnGap = readPx(columnStyles.rowGap);
  const frameInset = readPx(frameStyles.paddingTop) + readPx(frameStyles.paddingBottom);
  const mainGap = readPx(mainStyles.rowGap);
  const footerHeight = footer?.getBoundingClientRect().height ?? 0;

  return Math.floor(
    viewportHeight - shellInset - titleHeight - canvasColumnGap - frameInset - mainGap - footerHeight,
  );
};

const getViewportWidthCap = () => {
  if (isStackedOperatorLayout()) {
    return Math.max(
      MIN_CANVAS_SIZE,
      getStackedOperatorAvailableHeight() - STACKED_MIN_CLI_HEIGHT,
    );
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
    Math.min(availableWidth, getViewportWidthCap()),
  );
};

const getMinimumHeight = (displayWidth: number) => displayWidth;

const resizeCanvas = (displayWidth: number, height: number) => {
  const deviceScale = window.devicePixelRatio || 1;
  const frameStyles = window.getComputedStyle(thoughtCanvasFrame);
  const frameTopInset = readPx(frameStyles.paddingTop) + readPx(frameStyles.borderTopWidth);
  const cliHeight = isStackedOperatorLayout()
    ? Math.max(STACKED_MIN_CLI_HEIGHT, getStackedOperatorAvailableHeight() - displayWidth)
    : height + frameTopInset;

  canvas.width = Math.round(displayWidth * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${height}px`;
  document.documentElement.style.setProperty("--thought-canvas-outer-height", `${height}px`);
  document.documentElement.style.setProperty("--thought-cli-height", `${cliHeight}px`);

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

const colorForCharacter = (char: string): string => {
  if (char === " ") {
    return BACKGROUND_FILL;
  }

  const upper = char.toUpperCase();
  if (/^[A-Z]$/.test(upper)) {
    return COLOR_FONT[upper] ?? "#ffffff";
  }

  return "#778877";
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

const resizeWorkSurface = () => {
  const displayWidth = getDisplayWidth();
  const height = getMinimumHeight(displayWidth);
  resizeCanvas(displayWidth, height);
  return { displayWidth, height };
};

const hideContractSvgPreview = () => {
  thoughtSvgPreview.removeAttribute("src");
  thoughtSvgPreview.classList.add("is-hidden");
  canvas.classList.remove("is-hidden");
};

const showContractSvgPreview = (svg: string) => {
  resizeWorkSurface();
  thoughtSvgPreview.src = svgToImageUri(svg);
  thoughtSvgPreview.classList.remove("is-hidden");
  canvas.classList.add("is-hidden");
};

const syncCurrentWorkVisual = (options?: { suppressWarning?: boolean }) => {
  if (currentWorkSvg) {
    showContractSvgPreview(currentWorkSvg);
    return;
  }

  syncOutputToCanvas(currentOutputText, options);
};

const renderCanvas = (rawText: string) => {
  const previewText = canonicalThoughtTitle(rawText);
  const chars = Array.from(previewText);
  const { displayWidth, height } = resizeWorkSurface();

  context.clearRect(0, 0, displayWidth, height);
  context.fillStyle = BACKGROUND_FILL;
  context.fillRect(0, 0, displayWidth, height);

  if (!previewText) {
    return;
  }

  const images: DrawImage[] = chars.map((char) => ({
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
  const title = canonicalThoughtTitle(raw);

  hideContractSvgPreview();

  if (!options?.suppressWarning && byteLength(title) > MAX_TEXT_BYTES) {
    setWarning(`work exceeds the ${MAX_TEXT_BYTES}-byte mint limit.`, {
      flashMs: NOTICE_FLASH_MS,
      level: "warn",
    });
  } else if (options?.suppressWarning) {
    setWarning("");
  }

  renderCanvas(raw);
};

const setAgentOutput = (text: string, rawOutput: string, svg: string) => {
  resetMintRuntimeState();
  currentOutputText = text;
  currentWorkSvg = svg;
  showContractSvgPreview(svg);
  currentWorkId = recordCurrentWork(rawOutput);
  writeCurrentOutputSession();
};

const hasCurrentContractWorkSvg = () => currentWorkSvg.trim().startsWith("<svg");

const workRunContextToThoughtRunContext = (work: ThoughtWorkRecord) =>
  isThoughtRunContext(work.runContext)
    ? {
        ...work.runContext,
        returnedText: work.runContext.returnedText ?? work.returnedText,
      }
    : null;

const recordCurrentWork = (rawOutput: string) => {
  if (!currentOutputText || !currentRunContext) {
    return currentWorkId;
  }

  const existingWorks = readStoredThoughtWorks();
  const provenance = getProvenanceSummary();
  const result = appendThoughtWork(existingWorks, {
    prompt: currentRunContext.prompt,
    returnedText: rawOutput,
    text: currentOutputText,
    title: currentOutputText,
    rawOutput,
    image: currentWorkSvg ? svgToImageUri(currentWorkSvg) : galleryThumbnailUri(currentOutputText),
    svg: currentWorkSvg,
    route: currentRunContext.mode,
    provider: currentRunContext.provider,
    model: currentRunContext.model,
    thoughtSpec: currentRunContext.thoughtSpec,
    normalizer: {
      id: "thought.normalize.v1",
      source: "contract-view",
    },
    provenanceJson: provenance?.json,
    provenanceBytes: provenance?.bytes,
    hashes: {
      promptHash: hashText(currentRunContext.prompt),
      returnedTextHash: hashText(rawOutput),
      textHash: hashText(currentOutputText),
    },
    runContext: currentRunContext,
  });
  writeStoredThoughtWorks(result.works);
  return result.work.id;
};

const loadWorkRecord = (work: ThoughtWorkRecord) => {
  resetMintRuntimeState();
  currentOutputText = canonicalThoughtTitle(work.text || work.title);
  currentWorkSvg = work.svg ?? "";
  currentRunContext = workRunContextToThoughtRunContext(work);
  currentWorkId = work.id;
  runState = "output_ready";
  syncCurrentWorkVisual({ suppressWarning: true });
  writeCurrentOutputSession();
  syncInterface();
};

const isThoughtRunContext = (value: unknown): value is ThoughtRunContext => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ThoughtRunContext>;
  return (
    isMode(candidate.mode) &&
    typeof candidate.provider === "string" &&
    isThoughtRunProvider(candidate.provider) &&
    typeof candidate.model === "string" &&
    typeof candidate.prompt === "string" &&
    typeof candidate.clientGeneratedAt === "string"
  );
};

const readCurrentOutputSession = () => {
  const raw = readSharedBrowserItem(THOUGHT_OUTPUT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as { output?: unknown; svg?: unknown; runContext?: unknown; workId?: unknown };
    const output = typeof candidate.output === "string" ? canonicalThoughtTitle(candidate.output) : "";
    if (!output) {
      return null;
    }

    return {
      output,
      svg: typeof candidate.svg === "string" ? candidate.svg : "",
      runContext: isThoughtRunContext(candidate.runContext) ? candidate.runContext : null,
      workId: Number.isSafeInteger(candidate.workId) && Number(candidate.workId) > 0
        ? Number(candidate.workId)
        : null,
    };
  } catch {
    return null;
  }
};

const writeCurrentOutputSession = () => {
  if (!currentOutputText) {
    removeSharedBrowserItem(THOUGHT_OUTPUT_STORAGE_KEY);
    return;
  }

  writeSharedBrowserItem(
    THOUGHT_OUTPUT_STORAGE_KEY,
    JSON.stringify({
      output: currentOutputText,
      svg: currentWorkSvg,
      runContext: currentRunContext,
      workId: currentWorkId,
    }),
  );
};

const restoreCurrentOutputSession = () => {
  const stored = readCurrentOutputSession();
  if (!stored) {
    return;
  }

  currentOutputText = stored.output;
  currentWorkSvg = stored.svg;
  currentRunContext = stored.runContext;
  currentWorkId = stored.workId;
  runState = "output_ready";
  syncCurrentWorkVisual({ suppressWarning: true });
};

const recordThoughtRun = (
  payload: ThoughtRunPayload,
  rawOutput: string,
  thoughtTitle: string,
) => {
  const clientGeneratedAt = new Date().toISOString();
  const provenanceConfig = thoughtRunProvenanceConfig(payload);
  currentRunContext = {
    mode: payload.config.route,
    provider: payload.config.provider,
    model: payload.config.model,
    prompt: payload.input.prompt,
    returnedText: rawOutput,
    clientGeneratedAt,
    request: provenanceConfig.request,
    web: provenanceConfig.web,
    thoughtSpec: provenanceConfig.thoughtSpec,
  };

  const run = {
    route: payload.config.route,
    provider: payload.config.provider,
    model: payload.config.model,
    prompt: payload.input.prompt,
    request: provenanceConfig.request,
    web: provenanceConfig.web,
    thoughtSpec: provenanceConfig.thoughtSpec,
    returnedText: rawOutput,
    thoughtTitle,
    clientGeneratedAt,
  };

  (
    window as Window & {
      __thoughtLastRun?: typeof run;
    }
  ).__thoughtLastRun = run;

  console.info("[thought] model return", run);
};

const resetThought = (options?: { preserveStoredOutput?: boolean }) => {
  runState = "idle";
  walletConnectInFlight = false;
  pendingMyBrainRunPayload = null;
  currentOutputText = "";
  currentWorkSvg = "";
  currentRunContext = null;
  currentWorkId = null;
  if (!options?.preserveStoredOutput) {
    writeCurrentOutputSession();
  }
  resetMintRuntimeState();
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

const normalizeErrorMessage = (message: string) => message.trim().replace(/\s+/g, " ");

const readErrorString = (value: unknown) =>
  typeof value === "string" && value.trim() ? normalizeErrorMessage(value) : "";

const readNestedProviderErrorMessage = (value: unknown): string => {
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return "";
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return readNestedProviderErrorMessage(parsed) || normalizeErrorMessage(raw);
    } catch {
      return normalizeErrorMessage(raw);
    }
  }

  if (typeof value !== "object" || value === null) {
    return "";
  }

  const payload = value as {
    error?: unknown;
    message?: unknown;
    detail?: unknown;
    details?: unknown;
    metadata?: { raw?: unknown };
  };
  if (typeof payload.error === "object" && payload.error !== null) {
    const nested = readNestedProviderErrorMessage(payload.error);
    if (nested) {
      return nested;
    }
  }

  return (
    readErrorString(payload.message) ||
    readErrorString(payload.detail) ||
    readErrorString(payload.details) ||
    readNestedProviderErrorMessage(payload.metadata?.raw)
  );
};

const readErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const error = (payload as { error?: { message?: unknown; metadata?: { raw?: unknown } } }).error;
  if (error && typeof error === "object") {
    const message = readErrorString(error.message);
    const providerMessage = readNestedProviderErrorMessage(error.metadata?.raw);
    if (providerMessage && (!message || message.toLowerCase() === "provider returned error")) {
      return providerMessage;
    }

    if (message) {
      return message;
    }
  }

  const errorString = readErrorString((payload as { error?: unknown }).error);
  if (errorString) {
    return errorString;
  }

  const message = readErrorString((payload as { message?: unknown }).message);
  if (message) {
    return message;
  }

  return fallback;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) => {
  let timeout = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  }
};

const fetchPreflightRequest = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, PREFLIGHT_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (pageUnloading) {
      throw new Error("refresh stopped the request.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("preflight request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

const fetchAgentRequest = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, AGENT_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (pageUnloading) {
      throw new Error("refresh stopped the request.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("agent request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

const requestOllama = async (payload: ThoughtRunPayload) => {
  let response: Response;

  try {
    response = await fetchAgentRequest(buildOllamaApiUrl("generate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toOllamaGeneratePayload(payload)),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "refresh stopped the request." ||
        error.message === "agent request timed out.")
    ) {
      throw error;
    }
    throw new Error("ollama not detected.");
  }

  const responsePayload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, "ollama request failed."));
  }

  if (
    typeof responsePayload === "object" &&
    responsePayload !== null &&
    "response" in responsePayload &&
    typeof (responsePayload as { response?: unknown }).response === "string"
  ) {
    return ((responsePayload as { response: string }).response).trim();
  }

  return "";
};

const requestOpenAIResponses = async (apiKey: string, payload: ThoughtRunPayload) => {
  const response = await fetchAgentRequest("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(toOpenAIResponsesPayload(payload)),
  });

  const responsePayload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, "openai request failed."));
  }

  return extractResponseText(responsePayload);
};

const requestAnthropicMessages = async (apiKey: string, payload: ThoughtRunPayload) => {
  const response = await fetchAgentRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(toAnthropicMessagesPayload(payload)),
  });

  const responsePayload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, "anthropic request failed."));
  }

  if (typeof responsePayload !== "object" || responsePayload === null) {
    return "";
  }

  const content =
    (responsePayload as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
};

const requestOpenRouterChat = async (apiKey: string, payload: ThoughtRunPayload) => {
  const response = await fetchAgentRequest("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(toOpenRouterChatPayload(payload)),
  });

  const responsePayload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, "openrouter request failed."));
  }

  if (typeof responsePayload !== "object" || responsePayload === null) {
    return "";
  }

  const choices =
    (responsePayload as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? [];
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

  const response = await fetchPreflightRequest(OPENROUTER_KEY_URL, {
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
  sessionState.routeConfigured = true;
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
  modelOptionsCache.delete("openrouter");
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
  const response = await fetchPreflightRequest(OPENROUTER_MODEL_URL);
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
  const response = await fetchPreflightRequest(buildOllamaApiUrl("tags"));
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

  if (sessionState.mode === MY_BRAIN_MODE) {
    return MY_BRAIN_MODEL_SOURCE_ID;
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

  if (sessionState.mode === MY_BRAIN_MODE) {
    return MY_BRAIN_MODEL;
  }

  return sessionState.direct.model;
};

const setCurrentModelValue = (value: string) => {
  if (sessionState.mode === "connect") {
    sessionState.connect.model = value;
  } else if (sessionState.mode === "local") {
    sessionState.local.model = value;
  } else if (sessionState.mode === MY_BRAIN_MODE) {
    return;
  } else {
    sessionState.direct.model = value;
  }
};

const getDirectApiKey = (provider = sessionState.direct.provider) =>
  sessionState.direct.apiKeys[provider].trim();

const setDirectApiKey = (value: string, provider = sessionState.direct.provider) => {
  sessionState.direct.apiKeys[provider] = value.trim();
};

const clearDirectApiKey = (provider = sessionState.direct.provider) => {
  sessionState.direct.apiKeys[provider] = "";
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
  const allowManual = sourceId !== LOCAL_MODEL_SOURCE_ID && sourceId !== MY_BRAIN_MODEL_SOURCE_ID;
  const modelOptions = dedupeModelOptions(options.length ? options : STATIC_MODEL_OPTIONS[sourceId]);
  const defaultModel = defaultModelForSource(sourceId);
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
  const isConnectMode = isRouteConfigured() && sessionState.mode === "connect";
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
  const isConnectMode = isRouteConfigured() && sessionState.mode === "connect";
  const isDirectMode = isRouteConfigured() && sessionState.mode === "direct";
  const isLocalMode = isRouteConfigured() && sessionState.mode === "local";

  modeConnectButton.classList.toggle("is-active", isConnectMode);
  modeDirectButton.classList.toggle("is-active", isDirectMode);
  modeLocalButton.classList.toggle("is-active", isLocalMode);
  providerField.classList.toggle("is-hidden", !isDirectMode);
  apiKeyField.classList.toggle("is-hidden", !isDirectMode);
  localModelField.classList.toggle("is-hidden", !isLocalMode);
  localStatus.classList.toggle("is-hidden", !isLocalMode);
  localHelper.classList.add("is-hidden");
  syncConnectControls();
};

const syncDirectControls = () => {
  providerBox.value = sessionState.direct.provider;
  apiKeyLabel.textContent = "api key";
  apiKeyBox.placeholder = "session only. never stored by THOUGHT.";
  apiKeyBox.value = getDirectApiKey();
};

const syncLocalControls = () => {
  if (sessionState.local.available === true) {
    localStatus.innerHTML = `ollama detected.<br />endpoint ${getOllamaEndpoint()}.<br />runs on this machine.`;
  } else if (sessionState.local.available === false) {
    localStatus.innerHTML = `ollama not detected.<br />start ollama, then retry.<br />endpoint ${getOllamaEndpoint()}.`;
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
  if (!isRouteConfigured()) {
    disableModelControls("select route");
    return;
  }

  const sourceId = getCurrentModelSourceId();

  if (sourceId === "ollama" && sessionState.local.available === false) {
    disableModelControls("ollama not detected");
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

const syncDebugPanel = () => {
  thoughtDebug.classList.toggle("is-hidden", !IS_DEV_MODE);

  if (!IS_DEV_MODE) {
    return;
  }

  thoughtDebugPanel.classList.toggle("is-hidden", !debugState.open);
  thoughtDebugToggle.setAttribute("aria-expanded", debugState.open ? "true" : "false");
  normalizeDebugHierarchy();
  syncDebugSelect(thoughtDebugCta, DEBUG_CTA_OPTIONS, DEBUG_CTA_LABELS, debugState.cta);
  syncDebugSelect(
    thoughtDebugCtaStatus,
    getDebugStatusOptions(),
    DEBUG_CTA_STATUS_LABELS,
    debugState.ctaStatus,
  );
  syncDebugSelect(
    thoughtDebugWarning,
    getDebugWarningOptions(),
    DEBUG_WARNING_LABELS,
    debugState.warning,
  );
  thoughtDebugEnabled.checked = debugState.enabled;
  thoughtDebugCta.disabled = !debugState.enabled;
  thoughtDebugCtaStatus.disabled = !debugState.enabled;
  thoughtDebugWarning.disabled = !debugState.enabled;
};

const syncInterface = () => {
  syncModeControls();
  syncDirectControls();
  syncLocalControls();
  syncPromptField();
  syncModelControls();
  syncThoughtInstructionsControls();
  syncCtaState();
  syncMintSheet();
  syncRunAvailability();
  syncDebugPanel();
  syncWarningBox();
  syncCliPanel();
};

const loadModelOptionsForSource = async (
  sourceId: ModelSourceId,
  options?: { silent?: boolean },
) => {
  if (sourceId === "openrouter" && !sessionState.connect.apiKey.trim()) {
    modelOptionsCache.delete(sourceId);
    if (getCurrentModelSourceId() === sourceId) {
      syncInterface();
    }
    return;
  }

  if (modelOptionsLoading.has(sourceId)) {
    return;
  }

  modelOptionsLoading.add(sourceId);

  try {
    let modelOptions = STATIC_MODEL_OPTIONS[sourceId];

    if (sourceId === "openrouter") {
      modelOptions = await fetchOpenRouterModels();
    } else if (sourceId === LOCAL_MODEL_SOURCE_ID) {
      modelOptions = await fetchOllamaModels();
      sessionState.local.available = true;
    }

    modelOptionsCache.set(sourceId, modelOptions.length ? modelOptions : STATIC_MODEL_OPTIONS[sourceId]);
    writeSessionState();

    if (getCurrentModelSourceId() === sourceId) {
      syncInterface();
    }
  } catch (error) {
    if (sourceId === LOCAL_MODEL_SOURCE_ID) {
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
  isRouteConfigured()
    ? loadModelOptionsForSource(getCurrentModelSourceId(), options)
    : Promise.resolve();

const setMode = (mode: Mode) => {
  sessionState.routeConfigured = true;
  sessionState.mode = mode;
  pendingMyBrainRunPayload = null;
  resetMintRuntimeState();
  writeSessionState();
  syncInterface();

  if (mode === "local") {
    void refreshCurrentModels({ silent: true });
  } else {
    void refreshCurrentModels({ silent: true });
  }

  if (mode === "connect" && !sessionState.connect.apiKey.trim() && !isOpenRouterConnectSupported()) {
    setWarning(getOpenRouterConnectConstraintMessage(), { level: "warn" });
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

const completeThoughtRunFromModelReturn = async (
  thoughtRunPayload: ThoughtRunPayload,
  modelReturn: string,
) => {
  let preview: ContractWorkPreview;
  try {
    preview = await previewWorkViaWallet(modelReturn);
  } catch (error) {
    lastPreviewRetryContext = {
      payload: thoughtRunPayload,
      modelReturn,
    };
    throw createContractPreviewUnavailableError(error);
  }

  if (!preview.ok || !preview.svg || !preview.text) {
    lastPreviewRetryContext = null;
    const rejected = rememberRejectedRun(thoughtRunPayload, preview, modelReturn);
    throw createRejectedRunError(rejected, currentWorkId);
  }

  lastRejectedRun = null;
  lastPreviewRetryContext = null;
  recordThoughtRun(thoughtRunPayload, modelReturn, preview.text);
  setAgentOutput(preview.text, modelReturn, preview.svg);
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
  setWarning("");
};

const runAgent = async (options?: { forceGenerate?: boolean; cli?: boolean }) => {
  if (!options?.forceGenerate) {
    if (isDebugCtaOverrideActive()) {
      setStatus("debug CTA only.", { flashMs: NOTICE_FLASH_MS });
      return;
    }

    if (primaryActionState === "connect_wallet") {
      await requestWalletConnect();
      return;
    }

    if (primaryActionState === "switch_wallet") {
      await switchWalletChain();
      return;
    }

    if (primaryActionState === "mint" || primaryActionState === "retry_mint") {
      await openMintSheet();
      return;
    }

    if (primaryActionState === "none") {
      return;
    }
  }

  if (!isRouteConfigured()) {
    setWarning("config route is required.", { level: "warn" });
    setStatus("");
    return;
  }

  const prompt = sessionState.prompt.trim();
  const model = getCurrentModelValue().trim();

  if (!prompt) {
    setWarning("prompt is required.", { level: "warn" });
    setStatus("");
    return;
  }

  if (!model) {
    setWarning("model is required.", { level: "warn" });
    setStatus("");
    return;
  }

  if (!walletState.address) {
    setWarning("wallet not connected.", { level: "warn" });
    setStatus("");
    return;
  }

  if (walletState.chainId !== THOUGHT_CHAIN_ID) {
    setWarning("wallet on wrong network.", { level: "warn" });
    setStatus("");
    return;
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    setWarning("authorize openrouter first.", { level: "warn" });
    setStatus("");
    return;
  }

  if (sessionState.mode === "direct" && !getDirectApiKey()) {
    setWarning("api key is required.", { level: "warn" });
    setStatus("");
    return;
  }

  if (sessionState.mode === "local" && sessionState.local.available === false) {
    setWarning("ollama not detected.");
    setStatus("");
    return;
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    setWarning("waiting for model return. use return <text>.", { level: "warn" });
    setStatus("");
    return;
  }

  const runId = startRunSession();
  let thoughtRunPayload: ThoughtRunPayload | null = null;
  lastRunErrorCliLines = [];
  lastPreviewRetryContext = null;

  try {
    await ensureActiveThoughtSpec({ force: true });
    if (!isCurrentRunSession(runId)) {
      return;
    }
    syncThoughtInstructionsControls();
    thoughtRunPayload = buildCurrentThoughtRunPayload(prompt, model);
  } catch (error) {
    if (!isCurrentRunSession(runId)) {
      return;
    }
    const message = formatThoughtSpecError(error);
    runState = "run_failed";
    lastRunErrorCliLines = ["run failed.", message, "", "use: THOUGHT.md"];
    setWarning(message);
    setStatus("");
    syncInterface();
    return;
  }

  if (!thoughtRunPayload) {
    return;
  }

  setWarning("");
  setStatus("");
  runState = "running";
  runInFlight = true;
  syncInterface();

  try {
    let text = "";

    if (sessionState.mode === "connect") {
      text = await requestOpenRouterChat(sessionState.connect.apiKey.trim(), thoughtRunPayload);
    } else if (sessionState.mode === "direct") {
      const directProvider = sessionState.direct.provider;
      const apiKey = getDirectApiKey(directProvider);

      if (directProvider === "openai") {
        text = await requestOpenAIResponses(apiKey, thoughtRunPayload);
      } else if (directProvider === "openrouter") {
        text = await requestOpenRouterChat(apiKey, thoughtRunPayload);
      } else {
        text = await requestAnthropicMessages(apiKey, thoughtRunPayload);
      }
    } else {
      text = await requestOllama(thoughtRunPayload);
    }

    if (!isCurrentRunSession(runId)) {
      return;
    }

    if (options?.cli) {
      appendCliOutput([
        "model return received.",
        "canonicalizing via contract preview...",
        "rendering contract SVG...",
      ]);
    }

    await completeThoughtRunFromModelReturn(thoughtRunPayload, text);
  } catch (error) {
    if (!isCurrentRunSession(runId)) {
      return;
    }
    runState = "run_failed";
    const message = error instanceof Error ? error.message : "agent request failed.";
    lastRunErrorCliLines = isContractWorkPreviewError(error)
      ? error.cliLines ?? ["run failed.", message, "use: retry run"]
      : ["run failed.", message, "", "use: retry run"];
    if (!isContractWorkPreviewError(error) || error.kind !== "model-return-rejected") {
      lastRejectedRun = null;
    }
    setWarning(lastRunErrorCliLines[0] ?? message);
    setStatus("");
  } finally {
    if (isCurrentRunSession(runId)) {
      runInFlight = false;
      syncInterface();
    }
  }
};

const trimCliEntries = () => {
  if (cliEntries.length > 80) {
    cliEntries.splice(0, cliEntries.length - 80);
  }
};

const isCliEntryKind = (value: unknown): value is CliEntryKind =>
  value === "intro" || value === "command" || value === "output" || value === "error";

const readStoredCliTranscript = () => {
  const raw = readSharedBrowserItem(THOUGHT_CLI_TRANSCRIPT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry): CliEntry[] => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const candidate = entry as { kind?: unknown; lines?: unknown };
      if (!isCliEntryKind(candidate.kind) || !Array.isArray(candidate.lines)) {
        return [];
      }

      const lines = candidate.lines
        .filter((line): line is string => typeof line === "string")
        .slice(0, 48);
      if (!lines.some((line) => line.length > 0)) {
        return [];
      }

      return [{ kind: candidate.kind, lines }];
    }).slice(-80);
  } catch {
    return [];
  }
};

const writeCliTranscript = () => {
  writeSharedBrowserItem(
    THOUGHT_CLI_TRANSCRIPT_STORAGE_KEY,
    JSON.stringify(cliEntries.slice(-80)),
  );
};

const loadCliTranscript = () => {
  cliEntries.splice(0, cliEntries.length, ...readStoredCliTranscript());
};

const isCliRunningEntry = (entry: CliEntry | undefined) =>
  entry?.kind === "output" && /^running/.test(entry.lines[0] ?? "");

const markInterruptedCliRun = () => {
  const lastEntry = cliEntries[cliEntries.length - 1];
  if (!isCliRunningEntry(lastEntry)) {
    return;
  }

  appendCliError(["run interrupted.", "refresh stopped the request.", "use: retry run"]);
};

const startRunSession = () => {
  activeRunId += 1;
  return activeRunId;
};

const invalidateRunSession = () => {
  activeRunId += 1;
};

const isCurrentRunSession = (runId: number) => runId === activeRunId;

type AppendCliEntryOptions = {
  preserveSpacing?: boolean;
};

const CLI_SECTION_LABELS = new Set([
  "use:",
  "routes:",
  "flow:",
  "more:",
  "need $PATH:",
  "alternatives:",
]);

const CLI_FOLLOW_UP_PREFIXES = ["use:", "next:", "clear:", "run:", "detect:"];

const isCliFollowUpLine = (line: string) => {
  const trimmed = line.trim();
  return CLI_FOLLOW_UP_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
};

const isCliSectionLabel = (line: string) => CLI_SECTION_LABELS.has(line.trim());

const formatCliSectionLines = (lines: string[]) => {
  const formatted: string[] = [];

  for (const line of lines) {
    const previous = formatted[formatted.length - 1] ?? "";
    const needsBreak =
      previous.trim() &&
      (isCliSectionLabel(line) ||
        (isCliFollowUpLine(line) && !isCliFollowUpLine(previous) && !isCliSectionLabel(previous)));

    if (needsBreak) {
      formatted.push("");
    }

    formatted.push(line);
  }

  return formatted;
};

const normalizeCliEntryLines = (
  kind: CliEntryKind,
  lines: string | string[],
  options: AppendCliEntryOptions = {},
) => {
  const normalizedLines = Array.isArray(lines) ? lines : [lines];
  if (options.preserveSpacing || (kind !== "output" && kind !== "error")) {
    return normalizedLines;
  }

  return formatCliSectionLines(normalizedLines);
};

const appendCliEntry = (
  kind: CliEntryKind,
  lines: string | string[],
  options: AppendCliEntryOptions = {},
) => {
  const normalizedLines = normalizeCliEntryLines(kind, lines, options);
  if (!normalizedLines.some((line) => line.length > 0)) {
    return null;
  }

  const entry = { kind, lines: normalizedLines };
  cliEntries.push(entry);
  trimCliEntries();
  writeCliTranscript();
  syncCliPanel();
  return entry;
};

const displayCliCommand = (command: string) => {
  const parts = command.split(/\s+/);
  const [head = "", second = "", third = ""] = parts;
  const lowerHead = head.toLowerCase();
  const lowerSecond = second.toLowerCase();
  const lowerThird = third.toLowerCase();
  const prefix =
    lowerHead === "key"
      ? "key"
      : lowerHead === "config" && lowerSecond === "key"
        ? "config key"
        : lowerHead === "config" && lowerSecond === "direct" && lowerThird === "key"
          ? "config direct key"
          : "";

  if (!prefix) {
    return command;
  }

  const rest = command.slice(prefix.length).trim();
  if (!rest || rest.toLowerCase() === "clear" || rest.toLowerCase() === "help") {
    return command;
  }

  return `${prefix} ********`;
};

const isMyBrainShellActive = () =>
  sessionState.mode === MY_BRAIN_MODE && runState === "running" && pendingMyBrainRunPayload !== null;

const currentCliShellPrompt = () => (isMyBrainShellActive() ? "my-brain>" : "thought>");

const shouldRecordCliCommand = (command: string) => {
  const parts = command.split(/\s+/);
  const [head = "", second = "", third = ""] = parts;
  const lowerHead = head.toLowerCase();
  const lowerSecond = second.toLowerCase();
  const lowerThird = third.toLowerCase();
  const prefix =
    lowerHead === "key"
      ? "key"
      : lowerHead === "config" && lowerSecond === "key"
        ? "config key"
        : lowerHead === "config" && lowerSecond === "direct" && lowerThird === "key"
          ? "config direct key"
          : "";

  if (!prefix) {
    return true;
  }

  const rest = command.slice(prefix.length).trim().toLowerCase();
  return !rest || rest === "clear" || rest === "help";
};

const readStoredCliCommandHistory = () => {
  const raw = readSharedBrowserItem(THOUGHT_CLI_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && shouldRecordCliCommand(entry))
      .slice(-CLI_COMMAND_HISTORY_LIMIT);
  } catch {
    return [];
  }
};

const writeCliCommandHistory = () => {
  writeSharedBrowserItem(
    THOUGHT_CLI_HISTORY_STORAGE_KEY,
    JSON.stringify(cliCommandHistory.slice(-CLI_COMMAND_HISTORY_LIMIT)),
  );
};

const loadCliCommandHistory = () => {
  cliCommandHistory.splice(0, cliCommandHistory.length, ...readStoredCliCommandHistory());
};

const resetCliHistoryCursor = () => {
  cliHistoryIndex = null;
  cliHistoryDraft = "";
};

const resetCliCompletionCursor = () => {
  cliCompletionPrefix = "";
  cliCompletionMatches = [];
  cliCompletionIndex = null;
};

const resetCliInputNavigation = () => {
  resetCliHistoryCursor();
  resetCliCompletionCursor();
};

const recordCliCommandHistory = (command: string) => {
  if (!shouldRecordCliCommand(command)) {
    resetCliInputNavigation();
    return;
  }

  const previous = cliCommandHistory[cliCommandHistory.length - 1];
  if (previous !== command) {
    cliCommandHistory.push(command);
  }

  if (cliCommandHistory.length > CLI_COMMAND_HISTORY_LIMIT) {
    cliCommandHistory.splice(0, cliCommandHistory.length - CLI_COMMAND_HISTORY_LIMIT);
  }
  writeCliCommandHistory();
  resetCliInputNavigation();
};

const setCliInputCommand = (command: string) => {
  thoughtCliInput.value = command;
  requestAnimationFrame(() => {
    thoughtCliInput.setSelectionRange(command.length, command.length);
  });
};

const normalizeCliCompletionPrefix = (value: string) =>
  value.trimStart().replace(/\s+/g, " ").toLowerCase();

const cliCompletionCommandCatalog = () => {
  const commands = [
    "config",
    "config route local",
    "config route connect",
    "config route direct",
    "config route my-brain",
    "config local",
    "config local detect",
    "config local endpoint ",
    "config local model list",
    "config local model ",
    "config connect",
    "config connect authorize",
    "config connect disconnect",
    "config connect model list",
    "config connect model ",
    "config direct",
    "config direct provider list",
    "config direct provider ",
    ...directProviderIds().map((providerId) => `config direct provider ${providerId}`),
    "config direct key ",
    "config direct key clear",
    "config direct model list",
    "config direct model ",
    "config my-brain",
    "prompt ",
    "prompt clear",
    "spec",
    "spec text",
    "THOUGHT.md",
    "THOUGHT.md text",
    "color-font",
    "color-font raw",
    "run",
    "rerun",
    "retry run",
    "preview retry",
    "work",
    "work current",
    "work list",
    "work clear",
    "work previous",
    "work next",
    "work latest",
    "works clear",
    "thought",
    "thought list",
    "mint",
    "path",
    "path list",
    "path ",
    "authorize",
    "confirm",
    "wallet",
    "wallet connect",
    "wallet disconnect",
    "mint-path",
    "current",
    "provenance",
    "provenance --json",
    "gallery",
    "view tx",
    "view THOUGHT ",
    "clear",
    "reset",
    "help",
    "commands",
  ];

  if (isMyBrainShellActive()) {
    commands.push("return ", "cancel");
  }

  return Array.from(new Set(commands));
};

const cliCompletionMatchesFor = (prefix: string) =>
  cliCompletionCommandCatalog().filter((command) =>
    normalizeCliCompletionPrefix(command).startsWith(prefix),
  );

const showCliCompletion = (direction: "previous" | "next") => {
  const inputPrefix = normalizeCliCompletionPrefix(thoughtCliInput.value);
  const selectedCompletion =
    cliCompletionIndex === null ? "" : cliCompletionMatches[cliCompletionIndex] ?? "";
  const isCyclingCompletion =
    !!selectedCompletion &&
    normalizeCliCompletionPrefix(selectedCompletion) === inputPrefix;
  const prefix = isCyclingCompletion ? cliCompletionPrefix : inputPrefix;
  if (!prefix) {
    return false;
  }

  if (!isCyclingCompletion && (prefix !== cliCompletionPrefix || cliCompletionIndex === null)) {
    cliCompletionPrefix = prefix;
    cliCompletionMatches = cliCompletionMatchesFor(prefix);
    cliCompletionIndex = null;
  }

  if (!cliCompletionMatches.length) {
    return true;
  }

  if (cliCompletionIndex === null) {
    cliCompletionIndex = direction === "next" ? 0 : cliCompletionMatches.length - 1;
  } else if (direction === "next") {
    cliCompletionIndex = (cliCompletionIndex + 1) % cliCompletionMatches.length;
  } else {
    cliCompletionIndex =
      (cliCompletionIndex - 1 + cliCompletionMatches.length) % cliCompletionMatches.length;
  }

  setCliInputCommand(cliCompletionMatches[cliCompletionIndex]);
  resetCliHistoryCursor();
  return true;
};

const showPreviousCliCommand = () => {
  if (!cliCommandHistory.length) {
    return;
  }

  if (cliHistoryIndex === null) {
    cliHistoryDraft = thoughtCliInput.value;
    cliHistoryIndex = cliCommandHistory.length - 1;
  } else {
    cliHistoryIndex = Math.max(0, cliHistoryIndex - 1);
  }

  setCliInputCommand(cliCommandHistory[cliHistoryIndex]);
};

const showNextCliCommand = () => {
  if (cliHistoryIndex === null) {
    return;
  }

  if (cliHistoryIndex < cliCommandHistory.length - 1) {
    cliHistoryIndex += 1;
    setCliInputCommand(cliCommandHistory[cliHistoryIndex]);
    return;
  }

  setCliInputCommand(cliHistoryDraft);
  resetCliHistoryCursor();
};

const navigateCliInput = (direction: "previous" | "next") => {
  if (cliHistoryIndex !== null) {
    resetCliCompletionCursor();
    if (direction === "previous") {
      showPreviousCliCommand();
    } else {
      showNextCliCommand();
    }
    return;
  }

  if (thoughtCliInput.value.trim()) {
    showCliCompletion(direction);
    return;
  }

  resetCliCompletionCursor();
  if (direction === "previous") {
    showPreviousCliCommand();
  } else {
    showNextCliCommand();
  }
};

const appendCliCommand = (command: string) => {
  const displayCommand = displayCliCommand(command);
  const shellPrompt = currentCliShellPrompt();
  return appendCliEntry(
    "command",
    shellPrompt === "my-brain>" ? `${shellPrompt} ${displayCommand}` : displayCommand,
  );
};

const appendCliOutput = (lines: string | string[], options?: AppendCliEntryOptions) => {
  return appendCliEntry("output", lines, options);
};

const appendCliError = (lines: string | string[], options?: AppendCliEntryOptions) => {
  return appendCliEntry("error", lines, options);
};

let cliScrollHideTimer = 0;
let cliScrollFrame = 0;

const hasRunningProgressLine = (lines: string[]) =>
  /^running\.{1,3}$/.test(lines[0] ?? "");

const animateRunningProgressLine = (line: string, index: number) => {
  if (index !== 0 || !/^running\.{1,3}$/.test(line)) {
    return line;
  }

  const dots = ".".repeat((cliProgressTick % 3) + 1);
  return line.replace(/\.{1,3}$/, dots);
};

const stopCliProgress = () => {
  if (cliProgressTimer) {
    window.clearInterval(cliProgressTimer);
    cliProgressTimer = 0;
  }
  cliProgressEntry = null;
  cliProgressBaseLines = [];
};

const updateCliProgress = () => {
  if (!cliProgressEntry) {
    return;
  }

  cliProgressTick += 1;
  cliProgressEntry.lines = cliProgressBaseLines.map(animateRunningProgressLine);
  writeCliTranscript();
  syncCliPanel();
};

const startCliProgress = (entry: CliEntry | null) => {
  stopCliProgress();
  if (!entry || !hasRunningProgressLine(entry.lines)) {
    return;
  }

  cliProgressEntry = entry;
  cliProgressBaseLines = [...entry.lines];
  cliProgressTick = 2;
  cliProgressTimer = window.setInterval(updateCliProgress, 600);
};

const appendCliProgressOutput = (lines: string | string[]) => {
  const entry = appendCliOutput(lines);
  startCliProgress(entry);
  return entry;
};

const startCliRunProgress = () => {
  appendCliProgressOutput([
    "running...",
    "one model round.",
    "prompt + THOUGHT.md in.",
    "contract SVG out.",
  ]);
};

const revealCliScrollbar = () => {
  window.clearTimeout(cliScrollHideTimer);
  thoughtCliTranscript.classList.add("is-scrolling");
  cliScrollHideTimer = window.setTimeout(() => {
    thoughtCliTranscript.classList.remove("is-scrolling");
  }, 800);
};

const scrollCliTranscriptToBottom = () => {
  thoughtCliTranscript.scrollTop = thoughtCliTranscript.scrollHeight;
};

const scheduleCliTranscriptScrollToBottom = () => {
  window.cancelAnimationFrame(cliScrollFrame);
  revealCliScrollbar();
  scrollCliTranscriptToBottom();
  cliScrollFrame = window.requestAnimationFrame(() => {
    scrollCliTranscriptToBottom();
    cliScrollFrame = window.requestAnimationFrame(() => {
      scrollCliTranscriptToBottom();
      cliScrollFrame = 0;
    });
  });
};

const renderCliTranscript = () => {
  const nodes = cliEntries.map((entry) => {
    const block = document.createElement("div");
    block.className = `thought-cli-entry thought-cli-entry--${entry.kind}`;
    entry.lines.forEach((line, index) => {
      const row = document.createElement("div");
      const hasShellPrefix = line.startsWith("> ") || line.startsWith("my-brain> ");
      const displayLine = entry.kind === "command" && index === 0 && !hasShellPrefix ? `> ${line}` : line;
      row.textContent = displayLine || " ";
      block.append(row);
    });
    return block;
  });

  thoughtCliTranscript.replaceChildren(...nodes);
};

const getProvenanceSummary = () => {
  if (!currentOutputText) {
    return null;
  }

  try {
    const provenanceJson = buildProvenanceJson(hashText(currentOutputText));
    return {
      bytes: byteLength(provenanceJson),
      json: provenanceJson,
    };
  } catch {
    return null;
  }
};

const getCliSuggestions = (): CliSuggestion[] => {
  if (isMyBrainShellActive()) {
    return [
      { label: "return <text>", command: "return " },
      { label: "cancel", command: "cancel" },
      { label: "current", command: "current" },
      { label: "help", command: "help" },
    ];
  }

  if (cliCommandInFlight) {
    return [
      { label: "current", command: "current" },
      { label: "help", command: "help" },
    ];
  }

  if (cliSuggestionContext === "help") {
    return [
      { label: "config", command: "config" },
      { label: "prompt <text>", command: "prompt " },
      { label: "run", command: "run" },
      { label: "current", command: "current" },
    ];
  }

  if (cliSuggestionContext === "config") {
    if (!isRouteConfigured()) {
      return [
        { label: "config route local", command: "config route local" },
        { label: "config route connect", command: "config route connect" },
        { label: "config route direct", command: "config route direct" },
        { label: "config route my-brain", command: "config route my-brain" },
      ];
    }

    if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
      return [
        { label: "config connect authorize", command: "config connect authorize" },
        { label: "config connect model list", command: "config connect model list" },
        { label: "current", command: "current" },
      ];
    }

    if (sessionState.mode === "connect" && sessionState.connect.apiKey.trim()) {
      return [
        { label: "run", command: "run" },
        { label: "config connect disconnect", command: "config connect disconnect" },
        { label: "config connect model list", command: "config connect model list" },
      ];
    }

    if (sessionState.mode === "direct" && !getDirectApiKey()) {
      return [
        { label: "config direct provider list", command: "config direct provider list" },
        { label: `config direct provider ${sessionState.direct.provider}`, command: `config direct provider ${sessionState.direct.provider}` },
        { label: "config direct key <api-key>", command: "config direct key " },
        { label: "current", command: "current" },
      ];
    }

    if (sessionState.mode === "local") {
      return sessionState.local.available === true
        ? [
            { label: "config local model list", command: "config local model list" },
            { label: "prompt <text>", command: "prompt " },
            { label: "run", command: "run" },
          ]
        : [
            { label: "config local detect", command: "config local detect" },
            { label: "config local endpoint", command: "config local endpoint " },
            { label: "config connect", command: "config connect" },
          ];
    }

    if (sessionState.mode === MY_BRAIN_MODE) {
      return [
        { label: "prompt <text>", command: "prompt " },
        { label: "run", command: "run" },
      ];
    }

    return [
      { label: "prompt <text>", command: "prompt " },
      { label: "run", command: "run" },
      { label: `config ${sessionState.mode} model list`, command: `config ${sessionState.mode} model list` },
    ];
  }

  if (mintFlowState === "wallet_required") {
    return [
      { label: "wallet connect", command: "wallet connect" },
      { label: "mint-path", command: "mint-path" },
      { label: "help mint", command: "help mint" },
    ];
  }

  if (mintFlowState === "path_required" || isPathRecoveryError()) {
    return [
      { label: "path list", command: "path list" },
      { label: "path <id>", command: "path " },
      { label: "mint-path", command: "mint-path" },
      { label: "current", command: "current" },
    ];
  }

  if (mintFlowState === "path_ready" || mintFlowState === "authorizing") {
    return [
      { label: "authorize", command: "authorize" },
      { label: "path list", command: "path list" },
      { label: "path <id>", command: "path " },
      { label: "current", command: "current" },
    ];
  }

  if (mintFlowState === "authorized" || mintFlowState === "minting") {
    return [
      { label: "confirm", command: "confirm" },
      { label: "current", command: "current" },
    ];
  }

  if (mintFlowState === "minted") {
    const tokenId = walletState.mintedTokenId ?? mintFlowData.existingTokenId;
    return [
      { label: "view tx", command: "view tx" },
      {
        label: tokenId ? `view THOUGHT #${tokenId}` : "view THOUGHT <id>",
        command: tokenId ? `view THOUGHT ${tokenId}` : "view THOUGHT ",
      },
      { label: "gallery", command: "gallery" },
    ];
  }

  if (runState === "output_ready") {
    return [
      { label: "mint", command: "mint" },
      { label: "rerun", command: "rerun" },
      { label: "provenance", command: "provenance" },
      { label: "work list", command: "work list" },
    ];
  }

  if (runState === "run_failed") {
    if (lastRejectedRun) {
      return [
        { label: "prompt <text>", command: "prompt " },
        { label: "config", command: "config" },
        { label: "config my-brain", command: "config my-brain" },
        { label: "current", command: "current" },
      ];
    }

    return [
      lastPreviewRetryContext
        ? { label: "preview retry", command: "preview retry" }
        : { label: "retry run", command: "retry run" },
      { label: "current", command: "current" },
      { label: "help", command: "help" },
    ];
  }

  if (!sessionState.prompt.trim()) {
    return [
      { label: "config", command: "config" },
      { label: "prompt <text>", command: "prompt " },
      { label: "run", command: "run" },
      { label: "mint", command: "mint" },
    ];
  }

  if (!isRouteConfigured()) {
    return [
      { label: "config route local", command: "config route local" },
      { label: "config route connect", command: "config route connect" },
      { label: "config route direct", command: "config route direct" },
      { label: "current", command: "current" },
    ];
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    return [
      { label: "config connect authorize", command: "config connect authorize" },
      { label: "config connect model list", command: "config connect model list" },
      { label: "current", command: "current" },
    ];
  }

  if (sessionState.mode === "direct" && !getDirectApiKey()) {
    return [
      { label: "config direct provider list", command: "config direct provider list" },
      { label: `config direct provider ${sessionState.direct.provider}`, command: `config direct provider ${sessionState.direct.provider}` },
      { label: "config direct key <api-key>", command: "config direct key " },
      { label: "current", command: "current" },
    ];
  }

  if (sessionState.mode === "local" && sessionState.local.available !== true) {
    return [
      { label: "config local detect", command: "config local detect" },
      { label: "config local endpoint", command: "config local endpoint " },
      { label: "config connect", command: "config connect" },
    ];
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    return [
      { label: "run", command: "run" },
      { label: "current", command: "current" },
      { label: "help", command: "help" },
    ];
  }

  return [
    { label: "run", command: "run" },
    { label: `config ${sessionState.mode} model list`, command: `config ${sessionState.mode} model list` },
    { label: "current", command: "current" },
    { label: "help", command: "help" },
  ];
};

const renderCliSuggestions = () => {
  const label = document.createElement("span");
  label.className = "thought-cli__suggestion-label";
  label.textContent = "next:";

  const buttons = getCliSuggestions().map((suggestion) => {
    const button = document.createElement("button");
    button.className = "thought-cli__suggestion";
    button.type = "button";
    button.textContent = `[ ${suggestion.label} ]`;
    button.title = suggestion.command;
    button.addEventListener("click", () => {
      if (suggestion.command.endsWith(" ")) {
        thoughtCliInput.value = suggestion.command;
        thoughtCliInput.focus();
        return;
      }
      void executeCliCommand(suggestion.command);
    });
    return button;
  });

  thoughtCliSuggestions.replaceChildren(label, ...buttons);
};

function syncCliPanel() {
  renderCliTranscript();
  renderCliSuggestions();
  if (thoughtCliInput) {
    thoughtCliInput.disabled = cliCommandInFlight;
  }
  thoughtCliPrompt!.textContent = currentCliShellPrompt();
  scheduleCliTranscriptScrollToBottom();
}

const initializeCliTranscript = () => {
  if (cliEntries.length) {
    return;
  }

  const intro = [
    "THOUGHT operator.",
    "",
    "one model round.",
    "prompt + THOUGHT.md in.",
    "contract SVG out.",
    "",
    "quick start:",
    "config",
    "prompt <text>",
    "run",
    "mint",
  ];

  appendCliEntry("intro", intro);
};

const focusCliInput = () => {
  if (document.activeElement === thoughtCliInput || thoughtCliInput.disabled) {
    return;
  }

  requestAnimationFrame(() => {
    thoughtCliInput.focus();
  });
};

const shouldRefocusCliFromClick = (target: EventTarget | null) => {
  if (frontpageStage.classList.contains("is-hidden") || !(target instanceof HTMLElement)) {
    return false;
  }

  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().trim()) {
    return false;
  }

  if (target.closest(".thought-cli__transcript")) {
    return false;
  }

  const editableTarget = target.closest("input, textarea, select, [contenteditable='true']");
  return !editableTarget || editableTarget === thoughtCliInput;
};

const shouldRefocusCliFromKeyboard = (event: KeyboardEvent) => {
  if (
    frontpageStage.classList.contains("is-hidden") ||
    thoughtCliInput.disabled ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return false;
  }

  if (document.activeElement === thoughtCliInput) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLElement) {
    const editableTarget = target.closest("input, textarea, select, [contenteditable='true']");
    if (editableTarget && editableTarget !== thoughtCliInput) {
      return false;
    }
  }

  if (mintFlowUiMode === "sheet" && mintFlowState !== "closed") {
    return false;
  }

  return event.key.length === 1 || event.key === "Backspace" || event.key === "ArrowUp" || event.key === "ArrowDown";
};

const focusCliInputFromKeyboard = (event: KeyboardEvent) => {
  thoughtCliInput.focus();

  if (event.key.length === 1) {
    event.preventDefault();
    setCliInputCommand(`${thoughtCliInput.value}${event.key}`);
    resetCliInputNavigation();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    setCliInputCommand(thoughtCliInput.value.slice(0, -1));
    resetCliInputNavigation();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    navigateCliInput("previous");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    navigateCliInput("next");
  }
};

const currentSpecLabel = () => activeThoughtSpec?.ref || getActiveThoughtInstructionsLabel();

const cliRouteLabel = (mode: Mode) => mode;

const currentRouteLabel = () => isRouteConfigured() ? cliRouteLabel(sessionState.mode) : "empty";

const configModelCommandPrefix = (mode?: Mode) =>
  mode || isRouteConfigured() ? `config ${mode ?? sessionState.mode} model` : "config <route> model";

const routeProviderLabel = (mode: Mode = sessionState.mode) => {
  if (!isRouteConfigured() && mode === sessionState.mode) {
    return "empty";
  }

  if (mode === "direct") {
    return sessionState.direct.provider;
  }

  return ROUTE_COPY[mode].provider;
};

const routeModelLabel = (mode: Mode = sessionState.mode) =>
  !isRouteConfigured() && mode === sessionState.mode
    ? "empty"
    : mode === MY_BRAIN_MODE ? MY_BRAIN_MODEL : getCurrentModelValue().trim() || "empty";

const routeTableLines = () =>
  (["local", "connect", "direct", MY_BRAIN_MODE] as Mode[]).map(
    (route) => `${route.padEnd(9)} ${ROUTE_COPY[route].brief}`,
  );

const routeUseLines = (mode: Mode = sessionState.mode) =>
  !isRouteConfigured() && mode === sessionState.mode
    ? ["config route <local|connect|direct|my-brain>"]
    : ROUTE_COPY[mode].useLines;

const routeStateLabel = (mode: Mode = sessionState.mode) => {
  if (!isRouteConfigured() && mode === sessionState.mode) {
    return "route not selected";
  }

  if (mode === "local") {
    return `ollama ${cliLocalStatus()}`;
  }

  if (mode === "connect") {
    return `openrouter ${cliAuthorizationState()}`;
  }

  if (mode === "direct") {
    return `api key ${cliApiKeyState()}`;
  }

  return runState === "running" && pendingMyBrainRunPayload ? "waiting for return" : "ready";
};

const routeCommonLines = (mode: Mode = sessionState.mode) => [
  `route: ${mode}`,
  `provider: ${routeProviderLabel(mode)}`,
  `model: ${routeModelLabel(mode)}`,
  ROUTE_COPY[mode].brief,
  `state: ${routeStateLabel(mode)}`,
];

const directProviderIds = () => Object.keys(DIRECT_PROVIDERS) as DirectProviderId[];

const directProviderListLines = () => [
  "providers:",
  ...directProviderIds(),
  "",
  "use: config direct provider <id>",
];

const cliAuthorizationState = () =>
  sessionState.connect.apiKey.trim() ? "linked" : "not linked";

const cliApiKeyState = () =>
  getDirectApiKey() ? "set" : "not set";

const cliLocalStatus = () => {
  if (sessionState.local.available === true) {
    return "detected";
  }
  if (sessionState.local.available === false) {
    return "not detected";
  }
  return "checking";
};

const localSetupUsageLines = () => [
  `endpoint: ${getOllamaEndpoint()}`,
  "first: start ollama on this machine.",
  "use:",
  "config local detect",
  "config local endpoint <url>",
  "config local model list",
  "config local model <id>",
  "",
  "or use another route:",
  "config connect",
  "config direct",
  "config my-brain",
];

const formatCliAddress = (address: string) => shortHex(address, 6, 4);

const cliSpecStatus = () => {
  if (!activeThoughtSpec) {
    return {
      state: "missing",
      hint: "run blocked",
      ref: "n/a",
      hash: "n/a",
      shortHash: "n/a",
    };
  }

  return {
    state: "ready",
    hint: `spec ${activeThoughtSpec.ref}`,
    ref: activeThoughtSpec.ref,
    hash: activeThoughtSpec.specHash,
    shortHash: shortHex(activeThoughtSpec.specHash, 10, 8),
  };
};

const cliOutputStatus = () => {
  if (mintFlowState === "minted") {
    return {
      state: "minted",
      hint: viewThoughtUseLine(walletState.mintedTokenId ?? mintFlowData.existingTokenId),
    };
  }

  if (runState === "output_ready") {
    return {
      state: "ready",
      hint: "use: mint",
    };
  }

  if (runState === "running") {
    return {
      state: "running",
      hint: "",
    };
  }

  if (runState === "run_failed") {
    return {
      state: "failed",
      hint: "",
    };
  }

  return {
    state: "empty",
    hint: "",
  };
};

const cliCurrentMintState = () => {
  if (mintFlowState === "closed") {
    return runState === "output_ready" ? "ready" : "idle";
  }
  if (mintFlowState === "wallet_required") {
    return "needs wallet";
  }
  if (mintFlowState === "path_required" || mintFlowState === "path_checking") {
    return "needs $PATH";
  }
  if (mintFlowState === "path_ready" || mintFlowState === "authorizing") {
    return "needs authorization";
  }
  if (mintFlowState === "authorized") {
    return "authorized";
  }
  if (mintFlowState === "minting") {
    return "confirming";
  }
  if (mintFlowState === "minted") {
    return "minted";
  }
  if (mintFlowState === "text_taken") {
    return "already minted";
  }
  if (mintFlowState === "error") {
    return "failed";
  }
  return "idle";
};

const cliPromptValue = () => {
  const prompt = sessionState.prompt.trim();
  return prompt ? quoteCliText(prompt) : "empty";
};

const cliPathState = () => {
  const path = mintFlowData.pathId?.toString() ?? mintFlowData.pathIdInput.trim();
  if (!path) {
    return "not selected";
  }

  if (mintFlowState === "minted" || mintFlowData.errorKind === "path_consumed") {
    return `#${path} consumed`;
  }
  if (mintFlowState === "authorized" || mintFlowState === "minting") {
    return `#${path} authorized`;
  }
  if (mintFlowState === "path_ready" || mintFlowState === "authorizing") {
    return `#${path} selected`;
  }

  return `#${path}`;
};

const cliCurrentWorkState = () => {
  if (currentWorkId === null) {
    return "empty";
  }

  const work = getWorkById(readStoredThoughtWorks(), currentWorkId);
  if (!work) {
    return `#${currentWorkId}`;
  }

  return `#${work.id} "${formatModelLabel(work.text || work.title, 48)}"`;
};

const myBrainWaitingLines = () => [
  "my-brain is waiting for return.",
  "use: return <text>",
  "use: cancel",
];

const buildCliCurrentLines = () => {
  const provenance = getProvenanceSummary();
  const output = cliOutputStatus();
  const spec = cliSpecStatus();
  const tokenId = walletState.mintedTokenId ?? mintFlowData.existingTokenId;

  const lines = [`route: ${currentRouteLabel()}`];

  if (!isRouteConfigured()) {
    lines.push("provider: empty");
  }
  if (isRouteConfigured() && sessionState.mode === "connect") {
    lines.push("provider: openrouter");
    lines.push(`openrouter ${cliAuthorizationState()}`);
  }
  if (isRouteConfigured() && sessionState.mode === "direct") {
    lines.push(`provider: ${sessionState.direct.provider}`);
    lines.push(`api key: ${cliApiKeyState()}`);
  }
  if (isRouteConfigured() && sessionState.mode === "local") {
    lines.push("provider: ollama", `ollama: ${cliLocalStatus()}`, `endpoint: ${getOllamaEndpoint()}`);
  }
  if (isRouteConfigured() && sessionState.mode === MY_BRAIN_MODE) {
    lines.push(`provider: ${MY_BRAIN_PROVIDER}`);
  }

  lines.push(`model: ${isRouteConfigured() ? getCurrentModelValue().trim() || "empty" : "empty"}`, `prompt: ${cliPromptValue()}`, `THOUGHT.md: ${spec.state}`);

  if (isMyBrainShellActive()) {
    lines.push("work: waiting for model return", "mint: idle", "", "use: return <text>", "use: cancel");
    return lines;
  }

  lines.push(
    `wallet: ${walletState.address ? `connected ${formatCliAddress(walletState.address)}` : "not connected"}`,
    `work: ${cliCurrentWorkState()}`,
    `preview: ${hasCurrentContractWorkSvg() ? "contract SVG" : "missing"}`,
    `provenance: ${provenance ? `${provenance.bytes} bytes` : "empty"}`,
  );

  if (output.state !== "empty" || mintFlowState !== "closed") {
    lines.push(`$PATH: ${cliPathState()}`, `mint: ${cliCurrentMintState()}`);
  }
  lines.push(`THOUGHT: ${tokenId !== null ? `#${tokenId}` : "empty"}`);
  lines.push(`tx: ${walletState.txHash ? shortHex(walletState.txHash, 10, 8) : "empty"}`);

  if (lastRejectedRun) {
    lines.push(
      "",
      "last run: rejected",
      `reason: ${lastRejectedRun.reasonLabel}`,
    );
    if (lastRejectedRun.reasonCode === 3) {
      lines.push(`canonical text: ${lastRejectedRun.normalizedLength ?? 0} / ${MAX_TEXT_BYTES} characters`);
    }
    lines.push(currentWorkId ? "current work unchanged." : "work: none");
  }

  return lines;
};

const listModelsForCli = () => {
  if (!isRouteConfigured()) {
    return [
      "model list unavailable.",
      ...routeRequiredLines(),
    ];
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    return [
      "model fixed.",
      "model: my-brain",
      "use: config my-brain",
    ];
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    return [
      "model list unavailable.",
      "openrouter not linked",
      "use: config connect authorize",
    ];
  }

  const options = getModelOptions(getCurrentModelSourceId());
  if (!options.length) {
    return ["model list unavailable."];
  }

  return [
    "models:",
    ...options.map((option) => option.id),
    "",
    `use: ${configModelCommandPrefix()} <id>`,
  ];
};

const setCliModel = (modelId: string) => {
  if (!isRouteConfigured()) {
    appendCliError(["model unavailable.", ...routeRequiredLines()]);
    return;
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    appendCliOutput(listModelsForCli());
    return;
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    appendCliError(["model unavailable.", "openrouter not linked", "use: config connect authorize"]);
    return;
  }

  const options = getModelOptions(getCurrentModelSourceId());
  if (!modelId || modelId.toLowerCase() === "help") {
    appendCliOutput([
      `model: ${getCurrentModelValue().trim() || "empty"}`,
      `route: ${sessionState.mode}`,
      `use: ${configModelCommandPrefix()} list`,
      `use: ${configModelCommandPrefix()} <id>`,
    ]);
    return;
  }

  if (!options.some((option) => option.id === modelId)) {
    appendCliError(["model not found.", `use: ${configModelCommandPrefix()} list`]);
    return;
  }

  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  setCurrentModelValue(modelId);
  writeSessionState();
  syncInterface();
  appendCliOutput(["model set.", `model: ${modelId}`, "next: run"]);
};

const setCliProvider = (providerId: string) => {
  const normalizedProviderId = providerId.trim().toLowerCase();

  if (normalizedProviderId === "list") {
    appendCliOutput(directProviderListLines());
    return;
  }

  if (!normalizedProviderId || normalizedProviderId === "help") {
    const lines = [
      "provider selects the direct API provider.",
      "",
      `provider: ${sessionState.direct.provider}`,
      "route: direct",
      "",
      ...directProviderListLines(),
    ];
    if (sessionState.mode !== "direct") {
      lines.push("note: provider is used by config direct.");
    }
    appendCliOutput(lines);
    return;
  }

  if (!isDirectProviderId(normalizedProviderId)) {
    appendCliError(["provider not found.", "use: config direct provider list"]);
    return;
  }

  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  sessionState.mode = "direct";
  sessionState.routeConfigured = true;
  sessionState.direct.provider = normalizedProviderId;
  sessionState.direct.model = DIRECT_PROVIDERS[normalizedProviderId].defaultModel;
  writeSessionState();
  syncInterface();
  void refreshCurrentModels({ silent: true });
  appendCliOutput([
    "provider set.",
    `provider: ${normalizedProviderId}`,
    `api key: ${cliApiKeyState()}`,
    "route: direct",
    getDirectApiKey() ? "use: run" : "use: config direct key <api-key>",
    "use: config direct model list",
  ]);
};

const setCliApiKey = (keyInput: string) => {
  const key = keyInput.trim();
  if (!key || key.toLowerCase() === "help") {
    const lines = [
      `api key: ${cliApiKeyState()}`,
      "policy: session only. per provider.",
      "use: config direct key <api-key>",
    ];
    if (getDirectApiKey()) {
      lines.push("clear: config direct key clear");
    }
    appendCliOutput(lines);
    return;
  }

  if (key.toLowerCase() === "clear") {
    resetMintRuntimeState();
    pendingMyBrainRunPayload = null;
    clearDirectApiKey();
    writeSessionState();
    syncInterface();
    appendCliOutput(["api key cleared.", "use: config direct key <api-key>"]);
    return;
  }

  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  sessionState.mode = "direct";
  sessionState.routeConfigured = true;
  setDirectApiKey(key);
  writeSessionState();
  syncInterface();
  appendCliOutput(["api key set.", `provider: ${sessionState.direct.provider}`, "policy: session only. per provider.", "use: run"]);
};

const setCliPrompt = (promptInput: string) => {
  const prompt = promptInput.trim();
  if (!prompt || prompt.toLowerCase() === "help") {
    appendCliOutput([
      `prompt: ${cliPromptValue()}`,
      "use: prompt <text>",
      "clear: prompt clear",
    ]);
    return;
  }

  if (prompt.toLowerCase() === "clear") {
    resetMintRuntimeState();
    pendingMyBrainRunPayload = null;
    sessionState.prompt = "";
    writeSessionState();
    syncInterface();
    appendCliOutput(["prompt: empty", "next: prompt <text>"]);
    return;
  }

  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  sessionState.prompt = promptInput.trim();
  writeSessionState();
  syncInterface();
  appendCliOutput([`prompt: ${cliPromptValue()}`, "next: run"]);
};

const outputCliMode = async (mode: Mode | "") => {
  if (!mode) {
    appendCliOutput(["use: config route <local|connect|direct|my-brain>"]);
    return;
  }

  setMode(mode);
  await refreshCurrentModels({ silent: true });
  const lines = mode === MY_BRAIN_MODE
    ? [
        "route: my-brain",
        "provider: me",
        "model: my-brain",
        MY_BRAIN_DESCRIPTION,
      ]
    : [...routeCommonLines(mode)];

  if (mode === "local") {
    if (sessionState.local.available === true) {
      lines.push(`endpoint: ${getOllamaEndpoint()}`, "", "use:", ...routeUseLines(mode));
    } else {
      lines.push("");
      lines.push(...localSetupUsageLines());
    }
  } else if (mode === "connect") {
    lines.push("", "use:", ...routeUseLines(mode));
  } else if (mode === "direct") {
    lines.push("policy: session only. per provider.", "", "use:", ...routeUseLines(mode));
  } else {
    lines.push("", "use:", ...routeUseLines(mode));
  }

  appendCliOutput(lines);
};

const outputCliConfigSummary = () => {
  const lines = [
    "config sets route, provider, and model for one round.",
    "",
    `route: ${currentRouteLabel()}`,
    `provider: ${routeProviderLabel()}`,
    `model: ${routeModelLabel()}`,
    `state: ${routeStateLabel()}`,
    "",
    "routes:",
    ...routeTableLines(),
    "",
    "use:",
    "config route <local|connect|direct|my-brain>",
    "config local",
    "config connect",
    "config direct",
    "config my-brain",
  ];

  appendCliOutput(lines);
};

const startOpenRouterConnectFromCli = async () => {
  if (!isRouteConfigured() || sessionState.mode !== "connect") {
    setMode("connect");
  }
  if (sessionState.connect.apiKey.trim()) {
    appendCliOutput(["openrouter linked.", "route: connect", "use: run"]);
    return;
  }
  if (!isOpenRouterConnectSupported()) {
    appendCliError([getOpenRouterConnectConstraintMessage(), "use: config direct"]);
    return;
  }

  appendCliOutput("opening openrouter...");
  await startOpenRouterConnect();
};

const outputCliLocalDetectionResult = () => {
  if (sessionState.local.available === true) {
    appendCliOutput([
      "ollama detected.",
      `endpoint: ${getOllamaEndpoint()}`,
      "use: config local model list",
      "use: run",
    ]);
    return;
  }

  appendCliOutput([
    "ollama not detected.",
    ...localSetupUsageLines(),
  ]);
};

const outputCliRouteModel = async (mode: Mode, modelInput: string) => {
  if (!isRouteConfigured() || sessionState.mode !== mode) {
    setMode(mode);
  }

  const normalizedInput = modelInput.trim().toLowerCase();
  if (!normalizedInput || normalizedInput === "help") {
    setCliModel("");
    return;
  }

  if (normalizedInput === "list") {
    await refreshCurrentModels({ silent: true });
    appendCliOutput(listModelsForCli());
    return;
  }

  setCliModel(modelInput.trim());
};

const outputCliLocalConfig = async (localInput: string) => {
  const [head = ""] = localInput.trim().split(/\s+/, 1);
  const rest = localInput.trim().slice(head.length).trim();
  const lowerHead = head.toLowerCase();

  if (!lowerHead || lowerHead === "help") {
    await outputCliMode("local");
    return;
  }

  if (lowerHead === "model" || lowerHead === "engine") {
    await outputCliRouteModel("local", rest);
    return;
  }

  if (lowerHead === "detect" || lowerHead === "retry") {
    pendingMyBrainRunPayload = null;
    sessionState.routeConfigured = true;
    sessionState.mode = "local";
    sessionState.local.available = null;
    writeSessionState();
    syncInterface();
    appendCliOutput(["detecting ollama...", `endpoint: ${getOllamaEndpoint()}`]);
    await refreshCurrentModels({ silent: true });
    stopCliProgress();
    outputCliLocalDetectionResult();
    return;
  }

  if (lowerHead === "endpoint") {
    if (!rest || rest.toLowerCase() === "help") {
      appendCliOutput([
        `endpoint: ${getOllamaEndpoint()}`,
        "use: config local endpoint <url>",
        `default: ${DEFAULT_OLLAMA_ENDPOINT}`,
        "detect: config local detect",
      ]);
      return;
    }

    try {
      sessionState.mode = "local";
      sessionState.routeConfigured = true;
      pendingMyBrainRunPayload = null;
      sessionState.local.endpoint = normalizeOllamaEndpoint(rest);
      sessionState.local.available = null;
      modelOptionsCache.delete(LOCAL_MODEL_SOURCE_ID);
      writeSessionState();
      syncInterface();
      appendCliOutput(["endpoint set.", `endpoint: ${getOllamaEndpoint()}`, "detecting ollama..."]);
      await refreshCurrentModels({ silent: true });
      stopCliProgress();
      outputCliLocalDetectionResult();
    } catch (error) {
      stopCliProgress();
      appendCliError([
        "endpoint invalid.",
        error instanceof Error ? error.message : "use an http(s) endpoint.",
        "use: config local endpoint <url>",
      ]);
    }
    return;
  }

  appendCliError(["local config option not found.", "use: config local"]);
};

const outputCliDirectConfig = async (directInput: string) => {
  const [head = ""] = directInput.trim().split(/\s+/, 1);
  const rest = directInput.trim().slice(head.length).trim();
  const lowerHead = head.toLowerCase();

  if (!lowerHead || lowerHead === "help") {
    await outputCliMode("direct");
    return;
  }

  if (lowerHead === "provider") {
    setCliProvider(rest);
    return;
  }

  if (lowerHead === "key") {
    setCliApiKey(rest);
    return;
  }

  if (lowerHead === "model" || lowerHead === "engine") {
    await outputCliRouteModel("direct", rest);
    return;
  }

  appendCliError(["direct config option not found.", "use: config direct"]);
};

const outputCliConnectConfig = async (connectInput: string) => {
  const [head = ""] = connectInput.trim().split(/\s+/, 1);
  const rest = connectInput.trim().slice(head.length).trim();
  const lowerHead = head.toLowerCase();

  if (!lowerHead || lowerHead === "help") {
    await outputCliMode("connect");
    return;
  }

  if (lowerHead === "authorize" || lowerHead === "openrouter") {
    await startOpenRouterConnectFromCli();
    return;
  }

  if (lowerHead === "disconnect") {
    pendingMyBrainRunPayload = null;
    disconnectOpenRouter();
    appendCliOutput(["openrouter unlinked.", "use: config connect authorize"]);
    return;
  }

  if (lowerHead === "model" || lowerHead === "engine") {
    await outputCliRouteModel("connect", rest);
    return;
  }

  appendCliError(["connect config option not found.", "use: config connect"]);
};

const outputCliMyBrainConfig = async (myBrainInput: string) => {
  if (!isRouteConfigured() || sessionState.mode !== MY_BRAIN_MODE) {
    setMode(MY_BRAIN_MODE);
  }

  const [head = ""] = myBrainInput.trim().split(/\s+/, 1);
  const lowerHead = head.toLowerCase();
  if (!lowerHead || lowerHead === "help") {
    await outputCliMode(MY_BRAIN_MODE);
    return;
  }

  appendCliError(["my-brain config option not found.", "use: config my-brain"]);
};

const outputCliConfig = async (configInput: string) => {
  const [head = ""] = configInput.trim().split(/\s+/, 1);
  const rest = configInput.trim().slice(head.length).trim();
  const lowerHead = head.toLowerCase();
  const lowerRest = rest.toLowerCase();
  const normalizedHead = normalizeModeInput(head);

  if (!lowerHead || lowerHead === "help") {
    outputCliConfigSummary();
    return;
  }

  if (normalizedHead === "local") {
    await outputCliLocalConfig(rest);
    return;
  }

  if (normalizedHead === "direct") {
    await outputCliDirectConfig(rest);
    return;
  }

  if (normalizedHead === "connect") {
    await outputCliConnectConfig(rest);
    return;
  }

  if (normalizedHead === MY_BRAIN_MODE) {
    await outputCliMyBrainConfig(rest);
    return;
  }

  if (lowerHead === "route") {
    if (!lowerRest || lowerRest === "help") {
      appendCliOutput([
        "route selects how THOUGHT reaches a model.",
        "",
        `route: ${currentRouteLabel()}`,
        "",
        "routes:",
        ...routeTableLines(),
        "",
        "use:",
        "config route local",
        "config route connect",
        "config route direct",
        "config route my-brain",
      ]);
      return;
    }

    const route = parseModeInput(rest);
    if (route) {
      await outputCliMode(route);
      return;
    }

    appendCliError(["route not found.", "use: config route <local|connect|direct|my-brain>"]);
    return;
  }

  if (lowerHead === "disconnect" && lowerRest === "openrouter") {
    pendingMyBrainRunPayload = null;
    disconnectOpenRouter();
    appendCliOutput(["openrouter unlinked.", "use: config connect authorize"]);
    return;
  }

  if (lowerHead === "model" || lowerHead === "engine") {
    if (!lowerRest || lowerRest === "help") {
      setCliModel("");
      return;
    }
    if (lowerRest === "list") {
      await refreshCurrentModels({ silent: true });
      appendCliOutput(listModelsForCli());
      return;
    }
    setCliModel(rest);
    return;
  }

  if (lowerHead === "provider") {
    setCliProvider(lowerRest);
    return;
  }

  if (lowerHead === "key") {
    setCliApiKey(rest);
    return;
  }

  appendCliError(["config option not found.", "use: config"]);
};

const outputCliProvenance = async (json = false) => {
  if (!currentOutputText) {
    appendCliError(["no work ready.", "next: run"]);
    return;
  }

  try {
    await ensureActiveThoughtSpec();
    const provenance = getProvenanceSummary();
    if (!provenance) {
      throw new Error("provenance unavailable.");
    }

    if (json) {
      appendCliOutput(formatProvenanceJson(provenance.json));
      return;
    }

    if (provenance.bytes > MAX_PROVENANCE_BYTES) {
      appendCliError(provenanceTooLargeLines(provenance.bytes));
      return;
    }

    appendCliOutput([
      "provenance records run context for mint.",
      "schema: thought.provenance.v1",
      `spec: ${currentSpecLabel()}`,
      `prompt: ${currentRunContext?.prompt ? "included" : "unavailable"}`,
      `model return: ${currentRunContext?.returnedText ? "included" : "unavailable"}`,
      `bytes: ${provenance.bytes}`,
      "use: provenance --json",
    ]);
  } catch (error) {
    appendCliError([formatThoughtSpecError(error), "next: current"]);
  }
};

const isThoughtInstructionsCommand = (commandHead: string) =>
  commandHead === "spec" || commandHead === "thought.md";

const thoughtInstructionsUsageLines = (
  state: "available" | "unavailable",
  errorMessage = "",
) => [
  `THOUGHT.md ${state === "available" ? "ready." : "unavailable."}`,
  ...(state === "available" && activeThoughtSpec ? [`spec: ${activeThoughtSpec.ref}`] : []),
  ...(errorMessage ? [`error: ${errorMessage}`] : []),
  "use: THOUGHT.md text",
];

const outputCliThoughtInstructions = async (topic: string) => {
  try {
    await ensureActiveThoughtSpec({ force: true });
    syncThoughtInstructionsControls();
  } catch (error) {
    appendCliOutput(
      thoughtInstructionsUsageLines(
        "unavailable",
        formatThoughtSpecError(error),
      ),
    );
    return;
  }

  const normalizedTopic = topic.trim().toLowerCase();
  const text = getActiveThoughtInstructions().trim();
  const label = getActiveThoughtInstructionsLabel();

  if (normalizedTopic === "text" || normalizedTopic === "show" || normalizedTopic === "cat") {
    appendCliOutput([`THOUGHT.md: ${label}`, ...text.split(/\r?\n/)], { preserveSpacing: true });
    return;
  }

  appendCliOutput([
    "THOUGHT.md spec.",
    "generation spec for a run.",
    `state: ready`,
    `ref: ${activeThoughtSpec?.ref ?? label}`,
    ...(activeThoughtSpec ? [
      `id: ${shortHex(activeThoughtSpec.specId, 10, 8)}`,
      `hash: ${shortHex(activeThoughtSpec.specHash, 10, 8)}`,
      `bytes: ${activeThoughtSpec.byteLength}`,
      `source: ${activeThoughtSpec.pointer}`,
    ] : []),
    "use: spec text",
    "use: THOUGHT.md text",
  ]);
};

const outputCliColorFont = async (topic: string) => {
  const normalizedTopic = topic.trim().toLowerCase();
  await openColorFontDocument({
    appendCliResult: true,
    raw: normalizedTopic === "raw" || normalizedTopic === "text" || normalizedTopic === "show",
  });
};

const formatMintedThoughtLine = (thought: GalleryThought) => {
  const title = canonicalThoughtTitle(thought.rawText) || "UNTITLED";
  return `#${thought.tokenId} ${quoteCliText(title, 40)} $PATH #${thought.pathId}`;
};

const outputCliThoughtWorks = async (topic: string) => {
  const normalizedTopic = topic.trim().toLowerCase();
  if (normalizedTopic && normalizedTopic !== "list") {
    appendCliError(["thought option not found.", "use: thought", "use: thought list"]);
    return;
  }

  try {
    const thoughts = await readGalleryThoughts();
    if (!thoughts) {
      appendCliError(["THOUGHT works unavailable.", "use: gallery"]);
      return;
    }

    if (!thoughts.length) {
      appendCliOutput([
        "minted THOUGHTs.",
        "kept onchain.",
        "empty.",
        "use: mint",
        "use: gallery",
      ]);
      return;
    }

    appendCliOutput([
      "minted THOUGHTs.",
      "kept onchain.",
      ...thoughts.map(formatMintedThoughtLine),
      "",
      "use: gallery",
      "use: view THOUGHT <id>",
    ]);
  } catch {
    appendCliError(["failed to read THOUGHT works.", "use: gallery"]);
  }
};

const formatWorkLine = (work: ThoughtWorkRecord) =>
  `#${work.id} "${formatModelLabel(work.text || work.title, 48)}"`;

const workText = (work: ThoughtWorkRecord) => canonicalThoughtTitle(work.text || work.title);

const workPrompt = (work: ThoughtWorkRecord) => work.prompt || work.runContext.prompt;

const workReturnedText = (work: ThoughtWorkRecord) =>
  work.returnedText || work.runContext.returnedText || work.rawOutput;

const workSpecRef = (work: ThoughtWorkRecord) =>
  work.thoughtSpec?.ref || work.runContext.thoughtSpec?.ref || currentSpecLabel();

const workProvenanceBytes = (work: ThoughtWorkRecord) => {
  if (typeof work.provenanceBytes === "number") {
    return work.provenanceBytes;
  }
  if (work.provenanceJson) {
    return byteLength(work.provenanceJson);
  }
  const current = work.id === currentWorkId ? getProvenanceSummary() : null;
  return current?.bytes ?? null;
};

const workDetailLines = (work: ThoughtWorkRecord) => {
  const text = workText(work);
  const returnedText = workReturnedText(work);
  const prompt = workPrompt(work);
  const provenanceBytes = workProvenanceBytes(work);
  return [
    `work #${work.id} loaded.`,
    "",
    "prompt:",
    prompt ? quoteCliFullText(prompt) : "unavailable",
    "",
    "model return:",
    formatCliModelReturnValue(returnedText, text),
    "",
    "text:",
    quoteCliFullText(text),
    "",
    `route: ${work.route || work.runContext.mode}`,
    `model: ${work.model || work.runContext.model}`,
    `spec: ${workSpecRef(work)}`,
    `normalizer: ${work.normalizer?.id ?? "thought.normalize.v1"}`,
    provenanceBytes === null ? "provenance: unavailable" : formatProvenanceBytes(provenanceBytes),
    "",
    "use: mint",
    "use: provenance",
  ];
};

const currentWorkRecord = (): ThoughtWorkRecord | null => {
  if (currentWorkId !== null) {
    const stored = getWorkById(readStoredThoughtWorks(), currentWorkId);
    if (stored) {
      return stored;
    }
  }
  if (!currentOutputText || !currentRunContext) {
    return null;
  }

  const provenance = getProvenanceSummary();
  return {
    id: currentWorkId ?? 0,
    prompt: currentRunContext.prompt,
    returnedText: currentRunContext.returnedText ?? "",
    text: currentOutputText,
    title: currentOutputText,
    rawOutput: currentRunContext.returnedText ?? "",
    image: currentWorkSvg ? svgToImageUri(currentWorkSvg) : galleryThumbnailUri(currentOutputText),
    svg: currentWorkSvg,
    route: currentRunContext.mode,
    provider: currentRunContext.provider,
    model: currentRunContext.model,
    thoughtSpec: currentRunContext.thoughtSpec,
    normalizer: {
      id: "thought.normalize.v1",
      source: "contract-view",
    },
    provenanceJson: provenance?.json,
    provenanceBytes: provenance?.bytes,
    hashes: {
      promptHash: hashText(currentRunContext.prompt),
      returnedTextHash: hashText(currentRunContext.returnedText ?? ""),
      textHash: hashText(currentOutputText),
    },
    runContext: currentRunContext,
    createdAt: currentRunContext.clientGeneratedAt,
  };
};

const outputCliWorkList = () => {
  const works = readStoredThoughtWorks();
  if (!works.length) {
    appendCliOutput(["generated works from run.", "empty.", "next: run"]);
    return;
  }

  appendCliOutput([
    "generated works from run.",
    ...works.map(formatWorkLine),
    "",
    "use: work <id>",
    "use: work current",
    "use: work clear",
    "use: work previous",
    "use: work next",
    "use: work latest",
  ]);
};

const outputCliWorkUsage = () => {
  const currentWork = currentWorkRecord();
  appendCliOutput([
    "work is generated by the selected model.",
    currentWork ? `current: #${currentWork.id} "${formatModelLabel(workText(currentWork), 48)}"` : "current: empty",
    "",
    "use: work current",
    "use: work list",
    "use: work clear",
    "use: work <id>",
    "use: work previous",
    "use: work next",
    "use: work latest",
  ]);
};

const clearWorkHistoryFromCli = () => {
  const count = readStoredThoughtWorks().length;
  writeStoredThoughtWorks([]);
  currentWorkId = null;
  writeCurrentOutputSession();
  appendCliOutput([
    count ? `cleared ${count} stored work${count === 1 ? "" : "s"}.` : "stored works already empty.",
    "current work unchanged.",
    "use: reset",
    "use: run",
  ]);
};

const loadWorkFromCli = (input: string) => {
  const normalized = input.trim();
  if (!normalized || normalized.toLowerCase() === "help") {
    outputCliWorkUsage();
    return;
  }

  if (normalized.toLowerCase() === "clear") {
    clearWorkHistoryFromCli();
    return;
  }

  if (normalized.toLowerCase() === "current") {
    const work = currentWorkRecord();
    if (!work) {
      appendCliError(["no current work.", "use: work list", "use: run"]);
      return;
    }
    appendCliOutput(workDetailLines(work));
    return;
  }

  if (normalized.toLowerCase() === "previous" || normalized.toLowerCase() === "prev") {
    loadPreviousWorkFromCli();
    return;
  }

  if (normalized.toLowerCase() === "next") {
    loadNextWorkFromCli();
    return;
  }

  if (normalized.toLowerCase() === "latest" || normalized.toLowerCase() === "last") {
    loadLatestWorkFromCli();
    return;
  }

  const id = parseWorkId(normalized);
  if (id === null) {
    appendCliError(["work id invalid.", "use: work <id>", "use: work list"]);
    return;
  }

  const work = getWorkById(readStoredThoughtWorks(), id);
  if (!work) {
    appendCliError([`work #${id} not found.`, "use: work list"]);
    return;
  }

  loadWorkRecord(work);
  appendCliOutput(workDetailLines(work));
};

const loadPreviousWorkFromCli = () => {
  const work = getPreviousWork(readStoredThoughtWorks(), currentWorkId);
  if (!work) {
    appendCliError(currentWorkId ? ["no previous work.", "use: work list"] : ["no work found.", "next: run"]);
    return;
  }

  loadWorkRecord(work);
  appendCliOutput(workDetailLines(work));
};

const loadNextWorkFromCli = () => {
  const work = getNextWork(readStoredThoughtWorks(), currentWorkId);
  if (!work) {
    appendCliError(currentWorkId ? ["no next work.", "use: work list"] : ["no work found.", "next: run"]);
    return;
  }

  loadWorkRecord(work);
  appendCliOutput(workDetailLines(work));
};

const loadLatestWorkFromCli = () => {
  const work = getLatestWork(readStoredThoughtWorks());
  if (!work) {
    appendCliError(["no work found.", "next: run"]);
    return;
  }

  loadWorkRecord(work);
  appendCliOutput(workDetailLines(work));
};

const myBrainRunPendingLines = () => [
  "running...",
  "one model round.",
  "prompt + THOUGHT.md in.",
  "waiting for model return...",
  "entering my-brain...",
  "",
  "my-brain.",
  "you are the model for this round.",
  "return one text artifact only.",
  "",
  "use: return <text>",
  "use: cancel",
];

const buildMyBrainRunPayload = async (): Promise<PendingMyBrainRound> => {
  const prompt = sessionState.prompt.trim();
  if (!prompt) {
    throw new Error("prompt empty.");
  }

  await ensureActiveThoughtSpec({ force: true });
  syncThoughtInstructionsControls();
  const payload = buildCurrentThoughtRunPayload(prompt, MY_BRAIN_MODEL);
  return {
    route: MY_BRAIN_MODE,
    provider: MY_BRAIN_PROVIDER,
    model: MY_BRAIN_MODEL,
    prompt,
    thoughtSpecId: payload.input.thoughtSpec.id,
    thoughtSpecRef: payload.input.thoughtSpec.ref,
    thoughtSpecHash: payload.input.thoughtSpec.hash,
    startedAt: new Date().toISOString(),
    payload,
  };
};

const startMyBrainRunFromCli = async () => {
  try {
    pendingMyBrainRunPayload = await buildMyBrainRunPayload();
    runState = "running";
    runInFlight = false;
    syncInterface();
    appendCliOutput(myBrainRunPendingLines());
  } catch (error) {
    runState = "run_failed";
    const message = formatThoughtSpecError(error);
    appendCliError([
      "run failed.",
      message,
      message === "prompt empty." ? "next: prompt <text>" : "use: THOUGHT.md",
    ]);
  }
};

const cliWorkReadyLines = () => {
  const provenance = getProvenanceSummary();
  const text = currentOutputText || "";
  const returnedText = currentRunContext?.returnedText ?? "";
  if (provenance && provenance.bytes > MAX_PROVENANCE_BYTES) {
    return provenanceTooLargeLines(provenance.bytes, "work");
  }
  return [
    currentWorkId ? `work #${currentWorkId} is done.` : "work is done.",
    `text: ${quoteCliFullText(text)}`,
    `model return: ${formatCliModelReturnValue(returnedText, text)}`,
    provenance ? `provenance: ${provenance.bytes} bytes.` : "provenance ready.",
    "use: mint",
    "use: provenance",
    currentWorkId ? `use: work ${currentWorkId}` : "use: work current",
  ];
};

const returnMyBrainModelTextFromCli = async (returnInput: string) => {
  if (sessionState.mode !== MY_BRAIN_MODE) {
    appendCliError(["return unavailable.", `route: ${sessionState.mode}`, "use: config my-brain", "use: run"]);
    return;
  }

  const modelReturn = returnInput.trim();
  if (!modelReturn) {
    appendCliError(["model return empty.", "use: return <text>", "use: cancel"]);
    return;
  }

  if (!pendingMyBrainRunPayload || runState !== "running") {
    appendCliError(["return unavailable.", "route: my-brain", "use: run"]);
    return;
  }

  if (mintFlowState !== "closed") {
    resetMintRuntimeState();
    syncInterface();
  }

  try {
    const payload = pendingMyBrainRunPayload.payload;
    appendCliOutput([
      "model return received.",
      "leaving my-brain...",
      "canonicalizing via contract preview...",
      "rendering contract SVG...",
    ]);
    await completeThoughtRunFromModelReturn(payload, modelReturn);
    pendingMyBrainRunPayload = null;
    appendCliOutput(["contract SVG out.", "", ...cliWorkReadyLines()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "model return failed.";
    if (/provenance too large/i.test(message)) {
      appendCliError(["work blocked.", "provenance too large.", "use: return <text>", "use: cancel"]);
    } else if (isContractWorkPreviewError(error)) {
      appendCliError(error.cliLines ?? ["model return rejected.", message, "use: return <text>", "use: cancel"]);
    } else {
      appendCliError(["model return rejected.", message, "use: return <text>", "use: cancel"]);
    }
  } finally {
    runInFlight = false;
    syncInterface();
  }
};

const cancelMyBrainRunFromCli = () => {
  if (!isMyBrainShellActive()) {
    appendCliError(["cancel unavailable.", "use: run"]);
    return;
  }

  pendingMyBrainRunPayload = null;
  runState = "idle";
  runInFlight = false;
  syncInterface();
  appendCliOutput(["my-brain canceled.", "no work created.", "", "use: run"]);
};

const retryContractPreviewFromCli = async () => {
  if (!lastPreviewRetryContext) {
    appendCliError(["preview retry unavailable.", "no saved model return.", "use: run"]);
    return;
  }

  appendCliOutput(["canonicalizing via contract preview...", "rendering contract SVG..."]);

  try {
    await completeThoughtRunFromModelReturn(
      lastPreviewRetryContext.payload,
      lastPreviewRetryContext.modelReturn,
    );
    const lines = cliWorkReadyLines();
    if (lines[0] === "work blocked.") {
      appendCliError(lines);
      return;
    }
    appendCliOutput(lines);
  } catch (error) {
    const message = error instanceof Error ? error.message : "contract preview unavailable.";
    if (isContractWorkPreviewError(error)) {
      appendCliError(error.cliLines ?? ["contract preview unavailable.", "use: preview retry"]);
    } else {
      appendCliError(["contract preview unavailable.", message, "use: preview retry"]);
    }
  }
};

const runFromCli = async () => {
  if (!isRouteConfigured()) {
    appendCliError(["run failed.", ...routeRequiredLines()]);
    return;
  }

  if (!sessionState.prompt.trim()) {
    appendCliError(["run failed.", "prompt empty.", "next: prompt <text>"]);
    return;
  }

  if (!getCurrentModelValue().trim()) {
    appendCliError(["run failed.", "model empty.", `use: ${configModelCommandPrefix()} list`]);
    return;
  }

  if (!walletState.address) {
    appendCliError(["run failed.", "wallet not connected.", "use: wallet connect"]);
    return;
  }

  if (walletState.chainId !== THOUGHT_CHAIN_ID) {
    appendCliError(["run failed.", ...cliWrongNetworkLines()]);
    return;
  }

  if (sessionState.mode === "connect" && !sessionState.connect.apiKey.trim()) {
    appendCliError(["run failed.", "openrouter not linked.", "use: config connect authorize"]);
    return;
  }

  if (sessionState.mode === "direct" && !getDirectApiKey()) {
    appendCliError(["run failed.", "api key not set.", "use: config direct key <api-key>"]);
    return;
  }

  if (sessionState.mode === "local") {
    await refreshCurrentModels({ silent: true });
    if (sessionState.local.available === false) {
      appendCliError(["run failed.", "ollama not detected."]);
      appendCliOutput(localSetupUsageLines());
      return;
    }
  }

  if (sessionState.mode === MY_BRAIN_MODE) {
    await startMyBrainRunFromCli();
    return;
  }

  if (mintFlowState !== "closed") {
    resetMintRuntimeState();
    syncInterface();
  }

  startCliRunProgress();
  try {
    await runAgent({ forceGenerate: true, cli: true });
  } finally {
    stopCliProgress();
  }

  if (pageUnloading) {
    return;
  }

  if (runState === "output_ready") {
    const lines = cliWorkReadyLines();
    if (lines[0] === "work blocked.") {
      appendCliError(lines);
      return;
    }
    appendCliOutput(lines);
    return;
  }

  appendCliError(
    lastRunErrorCliLines.length
      ? lastRunErrorCliLines
      : panelWarningMessage
        ? ["run failed.", panelWarningMessage, "use: retry run"]
        : ["run failed."],
  );
};

const switchMintFlowToCli = () => {
  if (mintFlowUiMode === "cli") {
    return;
  }

  mintFlowUiMode = "cli";
  syncInterface();
};

const selectedCliPathId = () =>
  mintFlowData.pathId?.toString() ?? mintFlowData.pathIdInput.trim();

const hasPendingMintTransaction = () =>
  mintFlowState === "minting" ||
  walletState.txState === "awaiting_signature" ||
  walletState.txState === "submitted";

const cliWrongNetworkLines = () => [
  "wallet on wrong network.",
  `expected: ${THOUGHT_CHAIN_NAME}`,
  `chain id: ${THOUGHT_CHAIN_ID}`,
  `rpc: ${THOUGHT_RPC_URL || "not configured"}`,
  "",
  "in Rabby, add or switch to this network.",
  "use: wallet connect",
  "use: path <id>",
];

const cliPathRecoveryErrorLines = (fallbackPathId = "") => {
  const pathId = selectedCliPathId() || fallbackPathId.trim();
  const useLines = ["use: path <id>", "need $PATH: mint-path"];

  if (mintFlowData.errorKind === "wrong_network") {
    return cliWrongNetworkLines();
  }
  if (mintFlowData.errorKind === "path_not_found") {
    return [pathId ? `wallet does not hold $PATH #${pathId}.` : "wallet does not hold this $PATH.", ...useLines];
  }
  if (mintFlowData.errorKind === "path_consumed") {
    return [
      pathId ? `$PATH #${pathId} has no THOUGHT unit available.` : "$PATH has no THOUGHT unit available.",
      ...useLines,
    ];
  }
  if (mintFlowData.errorKind === "path_not_ready") {
    return [pathId ? `$PATH #${pathId} not ready for THOUGHT.` : "$PATH not ready for THOUGHT.", ...useLines];
  }
  if (mintFlowData.errorKind === "path_unknown") {
    return [
      pathId ? `$PATH #${pathId} status unknown.` : "$PATH status unknown.",
      "contract read failed.",
      ...useLines,
    ];
  }

  return [
    mintFlowData.error || (pathId ? `$PATH #${pathId} not available for THOUGHT.` : "$PATH not available for THOUGHT."),
    ...useLines,
  ];
};

const buildCliMintStateLines = () => {
  const pathId = selectedCliPathId();

  if (mintFlowState === "thought_checking") {
    return ["checking THOUGHT..."];
  }
  if (mintFlowState === "wallet_required") {
    return ["wallet not connected.", "use: wallet connect"];
  }
  if (mintFlowState === "path_required") {
    return [
      walletState.address ? `wallet: connected ${formatCliAddress(walletState.address)}` : "wallet: not connected",
      "select $PATH.",
      "use: path <id>",
      "use: path list",
      "need $PATH: mint-path",
    ];
  }
  if (mintFlowState === "path_checking") {
    return [`checking $PATH #${pathId || "?"}...`];
  }
  if (mintFlowState === "path_ready") {
    return [`$PATH #${pathId || "?"} selected.`, "THOUGHT unit available.", "use: authorize"];
  }
  if (mintFlowState === "authorizing") {
    return ["wallet authorization pending..."];
  }
  if (mintFlowState === "authorized") {
    return [`$PATH #${pathId || "?"} authorized for this THOUGHT.`, "use: confirm"];
  }
  if (mintFlowState === "minting") {
    return ["confirming mint..."];
  }
  if (mintFlowState === "minted") {
    return [
      "minted.",
      pathId ? `$PATH #${pathId} THOUGHT unit consumed.` : "",
      "use: view tx",
      viewThoughtUseLine(walletState.mintedTokenId),
    ].filter(Boolean);
  }
  if (mintFlowState === "text_taken") {
    const token = mintFlowData.existingTokenId;
    return [
      "already minted.",
      token ? `this exact text is already THOUGHT #${token}.` : "this exact text is already a THOUGHT.",
      "same canonical text cannot be minted twice.",
      "",
      viewThoughtUseLine(token),
      "",
      "to mint another:",
      "change the input or choose another work.",
      "use: prompt <text>",
      "use: config",
      "use: work list",
    ];
  }
  if (mintFlowState === "error") {
    if (mintFlowData.error.includes("provenance too large")) {
      return provenanceTooLargeLinesFromMessage(mintFlowData.error);
    }
    if (isPathRecoveryError()) {
      return cliPathRecoveryErrorLines(pathId);
    }
    return [mintFlowData.error || "mint unavailable.", "use: current"];
  }

  return [];
};

const appendCliMintState = () => {
  const lines = buildCliMintStateLines();
  if (!lines.length) {
    return;
  }

  if (mintFlowState === "error") {
    appendCliError(lines);
    return;
  }

  appendCliOutput(lines, mintFlowState === "text_taken" ? { preserveSpacing: true } : undefined);
};

const startCliMint = async () => {
  if (!currentOutputText) {
    appendCliError(["no work to mint.", "use: run"]);
    return;
  }

  if (!hasCurrentContractWorkSvg()) {
    appendCliError(["mint blocked.", "contract SVG missing.", "use: run"]);
    return;
  }

  appendCliOutput([
    "mint THOUGHT.",
    "keeps current work onchain.",
    "one THOUGHT needs one usable $PATH.",
    "select $PATH / authorize / confirm.",
  ]);
  await openMintSheet("cli");
  appendCliMintState();
};

const ensureCliMintFlow = async () => {
  if (mintFlowState !== "closed") {
    switchMintFlowToCli();
    return true;
  }

  if (!currentOutputText) {
    appendCliError(["no work to mint.", "use: run"]);
    return false;
  }

  if (!hasCurrentContractWorkSvg()) {
    appendCliError(["mint blocked.", "contract SVG missing.", "use: run"]);
    return false;
  }

  await openMintSheet("cli");
  return mintFlowState !== "closed";
};

const cliPathHelpLines = () => {
  const currentPath = selectedCliPathId();
  return [
    "$PATH is mint permission.",
    "",
    "one THOUGHT needs one usable $PATH.",
    "select $PATH / authorize / confirm.",
    "",
    `current: ${currentPath ? `#${currentPath}` : "not selected"}`,
    "",
    "use:",
    "path list",
    "path <id>",
    "need $PATH: mint-path",
  ];
};

const cliPathAvailability = async (
  pathNft: Contract,
  pathId: bigint,
  authorizedMinter: string,
  movementQuota: bigint,
) => {
  if (authorizedMinter.toLowerCase() !== THOUGHT_NFT_ADDRESS.toLowerCase() || movementQuota === 0n) {
    return "not ready";
  }

  try {
    const [stage, stageMinted] = await Promise.all([
      pathNft.getStage(pathId) as Promise<bigint>,
      pathNft.getStageMinted(pathId) as Promise<bigint>,
    ]);
    return stage !== 0n || stageMinted >= movementQuota ? "consumed" : "available";
  } catch {
    return "unknown";
  }
};

const listCliPaths = async () => {
  await refreshWalletState();

  if (!walletState.address) {
    appendCliOutput([
      "wallet $PATHs for THOUGHT mint.",
      "",
      "wallet not connected.",
      "use: wallet connect",
    ]);
    return;
  }

  const provider = getReadProvider();
  const pathNft = getReadPathNft();
  if (!provider || !pathNft || !PATH_NFT_ADDRESS || !THOUGHT_NFT_ADDRESS) {
    appendCliOutput([
      "wallet $PATHs for THOUGHT mint.",
      "",
      "path list unavailable.",
      "need $PATH: mint-path",
    ]);
    return;
  }

  try {
    const walletTopic = indexedAddressTopic(walletState.address);
    const [incomingLogs, outgoingLogs] = await Promise.all([
      provider.getLogs({
        address: PATH_NFT_ADDRESS,
        fromBlock: 0,
        toBlock: "latest",
        topics: [ERC721_TRANSFER_TOPIC, null, walletTopic],
      }),
      provider.getLogs({
        address: PATH_NFT_ADDRESS,
        fromBlock: 0,
        toBlock: "latest",
        topics: [ERC721_TRANSFER_TOPIC, walletTopic],
      }),
    ]);
    const candidateIds = new Set<bigint>();
    for (const log of [...incomingLogs, ...outgoingLogs]) {
      const tokenId = transferLogTokenId(log.topics);
      if (tokenId !== null) {
        candidateIds.add(tokenId);
      }
    }

    const [authorizedMinter, movementQuota] = await Promise.all([
      pathNft.getAuthorizedMinter(PATH_MOVEMENT_THOUGHT) as Promise<string>,
      pathNft.getMovementQuota(PATH_MOVEMENT_THOUGHT) as Promise<bigint>,
    ]);
    const wallet = walletState.address.toLowerCase();
    const ownedPaths = (
      await Promise.all(
        [...candidateIds]
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
          .map(async (pathId) => {
            try {
              const owner = (await pathNft.ownerOf(pathId)) as string;
              if (owner.toLowerCase() !== wallet) {
                return null;
              }
              const status = await cliPathAvailability(pathNft, pathId, authorizedMinter, movementQuota);
              return { pathId, status };
            } catch {
              return { pathId, status: "unknown" };
            }
          }),
      )
    ).filter((path): path is { pathId: bigint; status: string } => path !== null);

    appendCliOutput([
      "wallet $PATHs for THOUGHT mint.",
      `wallet: ${formatCliAddress(walletState.address)}`,
      "",
      ...(ownedPaths.length
        ? ownedPaths.map(({ pathId, status }) => `#${pathId.toString()} ${status}`)
        : ["none found."]),
      "",
      "use: path <id>",
      "need $PATH: mint-path",
    ]);
  } catch {
    appendCliOutput([
      "wallet $PATHs for THOUGHT mint.",
      "",
      "path list unavailable.",
      "use: path <id>",
      "need $PATH: mint-path",
    ]);
  }
};

const checkCliPath = async (pathInput: string) => {
  const trimmed = pathInput.trim();
  if (!trimmed) {
    appendCliOutput(cliPathHelpLines());
    return;
  }

  if (trimmed.toLowerCase() === "list") {
    await listCliPaths();
    return;
  }

  if (hasPendingMintTransaction()) {
    appendCliError(["mint already pending.", "use: view tx", "use: current"]);
    return;
  }

  if (!await ensureCliMintFlow()) {
    return;
  }

  mintFlowData.pathIdInput = trimmed;
  mintFlowData.pathId = parsePathTokenId(pathInput);
  appendCliOutput(`checking $PATH #${trimmed}...`);
  await checkPathEligibility();
  stopCliProgress();

  if (mintFlowState === "path_ready") {
    appendCliOutput([
      `$PATH #${mintFlowData.pathId?.toString() ?? trimmed} selected.`,
      "THOUGHT unit available.",
      "use: authorize",
    ]);
  } else if (mintFlowState === "wallet_required") {
    appendCliError(["wallet not connected.", "use: wallet connect"]);
  } else if (mintFlowState === "error") {
    if (mintFlowData.error.includes("provenance too large")) {
      appendCliError(provenanceTooLargeLinesFromMessage(mintFlowData.error));
      return;
    }
    appendCliError(cliPathRecoveryErrorLines(trimmed));
  }
};

const authorizeFromCli = async () => {
  if (!await ensureCliMintFlow()) {
    return;
  }

  if (mintFlowState !== "path_ready") {
    const pathId = selectedCliPathId();
    appendCliError(
      mintFlowState === "authorized"
        ? [`$PATH #${pathId || "?"} authorized for this THOUGHT.`, "use: confirm"]
        : ["not ready.", "use: path <id>"],
    );
    return;
  }

  const pathId = selectedCliPathId() || "?";
  appendCliOutput([
    `authorize $PATH #${pathId} for this THOUGHT.`,
    "wallet may open for authorization.",
    "no gas.",
    "does not mint.",
    `expires in ${Math.floor(Number(PATH_CONSUME_AUTH_TTL_SECONDS) / 3600)} hour.`,
  ]);
  await authorizeMint();
  stopCliProgress();
  const state = mintFlowState as MintFlowState;
  if (state === "authorized") {
    appendCliOutput([`$PATH #${pathId} authorized for this THOUGHT.`, "use: confirm"]);
  } else if (state === "error") {
    if (mintFlowData.error.includes("provenance too large")) {
      appendCliError(provenanceTooLargeLinesFromMessage(mintFlowData.error));
      return;
    }
    appendCliError(isPathRecoveryError() ? cliPathRecoveryErrorLines(pathId) : [mintFlowData.error || "authorization failed.", "use: path <id>"]);
  }
};

const formatCliSpecLabel = (ref: string) => {
  const match = ref.match(/^THOUGHT\.v(.+)\.md$/i);
  return match ? `THOUGHT.md@v${match[1]}` : ref;
};

const cliConfirmPreviewLines = async () => {
  await rebuildFinalMintProvenance();
  const pathId = selectedCliPathId() || "?";
  const text = mintFlowData.rawText || currentOutputText;
  const prompt = currentRunContext?.prompt || sessionState.prompt;
  const returnedText = currentRunContext?.returnedText ?? "";
  const provenanceBytes = mintFlowData.provenanceJson ? byteLength(mintFlowData.provenanceJson) : null;
  const specLabel = activeThoughtSpec?.ref
    ? formatCliSpecLabel(activeThoughtSpec.ref)
    : shortHex(mintFlowData.thoughtSpecId || "", 10, 8) || "unknown";

  return [
    "confirm THOUGHT mint.",
    `work: ${quoteCliFullText(text)}`,
    `prompt: ${quoteCliFullText(prompt)}`,
    `model return: ${formatCliModelReturnValue(returnedText, text)}`,
    `$PATH: #${pathId}`,
    provenanceBytes === null ? "provenance: unknown" : formatProvenanceBytes(provenanceBytes),
    `spec: ${specLabel}`,
    "",
    "mint fee: none",
    "network gas: shown in wallet.",
    "",
    "publishes prompt + model return + provenance.",
    `$PATH #${pathId} THOUGHT unit will be consumed.`,
    "confirm in wallet...",
  ];
};

const confirmFromCli = async () => {
  if (!await ensureCliMintFlow()) {
    return;
  }

  if (mintFlowState !== "authorized") {
    appendCliError(["not authorized.", "use: authorize"]);
    return;
  }

  try {
    appendCliOutput(await cliConfirmPreviewLines(), { preserveSpacing: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "mint unavailable.";
    if (message.includes("provenance too large")) {
      appendCliError(provenanceTooLargeLinesFromMessage(message));
      return;
    }
    appendCliError([message, "use: current"]);
    return;
  }
  const txHash = await confirmMint({ appendCliResult: true });
  stopCliProgress();
  const state = mintFlowState as MintFlowState;
  if (!txHash && state === "error") {
    if (mintFlowData.error.includes("provenance too large")) {
      appendCliError(provenanceTooLargeLinesFromMessage(mintFlowData.error));
      return;
    }
    appendCliError([mintFlowData.error || "mint failed.", "use: current"]);
  }
};

const connectWalletFromCli = async () => {
  const mintFlowWasActive = mintFlowState !== "closed";
  if (mintFlowWasActive) {
    switchMintFlowToCli();
  }

  appendCliOutput("connecting wallet...");
  await requestWalletConnect();
  stopCliProgress();

  if (mintFlowWasActive && walletState.address && mintFlowState === "wallet_required") {
    mintFlowState = "path_required";
    mintFlowData.error = "";
    mintFlowData.errorKind = "none";
  }

  if (mintFlowState !== "closed") {
    switchMintFlowToCli();
    syncInterface();
    appendCliMintState();
    return;
  }

  appendCliOutput(walletState.address ? ["wallet connected.", "use: mint"] : ["wallet not connected.", "use: wallet connect"]);
};

const outputCliWalletUsage = () => {
  appendCliOutput([
    "wallet handles $PATH and mint.",
    `wallet: ${walletState.address ? `connected ${formatCliAddress(walletState.address)}` : "not connected"}`,
    "use: wallet connect",
    "clear: wallet disconnect",
  ]);
};

const disconnectWalletFromCli = () => {
  walletDisconnectedByUser = true;
  walletState.address = "";
  walletState.chainId = null;
  walletState.menuOpen = false;
  walletState.preflightLoading = false;
  walletState.preflightError = "";
  resetMintRuntimeState();
  syncInterface();
  appendCliOutput(["wallet disconnected.", "use: wallet connect"]);
};

const cliCommandsHelpLines = () => [
  "commands:",
  "config",
  "config route <local|connect|direct|my-brain>",
  "config local",
  "config connect",
  "config direct",
  "config my-brain",
  "config local detect",
  "config local endpoint <url>",
  "config local model list",
  "config local model <id>",
  "config connect authorize",
  "config connect disconnect",
  "config connect model list",
  "config connect model <id>",
  "config direct provider list",
  "config direct provider <id>",
  "config direct key <api-key>",
  "config direct key clear",
  "config direct model list",
  "config direct model <id>",
  "",
  "prompt <text>",
  "prompt clear",
  "spec",
  "spec text",
  "THOUGHT.md",
  "THOUGHT.md text",
  "color-font",
  "color-font raw",
  "",
    "run",
    "rerun",
    "retry run",
    "preview retry",
  "work",
  "work current",
  "work list",
  "work clear",
  "work <id>",
  "work previous",
  "work next",
  "work latest",
  "works clear",
  "thought",
  "thought list",
  "",
  "mint",
  "wallet",
  "wallet connect",
  "wallet disconnect",
  "path",
  "path list",
  "path <id>",
  "authorize",
  "confirm",
  "mint-path",
  "",
  "current",
  "provenance",
  "provenance --json",
  "gallery",
  "view tx",
  "view THOUGHT <id>",
  "clear",
  "reset",
  "help",
  "commands",
];

const cliHelpLines = (topic = "") => {
  const normalizedTopic = topic.trim().toLowerCase();

  if (!normalizedTopic) {
    return [
      "THOUGHT takes a prompt and THOUGHT.md,",
      "runs one model round,",
      "then renders the returned text to canvas.",
      "",
      "flow:",
      "config   choose route, provider, model",
      "prompt   write intention",
      "run      one model round",
      "mint     keep the work onchain",
      "",
      "my-brain:",
      "return   enter the model return",
      "",
      "more:",
      "help flow",
      "commands",
      "current",
      "config",
      "prompt",
      "THOUGHT.md",
      "color-font",
      "work",
      "mint",
      "wallet",
      "$PATH",
      "provenance",
      "gallery",
      "my-brain",
      "clear",
      "reset",
    ];
  }

  if (normalizedTopic === "commands") {
    return cliCommandsHelpLines();
  }

  if (normalizedTopic === "flow") {
    return [
      "flow:",
      "",
      "1 config",
      "  choose how THOUGHT reaches a model.",
      "",
      "2 prompt",
      "  set the human intention.",
      "",
      "3 run",
      "  one model round.",
      "  prompt + THOUGHT.md in.",
      "  contract SVG out.",
      "",
      "4 mint",
      "  one THOUGHT needs one $PATH.",
      "  select $PATH / authorize / confirm.",
      "",
      "my-brain route:",
      "  return enters the model return.",
    ];
  }

  if (normalizedTopic === "config") {
    return [
      "config sets route, provider, and model for one round.",
      "",
      "route is how THOUGHT reaches the model.",
      "model is the selected AI model.",
      "",
      "routes:",
      ...routeTableLines(),
      "",
      "use:",
      "config",
      "config route <local|connect|direct|my-brain>",
      "config local",
      "config connect",
      "config direct",
      "config my-brain",
      "config local model list",
      "config connect model list",
      "config direct model list",
      "current",
    ];
  }

  if (normalizedTopic === "mode") {
    return ["use: config route <local|connect|direct|my-brain>"];
  }

  if (normalizedTopic === "model") {
    return [
      `model: ${getCurrentModelValue().trim() || "empty"}`,
      `use: ${configModelCommandPrefix()} list`,
      `use: ${configModelCommandPrefix()} <id>`,
    ];
  }

  if (normalizedTopic === "provider") {
    return [
      "provider selects the direct API provider.",
      "",
      `provider: ${sessionState.direct.provider}`,
      "route: direct",
      "",
      ...directProviderListLines(),
    ];
  }

  if (normalizedTopic === "prompt") {
    return [
      "prompt sets the user intention for one round.",
      "",
      "use:",
      "prompt <text>",
      "prompt clear",
      "",
      "flow:",
      "config",
      "prompt <text>",
      "run",
      "mint",
    ];
  }

  if (normalizedTopic === "thought") {
    return [
      "thought lists minted THOUGHTs.",
      "",
      "THOUGHT is a minted generated work.",
      "work is generated by the selected model.",
      "",
      "use:",
      "thought",
      "thought list",
      "gallery",
      "view THOUGHT <id>",
    ];
  }

  if (normalizedTopic === "thought.md" || normalizedTopic === "spec") {
    return [
      "THOUGHT.md is the generation spec.",
      "",
      "prompt + THOUGHT.md in.",
      "contract SVG out.",
      "",
      "use:",
      "spec",
      "spec text",
      "THOUGHT.md",
      "THOUGHT.md text",
    ];
  }

  if (normalizedTopic === "color-font" || normalizedTopic === "font") {
    return [
      "color-font opens the onchain Color Font.",
      "",
      "source: ThoughtNFT color-font ABI.",
      "format: LETTER:INDEX:ALIAS_TERM:HEX",
      "",
      "use:",
      "color-font",
      "color-font raw",
    ];
  }

  if (normalizedTopic === "run") {
    return [
      "run sends prompt + THOUGHT.md to the selected model.",
      "",
      "one model round.",
      "contract SVG out.",
      "",
      "use:",
      "run",
      "rerun",
      "retry run",
    ];
  }

  if (normalizedTopic === "return" || normalizedTopic === "my-brain" || normalizedTopic === "mybrain") {
    return [
      "my-brain route.",
      MY_BRAIN_DESCRIPTION,
      "",
      "the prompt and THOUGHT.md enter the round.",
      "you become the model for that round.",
      "",
      "flow:",
      "config my-brain",
      "prompt <text>",
      "run",
      "return <text>",
      "mint",
    ];
  }

  if (normalizedTopic === "works" || normalizedTopic === "work" || normalizedTopic === "output") {
    return [
      "work is generated by the selected model.",
      "",
      "each work stores the canvas text,",
      "contract SVG, and run context.",
      "",
      "use:",
      "work",
      "work current",
      "work list",
      "work clear",
      "work <id>",
      "work previous",
      "work next",
      "work latest",
    ];
  }

  if (normalizedTopic === "reset") {
    return [
      "reset clears the current work.",
      "",
      "clears canvas, prompt, mint state,",
      "and current output session.",
      "",
      "does not clear stored work history.",
      "",
      "use:",
      "reset",
      "work clear",
    ];
  }

  if (normalizedTopic === "clear") {
    return [
      "clear empties the console transcript.",
      "",
      "does not clear current work,",
      "stored work history, or wallet state.",
      "",
      "use:",
      "clear",
      "reset",
      "work clear",
    ];
  }

  if (normalizedTopic === "provenance") {
    return [
      "provenance records the run and mint context.",
      "",
      "prompt, model, THOUGHT.md,",
      "route, hashes, and mint context.",
      "",
      "it is a record, not proof.",
      "",
      "use:",
      "provenance",
      "provenance --json",
    ];
  }

  if (normalizedTopic === "mint") {
    return [
      "mint THOUGHT.",
      "keeps current work onchain.",
      "one THOUGHT needs one $PATH.",
      "select $PATH / authorize / confirm.",
      "",
      "use:",
      "mint",
      "path",
      "path list",
      "path <id>",
      "authorize",
      "confirm",
      "",
      "need $PATH:",
      "mint-path",
    ];
  }

  if (normalizedTopic === "path" || normalizedTopic === "$path") {
    return cliPathHelpLines();
  }

  if (normalizedTopic === "wallet") {
    return [
      "wallet signs $PATH and mint actions.",
      "",
      "connect it when you keep a THOUGHT.",
      "",
      "use:",
      "wallet connect",
      "wallet disconnect",
      "mint",
    ];
  }

  if (normalizedTopic === "gallery") {
    return [
      "gallery opens minted THOUGHTs.",
      "",
      "use:",
      "gallery",
      "view THOUGHT <id>",
      "thought",
    ];
  }

  if (normalizedTopic === "direct") {
    return [
      ROUTE_COPY.direct.brief,
      "",
      "never printed.",
      "not stored by THOUGHT.",
      "",
      "use:",
      "config direct",
      "config direct provider list",
      "config direct provider <id>",
      "config direct key <api-key>",
      "config direct key clear",
      "config direct model list",
      "config direct model <id>",
    ];
  }

  if (normalizedTopic === "connect") {
    return [
      ROUTE_COPY.connect.brief,
      "",
      "no raw key paste.",
      "revocable.",
      "",
      "use:",
      "config connect",
      "config connect authorize",
      "config connect disconnect",
      "config connect model list",
      "config connect model <id>",
    ];
  }

  if (normalizedTopic === "local") {
    return [
      ROUTE_COPY.local.brief,
      "",
      "detected from this browser.",
      `endpoint: ${getOllamaEndpoint()}`,
      "",
      "use:",
      "config local",
      "config local detect",
      "config local endpoint <url>",
      "config local model list",
      "config local model <id>",
      "run",
      "",
      "alternatives:",
      "config connect",
      "config direct",
      "config my-brain",
    ];
  }

  return ["unknown help topic.", "use: help", "use: commands"];
};

const executeCliCommand = async (rawCommand: string) => {
  const command = rawCommand.trim();
  if (!command || cliCommandInFlight) {
    return;
  }

  recordCliCommandHistory(command);
  appendCliCommand(command);
  cliCommandInFlight = true;
  syncCliPanel();

  try {
    const [head = "", second = ""] = command.split(/\s+/, 2);
    const rest = command.slice(head.length).trim();
    const lowerHead = head.toLowerCase();
    const lowerRest = rest.toLowerCase();
    cliSuggestionContext = "auto";

    if (command === "?" || command === "--help" || lowerHead === "help") {
      appendCliOutput(cliHelpLines(lowerRest));
      cliSuggestionContext = "help";
    } else if (lowerHead === "commands") {
      if (isMyBrainShellActive()) {
        appendCliError(myBrainWaitingLines());
      } else {
        appendCliOutput(cliCommandsHelpLines());
        cliSuggestionContext = "help";
      }
    } else if (lowerHead === "current" || lowerHead === "status") {
      appendCliOutput(buildCliCurrentLines());
      cliSuggestionContext = "current";
    } else if (isMyBrainShellActive() && lowerHead !== "return" && lowerHead !== "cancel") {
      appendCliError(myBrainWaitingLines());
    } else if (lowerHead === "clear") {
      cliEntries.length = 0;
      writeCliTranscript();
      initializeCliTranscript();
    } else if (lowerHead === "reset") {
      resetThought();
      appendCliOutput(["reset current work, canvas, and mint state.", "next: prompt <text>"]);
    } else if (lowerHead === "gallery") {
      if (hasPendingMintTransaction()) {
        appendCliOutput([
          "mint pending.",
          walletState.txState === "awaiting_signature" ? "confirm in wallet." : "waiting for chain confirmation...",
          walletState.txHash ? "use: view tx" : "wait for wallet.",
        ]);
        return;
      }

      appendCliOutput("opening gallery...");
      window.location.href = galleryUrl();
    } else if (lowerHead === "config") {
      await outputCliConfig(rest);
      cliSuggestionContext = "config";
    } else if (lowerHead === "mode") {
      if (!lowerRest || lowerRest === "help") {
        await outputCliMode("");
      } else {
        const mode = parseModeInput(rest);
        if (!mode) {
          appendCliError(["route not found.", "use: config route <local|connect|direct|my-brain>"]);
        } else {
          await outputCliMode(mode);
        }
      }
    } else if (lowerHead === "my-brain" || lowerHead === "mybrain") {
      await outputCliMode(MY_BRAIN_MODE);
    } else if (lowerHead === "return") {
      await returnMyBrainModelTextFromCli(rest);
    } else if (lowerHead === "cancel") {
      cancelMyBrainRunFromCli();
    } else if (lowerHead === "connect" && (!rest || lowerRest === "openrouter")) {
      await startOpenRouterConnectFromCli();
    } else if (lowerHead === "disconnect" && (!rest || lowerRest === "openrouter")) {
      disconnectOpenRouter();
      appendCliOutput(["openrouter unlinked.", "use: config connect authorize"]);
    } else if (lowerHead === "provider") {
      setCliProvider(lowerRest);
    } else if (lowerHead === "key") {
      setCliApiKey(rest);
    } else if (lowerHead === "models") {
      await refreshCurrentModels({ silent: true });
      appendCliOutput(listModelsForCli());
    } else if (lowerHead === "model") {
      if (lowerRest === "list") {
        await refreshCurrentModels({ silent: true });
        appendCliOutput(listModelsForCli());
      } else {
        setCliModel(rest);
      }
    } else if (lowerHead === "prompt") {
      setCliPrompt(rest);
    } else if (isThoughtInstructionsCommand(lowerHead)) {
      await outputCliThoughtInstructions(lowerRest);
    } else if (lowerHead === "color-font" || lowerHead === "font") {
      await outputCliColorFont(lowerRest);
    } else if (lowerHead === "thought") {
      await outputCliThoughtWorks(lowerRest);
    } else if (lowerHead === "works") {
      if (lowerRest === "clear") {
        clearWorkHistoryFromCli();
      } else {
        outputCliWorkList();
      }
    } else if (lowerHead === "work" || lowerHead === "output") {
      if (lowerRest === "list") {
        outputCliWorkList();
      } else {
        loadWorkFromCli(rest);
      }
    } else if (lowerHead === "preview" && lowerRest === "retry") {
      await retryContractPreviewFromCli();
    } else if (lowerHead === "run" || lowerHead === "rerun" || command.toLowerCase() === "retry run") {
      if (command.toLowerCase() === "retry run" && lastRejectedRun) {
        appendCliOutput([
          "last run was rejected by the THOUGHT rules.",
          "retry may repeat the same failure unless prompt or config changes.",
        ]);
      }
      await runFromCli();
    } else if (lowerHead === "provenance") {
      await outputCliProvenance(lowerRest === "--json");
    } else if (lowerHead === "wallet") {
      if (lowerRest === "connect") {
        await connectWalletFromCli();
      } else if (lowerRest === "disconnect") {
        disconnectWalletFromCli();
      } else {
        outputCliWalletUsage();
      }
    } else if (lowerHead === "mint") {
      await startCliMint();
    } else if (lowerHead === "mint-path") {
      appendCliOutput("opening $PATH...");
      handleMintPath();
    } else if (lowerHead === "path") {
      await checkCliPath(rest);
    } else if (lowerHead === "authorize") {
      await authorizeFromCli();
    } else if (lowerHead === "confirm") {
      await confirmFromCli();
    } else if (lowerHead === "view" && second.toLowerCase() === "tx") {
      appendCliOutput("opening tx...");
      await handleViewTx();
    } else if (lowerHead === "view" && second.toLowerCase() === "thought") {
      const tokenIdInput = command.split(/\s+/).slice(2).join(" ");
      const tokenId = tokenIdInput
        ? parseThoughtNFTIdInput(tokenIdInput)
        : (walletState.mintedTokenId ?? mintFlowData.existingTokenId);
      if (tokenIdInput && tokenId === null) {
        appendCliError(["THOUGHT id invalid.", "use: view THOUGHT <id>"]);
      } else if (tokenId === null || tokenId === undefined) {
        appendCliError(["THOUGHT id required.", "use: view THOUGHT <id>"]);
      } else {
        appendCliOutput(`opening THOUGHT #${tokenId}...`);
        await handleViewThought(tokenId);
      }
    } else {
      appendCliError(["unknown command.", "use: help"]);
    }
  } finally {
    stopCliProgress();
    cliCommandInFlight = false;
    syncInterface();
    focusCliInput();
  }
};

thoughtCliForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = thoughtCliInput.value;
  thoughtCliInput.value = "";
  resetCliInputNavigation();
  void executeCliCommand(command);
  focusCliInput();
});

thoughtCliInput.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "c" &&
    thoughtCliInput.value
  ) {
    event.preventDefault();
    thoughtCliInput.value = "";
    resetCliInputNavigation();
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    navigateCliInput("previous");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    navigateCliInput("next");
  }
});

thoughtCliInput.addEventListener("input", () => {
  if (cliHistoryIndex !== null || cliCompletionIndex !== null) {
    resetCliInputNavigation();
  }
});

thoughtCliTranscript.addEventListener("scroll", () => {
  revealCliScrollbar();
});

frontpageShell.addEventListener("click", (event) => {
  if (shouldRefocusCliFromClick(event.target)) {
    focusCliInput();
  }
});

document.addEventListener("keydown", (event) => {
  if (shouldRefocusCliFromKeyboard(event)) {
    focusCliInputFromKeyboard(event);
  }
});

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

  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  sessionState.direct.provider = providerBox.value;
  sessionState.direct.model = DIRECT_PROVIDERS[providerBox.value].defaultModel;
  writeSessionState();
  syncInterface();
  void refreshCurrentModels({ silent: true });
  setWarning("");
  setStatus("");
});

apiKeyBox.addEventListener("input", () => {
  pendingMyBrainRunPayload = null;
  setDirectApiKey(apiKeyBox.value);
  writeSessionState();
  setWarning("");
});

modelBox.addEventListener("change", () => {
  syncManualModelField();
  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;

  if (modelBox.value === MANUAL_MODEL_VALUE) {
    modelManualBox.focus();
  }

  setCurrentModelValue(getSelectedModelValue());
  modelBox.title = getSelectedModelValue();
  writeSessionState();
  setWarning("");
});

modelManualBox.addEventListener("input", () => {
  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
  setCurrentModelValue(modelManualBox.value.trim());
  modelManualBox.title = modelManualBox.value.trim();
  writeSessionState();
  setWarning("");
});

promptBox.addEventListener("input", () => {
  resetMintRuntimeState();
  pendingMyBrainRunPayload = null;
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
  setStatus(`using ${getActiveThoughtInstructionsLabel()}.`, { flashMs: NOTICE_FLASH_MS });
});

mintSheetClose.addEventListener("click", () => {
  closeMintSheet();
});

mintSheetBackdrop.addEventListener("click", () => {
  closeMintSheet();
});

mintSheetPathBox.addEventListener("input", () => {
  const value = mintSheetPathBox.value.trim();
  mintFlowData.pathIdInput = value;
  mintFlowData.pathId = parsePathTokenId(value);
  mintFlowData.error = "";
  mintFlowData.errorKind = "none";
  clearMintAuthorization();
  if (mintFlowState !== "closed") {
    mintFlowState = "path_required";
  }
  syncInterface();
});

mintSheetPathBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    void handleMintSheetAction(mintSheetPrimaryAction);
  }
});

mintSheetPrimary.addEventListener("click", () => {
  void handleMintSheetAction(mintSheetPrimaryAction);
});

mintSheetSecondary.addEventListener("click", () => {
  void handleMintSheetAction(mintSheetSecondaryAction);
});

mintSheetTertiary.addEventListener("click", () => {
  void handleMintSheetAction(mintSheetTertiaryAction);
});

thoughtDebugToggle.addEventListener("click", () => {
  debugState.open = !debugState.open;
  syncDebugPanel();
});

thoughtDebugEnabled.addEventListener("change", () => {
  debugState.enabled = thoughtDebugEnabled.checked;
  syncInterface();
});

thoughtDebugReset.addEventListener("click", () => {
  debugState = { ...DEFAULT_DEBUG_STATE };
  syncInterface();
});

thoughtDebugCta.addEventListener("change", () => {
  debugState.cta = thoughtDebugCta.value as ThoughtDebugCtaOverride;
  debugState.ctaStatus = "auto";
  debugState.warning = "auto";
  syncInterface();
});

thoughtDebugCtaStatus.addEventListener("change", () => {
  debugState.ctaStatus = thoughtDebugCtaStatus.value as ThoughtDebugCtaStatusOverride;
  debugState.warning = "auto";
  syncInterface();
});

thoughtDebugWarning.addEventListener("change", () => {
  debugState.warning = thoughtDebugWarning.value as ThoughtDebugWarningOverride;
  syncInterface();
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
  if (isDebugCtaOverrideActive()) {
    setStatus("debug action only.", { flashMs: NOTICE_FLASH_MS });
    return;
  }

  if (secondaryActionState === "reset") {
    resetThought();
    return;
  }

  if (secondaryActionState === "view_tx") {
    void handleViewTx();
    return;
  }

  if (secondaryActionState === "view_thought") {
    void handleViewThought(walletState.mintedTokenId);
  }
});

thoughtDetailViewTx.addEventListener("click", (event) => {
  if (!currentThoughtDetail) {
    event.preventDefault();
    return;
  }

  if (!THOUGHT_EXPLORER_BASE_URL) {
    event.preventDefault();
    void copyThoughtDetailValue(currentThoughtDetail.txHash);
  }
});

thoughtDetailPath.addEventListener("click", (event) => {
  if (!currentThoughtDetail) {
    event.preventDefault();
    return;
  }

  if (!thoughtTxUrl(currentThoughtDetail.txHash)) {
    event.preventDefault();
    void copyThoughtDetailValue(currentThoughtDetail.txHash, "tx copied.");
  }
});

thoughtDetailSpecRef.addEventListener("click", (event) => {
  if (!currentThoughtDetail) {
    event.preventDefault();
    return;
  }

  if (thoughtDetailSpecRef.getAttribute("href") === "#") {
    event.preventDefault();
    void openThoughtDetailSpecJson();
  }
});

thoughtDetailColorFont.addEventListener("click", (event) => {
  if (thoughtDetailColorFont.dataset.blobReady === "true" && thoughtDetailColorFont.getAttribute("href") !== "#") {
    return;
  }

  event.preventDefault();
  void openColorFontDocument({ rawDocument: true });
});

thoughtDetailProvenanceBytes.addEventListener("click", (event) => {
  if (thoughtDetailProvenanceBytes.getAttribute("href") === "#") {
    event.preventDefault();
  }
});

const handleViewportResize = () => {
  syncCurrentWorkVisual({ suppressWarning: true });
  syncThoughtDetailTextBlocks();
  syncThoughtDetailEmbeddedHeights();
};

window.addEventListener("resize", handleViewportResize);
window.visualViewport?.addEventListener("resize", handleViewportResize);
window.addEventListener("beforeunload", () => {
  pageUnloading = true;
  invalidateRunSession();
  if (runInFlight || runState === "running") {
    stopCliProgress();
    markInterruptedCliRun();
  }
  revokeThoughtInstructionsObjectUrl();
  revokeColorFontPageRawUrl();
});
window.addEventListener("focus", () => {
  const canSoftRefresh =
    mintFlowState === "path_required" ||
    mintFlowState === "path_ready" ||
    (mintFlowState === "error" && isPathRecoveryError());

  if (
    !canSoftRefresh ||
    !walletState.address ||
    !canContinueWithPathInput() ||
    Date.now() - lastMintSheetFocusRefreshAt < 8000
  ) {
    return;
  }

  lastMintSheetFocusRefreshAt = Date.now();
  void refreshMintSheetPath();
});
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
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mintFlowState !== "closed") {
    closeMintSheet();
  }
});

const initFrontpage = async () => {
  configureGalleryLink();
  document.title = IS_COLOR_FONT_PAGE ? "Color Font" : IS_GALLERY_PAGE ? "Gallery" : "THOUGHT";

  if (IS_COLOR_FONT_PAGE) {
    frontpageStage.classList.add("is-hidden");
    galleryPage.classList.add("is-hidden");
    thoughtPage.classList.add("is-hidden");
    colorFontPage.classList.remove("is-hidden");
    await loadColorFontPage();
    return;
  }

  if (IS_GALLERY_PAGE) {
    frontpageStage.classList.add("is-hidden");
    galleryPage.classList.remove("is-hidden");
    thoughtPage.classList.add("is-hidden");
    colorFontPage.classList.add("is-hidden");
    await loadThoughtGallery();
    return;
  }

  if (IS_THOUGHT_PAGE) {
    frontpageStage.classList.add("is-hidden");
    galleryPage.classList.add("is-hidden");
    thoughtPage.classList.remove("is-hidden");
    colorFontPage.classList.add("is-hidden");
    await loadThoughtDetail();
    return;
  }

  frontpageStage.classList.remove("is-hidden");
  galleryPage.classList.add("is-hidden");
  thoughtPage.classList.add("is-hidden");
  colorFontPage.classList.add("is-hidden");
  loadCliTranscript();
  markInterruptedCliRun();
  loadCliCommandHistory();
  syncInterface();
  resetThought({ preserveStoredOutput: true });
  restoreCurrentOutputSession();
  initializeCliTranscript();
  syncInterface();

  try {
    const handledOpenRouterCallback = await handleOpenRouterCallback();
    if (handledOpenRouterCallback) {
      appendCliOutput(["openrouter linked.", "route: connect", "use: run"]);
    }
    void refreshCurrentModels({ silent: true });
  } catch (error) {
    cleanOpenRouterCallbackUrl();
    const message = error instanceof Error ? error.message : "openrouter connect failed.";
    setWarning(message);
    setStatus("failed.");
    appendCliError(
      message === "openrouter connect failed." ? message : ["openrouter connect failed.", message],
    );
  }

  bindWalletProviderEvents();
  await refreshWalletState();
  syncInterface();

  void ensureActiveThoughtSpec()
    .then(() => {
      syncThoughtInstructionsControls();
    })
    .catch(() => {
      syncThoughtInstructionsControls();
    });

  void document.fonts.load(`100 12px ${CANVAS_TEXT_FAMILY}`).then(() => {
    syncCurrentWorkVisual({ suppressWarning: true });
  });
};

void initFrontpage();
