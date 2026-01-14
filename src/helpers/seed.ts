const RNG_MOD = 1329227995784915872903807060280344576n; // 2^120
const U128_MASK = (1n << 128n) - 1n;

const parseBigInt = (value: string): bigint => {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  try {
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      return BigInt(trimmed);
    }
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  } catch {
    return 0n;
  }
  return 0n;
};

const modU128 = (value: bigint): bigint => {
  const mod = value % RNG_MOD;
  return mod < 0n ? mod + RNG_MOD : mod;
};

export const computeSeed128 = (accountAddress: string, index: string, text: string): bigint => {
  const account = parseBigInt(accountAddress);
  const low = account & U128_MASK;
  const high = (account >> 128n) & U128_MASK;
  let state = modU128(low ^ high);

  const idx = parseBigInt(index);
  state = modU128(state + idx);

  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    state = modU128(state * 131n + BigInt(byte));
  }

  return state;
};

export const computeSeed32 = (accountAddress: string, index: string, text: string): number => {
  const seed128 = computeSeed128(accountAddress, index, text);
  const seed32 = Number(seed128 & 0xffff_ffffn);
  return seed32 >>> 0;
};
