import addresses from "../contracts/addresses.devnet.json";
import { DownloadSVG } from "./helpers/download-svg";

type StorageState = {
  account_address: string;
  index: string;
  thoughtStr: string;
  svg: string;
  isLoading: boolean;
};

const PREVIEW_SELECTOR =
  "0x0277ac1699ea4fbcffbe82bf94e436b88364a3e238c39d0e07f47f9b4749eeed";
const MAX_TEXT_LEN = 23;
const WORD_BYTES = 31;
const U64_MAX = 18446744073709551615n;
const RPC_URL =
  (addresses as { rpcUrl?: string; rpc?: string }).rpcUrl ??
  (addresses as { rpc?: string }).rpc;
const THOUGHT_PREVIEWER_ADDRESS =
  (addresses as { thoughtPreviewer?: { address?: string } }).thoughtPreviewer?.address ??
  (addresses as { thought_previewer?: { address?: string } }).thought_previewer?.address;

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

const toHex = (value: bigint): string => {
  return value === 0n ? "0x0" : `0x${value.toString(16)}`;
};

const parseFeltInput = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "0x0";
  }
  if (trimmed.startsWith("0x")) {
    try {
      void BigInt(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return toHex(BigInt(trimmed));
};

const parseIndexInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "0x0";
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = BigInt(trimmed);
  if (num > U64_MAX) {
    return null;
  }
  return toHex(num);
};

const encodeByteArray = (text: string): string[] => {
  const bytes = Array.from(new TextEncoder().encode(text));
  const data: bigint[] = [];
  for (let i = 0; i + WORD_BYTES <= bytes.length; i += WORD_BYTES) {
    let word = 0n;
    for (let j = 0; j < WORD_BYTES; j += 1) {
      word = (word << 8n) + BigInt(bytes[i + j]);
    }
    data.push(word);
  }

  const pendingLen = bytes.length % WORD_BYTES;
  let pendingWord = 0n;
  if (pendingLen > 0) {
    for (let i = bytes.length - pendingLen; i < bytes.length; i += 1) {
      pendingWord = (pendingWord << 8n) + BigInt(bytes[i]);
    }
  }

  const calldata: string[] = [toHex(BigInt(data.length))];
  data.forEach((word) => calldata.push(toHex(word)));
  calldata.push(toHex(pendingWord));
  calldata.push(toHex(BigInt(pendingLen)));
  return calldata;
};

const decodeWordBytes = (word: bigint, length: number): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const shift = BigInt(8 * (length - 1 - i));
    const byte = Number((word >> shift) & 0xffn);
    bytes.push(byte);
  }
  return bytes;
};

const decodeByteArray = (felts: string[]): string => {
  if (felts.length < 3) {
    return "";
  }
  const dataLen = Number(BigInt(felts[0]));
  let cursor = 1;
  const bytes: number[] = [];

  for (let i = 0; i < dataLen; i += 1) {
    const word = BigInt(felts[cursor]);
    cursor += 1;
    bytes.push(...decodeWordBytes(word, WORD_BYTES));
  }

  if (cursor >= felts.length) {
    return "";
  }

  const pendingWord = BigInt(felts[cursor]);
  cursor += 1;
  const pendingLen = cursor < felts.length ? Number(BigInt(felts[cursor])) : 0;
  if (pendingLen > 0) {
    bytes.push(...decodeWordBytes(pendingWord, pendingLen));
  }

  return new TextDecoder().decode(Uint8Array.from(bytes));
};

const callPreview = async (accountAddress: string, index: string, text: string): Promise<string> => {
  if (!RPC_URL) {
    throw new Error("RPC URL missing in contracts/addresses.devnet.json.");
  }
  if (!THOUGHT_PREVIEWER_ADDRESS) {
    throw new Error("thought_previewer address missing in contracts/addresses.devnet.json.");
  }
  const accountFelt = parseFeltInput(accountAddress);
  if (!accountFelt) {
    throw new Error("account_address must be hex (0x...) or digits.");
  }
  const indexFelt = parseIndexInput(index);
  if (!indexFelt) {
    throw new Error("index must be an unsigned 64-bit integer.");
  }

  const byteArrayCalldata = encodeByteArray(text);
  const calldata = [accountFelt, indexFelt, ...byteArrayCalldata];

  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "starknet_call",
    params: [
      {
        contract_address: THOUGHT_PREVIEWER_ADDRESS,
        entry_point_selector: PREVIEW_SELECTOR,
        calldata,
      },
      "latest",
    ],
  };

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`RPC error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    const message = data.error.message || "RPC call failed";
    throw new Error(message);
  }

  const result = data.result as string[];
  if (!Array.isArray(result)) {
    throw new Error("RPC result missing.");
  }

  return decodeByteArray(result);
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
    const message = error instanceof Error ? error.message : "Contract call failed";
    showError(message);
  } finally {
    setLoading(false);
  }
}
