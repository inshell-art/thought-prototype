export const FP_SCALE = 1000;

export type FixedPoint = number; // integer scaled by FP_SCALE

export const fpFromInt = (value: number): FixedPoint => value * FP_SCALE;

export const fpMul = (a: FixedPoint, b: FixedPoint): FixedPoint =>
  Math.floor((a * b) / FP_SCALE);

export const fpDiv = (a: FixedPoint, b: FixedPoint): FixedPoint =>
  b === 0 ? 0 : Math.floor((a * FP_SCALE) / b);

export const fpMin = (a: FixedPoint, b: FixedPoint): FixedPoint => (a < b ? a : b);

export const fpMax = (a: FixedPoint, b: FixedPoint): FixedPoint => (a > b ? a : b);

export const ceilDiv = (value: number, divisor: number): number => {
  if (divisor <= 0) return 0;
  return Math.floor((value + divisor - 1) / divisor);
};

export const formatFixed = (value: FixedPoint, decimals = 3): string => {
  const scale = 10 ** decimals;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / scale);
  const fracPart = abs % scale;
  return `${sign}${intPart}.${String(fracPart).padStart(decimals, "0")}`;
};

export const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const isqrtRound = (value: number): number => {
  if (value <= 0) return 0;
  let lo = 0;
  let hi = value;
  let floor = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const sq = mid * mid;
    if (sq === value) return mid;
    if (sq < value) {
      floor = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const high = floor + 1;
  const lowDiff = value - floor * floor;
  const highDiff = high * high - value;
  return lowDiff >= highDiff ? high : floor;
};
