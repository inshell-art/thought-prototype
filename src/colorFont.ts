export type ColorFont = Record<string, string>;
export type ColorFontData = { map: ColorFont; names: string[] };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type DColorEntry = { hex?: string; name?: string };
type DColorsPayload = { colors?: DColorEntry[] };

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function hslToHex(h: number, s: number, l: number) {
  // h: [0, 360), s/l: [0, 100]
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s / 100);
  const ll = clamp01(l / 100);

  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const x = ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function defaultNames(): string[] {
  return LETTERS.split("");
}

export function generateDemoColorFont(): ColorFontData {
  const map: ColorFont = { " ": "transparent" };
  for (let i = 0; i < LETTERS.length; i++) {
    const h = Math.round((i / LETTERS.length) * 360);
    map[LETTERS[i]] = hslToHex(h, 85, 55);
  }
  return { map, names: defaultNames() };
}

export function normalizeColorFont(raw: unknown): ColorFont {
  const map: ColorFont = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") map[k] = v;
    }
  }

  // Guarantee required keys.
  if (!map[" "]) map[" "] = "transparent";
  for (const ch of LETTERS) {
    if (!map[ch]) map[ch] = "#ffffff";
  }

  return map;
}

function colorFontFromDColors(raw: unknown): ColorFontData | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as DColorsPayload;
  if (!Array.isArray(payload.colors)) return null;

  const map: ColorFont = { " ": "transparent" };
  const names = defaultNames();

  for (let i = 0; i < LETTERS.length; i++) {
    const entry = payload.colors[i];
    const hex = entry?.hex;
    const name = entry?.name;
    map[LETTERS[i]] = typeof hex === "string" ? hex.toLowerCase() : "#ffffff";
    if (typeof name === "string" && name.trim()) names[i] = name.trim();
  }

  return { map, names };
}

function colorFontFromMap(raw: unknown): ColorFontData | null {
  const map = normalizeColorFont(raw);
  if (!map) return null;
  return { map, names: defaultNames() };
}

export function parseColorFontJson(raw: unknown): ColorFontData | null {
  return colorFontFromDColors(raw) ?? colorFontFromMap(raw);
}

async function tryLoad(url: string, parser: (raw: unknown) => ColorFontData | null): Promise<ColorFontData | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const raw = await res.json();
  return parser(raw);
}

export async function loadColorFont(): Promise<ColorFontData> {
  try {
    const fromDColors = await tryLoad("/d-colors.json", colorFontFromDColors);
    if (fromDColors) return fromDColors;

    const fromMap = await tryLoad("/color-font.json", colorFontFromMap);
    if (fromMap) return fromMap;
  } catch {
    // fall through to demo
  }
  return generateDemoColorFont();
}
