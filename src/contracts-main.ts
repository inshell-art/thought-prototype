import { Contract, JsonRpcProvider } from "ethers";

import addresses from "../evm/addresses.anvil.json";
import { DownloadSVG } from "./helpers/download-svg";

// Transitional EVM bridge for local iteration. This path is expected to be replaced
// by the upcoming contract/renderer refactor, so keep changes here narrowly scoped.
type StorageState = {
  account_address: string;
  index: string;
  thoughtStr: string;
  svg: string;
  isLoading: boolean;
};

type EvmAddresses = {
  rpcUrl?: string;
  thoughtPreviewer?: {
    address?: string;
  };
};

const MAX_TEXT_LEN = 23;
const U64_MAX = 18446744073709551615n;
const RPC_URL = (addresses as EvmAddresses).rpcUrl;
const THOUGHT_PREVIEWER_ADDRESS = (addresses as EvmAddresses).thoughtPreviewer?.address;
const THOUGHT_PREVIEWER_ABI = [
  "function preview(uint256 accountAddress, uint64 index, string text) view returns (string)",
] as const;

let provider: JsonRpcProvider | null = null;
let previewer: Contract | null = null;

const storage: StorageState = {
  account_address: "",
  index: "0",
  thoughtStr: "",
  svg: "",
  isLoading: false,
};

const inputBox = document.getElementById("input-box") as HTMLInputElement;
const accountBox = document.getElementById("account-address") as HTMLInputElement;
const indexBox = document.getElementById("index-id") as HTMLInputElement;
const generateButton = document.getElementById("btn-generate") as HTMLButtonElement;
const warningBox = document.getElementById("input-warning") as HTMLElement;
const indexUpButton = document.getElementById("btn-index-up") as HTMLButtonElement;
const indexDownButton = document.getElementById("btn-index-down") as HTMLButtonElement;
const canvasEl = document.getElementById("THOUGHT-canvas") as HTMLElement;
const svgCodeEl = document.getElementById("svg-code") as HTMLElement;

accountBox.value = storage.account_address;
indexBox.value = storage.index;
warningBox.textContent = "";

document.getElementById("btn-save-svg")!.addEventListener("click", () => DownloadSVG(storage.svg));

document.getElementById("btn-copy-svg")?.addEventListener("click", async () => {
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

inputBox.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    void triggerFromInput();
  }
});

generateButton?.addEventListener("click", () => {
  void triggerFromInput();
});

const normalizeInput = (text: string): string => {
  return text
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => {
      const noLeading = line.replace(/^ +/g, "");
      const collapsed = noLeading.replace(/(\S) +(?=\S)/g, "$1 ");
      return collapsed.replace(/ +$/g, "");
    })
    .join("\n");
};

const normalizeAccountAddress = (text: string): string => {
  return text.trim().replace(/\s+/g, "").toLowerCase();
};

const setInputWarning = (message: string) => {
  warningBox.textContent = message;
};

const clearOutput = () => {
  canvasEl.innerHTML = "";
  svgCodeEl.textContent = "";
  storage.svg = "";
};

const setOutput = (svg: string) => {
  canvasEl.innerHTML = svg;
  svgCodeEl.textContent = svg;
  storage.svg = svg;
};

const showError = (message: string) => {
  setInputWarning(message);
  canvasEl.innerHTML = "";
  svgCodeEl.textContent = `Error: ${message}`;
  storage.svg = "";
};

const clampIndex = (value: number) => Math.max(0, value);

const setIndexValue = (value: number) => {
  const clamped = clampIndex(value);
  indexBox.value = String(clamped);
  storage.index = String(clamped);
};

accountBox.addEventListener("input", () => {
  const normalized = normalizeAccountAddress(accountBox.value);
  if (normalized !== accountBox.value) {
    accountBox.value = normalized;
  }
  storage.account_address = normalized || "0";
});

indexBox.addEventListener("input", () => {
  const digitsOnly = indexBox.value.replace(/\D+/g, "");
  if (digitsOnly !== indexBox.value) {
    indexBox.value = digitsOnly;
  }
  storage.index = digitsOnly || "0";
});

indexUpButton?.addEventListener("click", () => {
  const current = Number.parseInt(indexBox.value || "0", 10);
  setIndexValue(Number.isFinite(current) ? current + 1 : 1);
});

indexDownButton?.addEventListener("click", () => {
  const current = Number.parseInt(indexBox.value || "0", 10);
  setIndexValue(Number.isFinite(current) ? current - 1 : 0);
});

const parseUint256Input = (value: string): bigint | null => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return 0n;
  }
  try {
    if (trimmed.startsWith("0x")) {
      return BigInt(trimmed);
    }
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  } catch {
    return null;
  }
  return null;
};

const parseIndexInput = (value: string): bigint | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0n;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = BigInt(trimmed);
  if (parsed > U64_MAX) {
    return null;
  }
  return parsed;
};

const getPreviewer = (): Contract => {
  if (!RPC_URL) {
    throw new Error("RPC URL missing in evm/addresses.anvil.json.");
  }
  if (!THOUGHT_PREVIEWER_ADDRESS) {
    throw new Error("thoughtPreviewer address missing in evm/addresses.anvil.json. Run ./scripts/deploy-evm-local.sh after starting anvil.");
  }
  if (!provider) {
    provider = new JsonRpcProvider(RPC_URL);
  }
  if (!previewer) {
    previewer = new Contract(THOUGHT_PREVIEWER_ADDRESS, THOUGHT_PREVIEWER_ABI, provider);
  }
  return previewer;
};

const extractEvmError = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const withReason = error as { shortMessage?: string; reason?: string; message?: string };
    return withReason.shortMessage ?? withReason.reason ?? withReason.message ?? "Contract call failed";
  }
  return "Contract call failed";
};

const callPreview = async (accountAddress: string, index: string, text: string): Promise<string> => {
  const accountValue = parseUint256Input(accountAddress);
  if (accountValue === null) {
    throw new Error("account_address must be hex (0x...) or digits.");
  }
  const indexValue = parseIndexInput(index);
  if (indexValue === null) {
    throw new Error("index must be an unsigned 64-bit integer.");
  }

  try {
    const contract = getPreviewer();
    return (await contract.preview(accountValue, indexValue, text)) as string;
  } catch (error) {
    throw new Error(extractEvmError(error));
  }
};

const setLoading = (loading: boolean) => {
  storage.isLoading = loading;
  if (generateButton) {
    generateButton.disabled = loading;
  }
};

async function triggerFromInput() {
  if (storage.isLoading) return;
  setInputWarning("");

  const normalizedAccount = normalizeAccountAddress(accountBox.value);
  if (normalizedAccount !== accountBox.value) {
    accountBox.value = normalizedAccount;
  }
  storage.account_address = normalizedAccount || "0";

  const indexDigits = indexBox.value.replace(/\D+/g, "");
  if (indexDigits !== indexBox.value) {
    indexBox.value = indexDigits;
  }
  storage.index = indexDigits || "0";

  const normalizedText = normalizeInput(inputBox.value);
  if (normalizedText !== inputBox.value) {
    inputBox.value = normalizedText;
  }
  if (normalizedText.length > MAX_TEXT_LEN) {
    setInputWarning(`Max ${MAX_TEXT_LEN} characters after trimming/collapsing spaces.`);
    return;
  }

  storage.thoughtStr = normalizedText;

  try {
    setLoading(true);
    clearOutput();
    const svg = await callPreview(storage.account_address, storage.index, storage.thoughtStr);
    setOutput(svg);
  } catch (error) {
    showError(extractEvmError(error));
  } finally {
    setLoading(false);
  }
}
