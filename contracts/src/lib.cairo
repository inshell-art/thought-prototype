use core::array::ArrayTrait;
use core::byte_array::{ByteArray, ByteArrayTrait};
use core::dict::{Felt252Dict, Felt252DictTrait};
use core::integer::{u128_safe_divmod, u256};
use core::traits::{Into, TryInto};
use core::zeroable::NonZero;
use starknet::ContractAddress;

const MAX_TEXT_LEN: usize = 23;
const MAX_PALETTE: usize = 64;
const MAX_PATTERNS: usize = 1024;
const N: usize = 2;
const WHITE_R: u8 = 255;
const WHITE_G: u8 = 255;
const WHITE_B: u8 = 255;
const WHITE_A: u8 = 255;
const BLACK_R: u8 = 0;
const BLACK_G: u8 = 0;
const BLACK_B: u8 = 0;
const BLACK_INDEX: u16 = 0xfffe;
const RNG_MOD: u128 = 1329227995784915872903807060280344576_u128;
const FP_SCALE: u32 = 1000_u32;
const U32_MOD: u128 = 4294967296_u128;
const LCG_A: u128 = 1664525_u128;
const LCG_C: u128 = 1013904223_u128;
const SEED_TAG_SAMPLE: u32 = 0x53414d50_u32;
const SEED_TAG_WFC: u32 = 0x57464330_u32;
const SEED_TAG_VISUAL: u32 = 0x56495330_u32;
const DEFAULT_MAX_TICKS: u64 = 50000_u64;

const STATUS_OK: u8 = 0_u8;
const STATUS_EXHAUSTED: u8 = 1_u8;
const STATUS_CONTRADICTION: u8 = 2_u8;
const NO_CONTRADICTION_CELL: u32 = 0xffffffff_u32;
const SVG_CLOSEOUT_RESERVE_TICKS: u64 = 5000_u64;

const PHASE_SEED: u8 = 0_u8;
const PHASE_PALETTE: u8 = 1_u8;
const PHASE_PATTERNS: u8 = 2_u8;
const PHASE_PROPAGATOR: u8 = 3_u8;
const PHASE_WFC_INIT: u8 = 4_u8;
const PHASE_WFC_OBSERVE: u8 = 5_u8;
const PHASE_WFC_PROPAGATE: u8 = 6_u8;
const PHASE_FRAME_RENDER: u8 = 7_u8;
const PHASE_TITLE_RENDER: u8 = 8_u8;
const PHASE_SVG_FINALIZE: u8 = 9_u8;

#[derive(Copy, Drop)]
struct TickState {
    ticks_used: u64,
    max_ticks: u64,
    exhausted: bool,
    phase: u8,
}

fn tick_state_new(max_ticks: u64) -> TickState {
    TickState { ticks_used: 0_u64, max_ticks, exhausted: false, phase: PHASE_SEED }
}

fn set_phase(ref state: TickState, phase: u8) {
    state.phase = phase;
}

fn tick(ref state: TickState, amount: u64) -> bool {
    if state.exhausted {
        return false;
    }
    let next = state.ticks_used + amount;
    state.ticks_used = next;
    if next > state.max_ticks {
        state.exhausted = true;
        return false;
    }
    true
}

fn ticks_remaining(ref state: TickState) -> u64 {
    if state.ticks_used >= state.max_ticks {
        0_u64
    } else {
        state.max_ticks - state.ticks_used
    }
}

fn ensure_budget(ref state: TickState, needed: u64) -> bool {
    let remaining = ticks_remaining(ref state);
    if remaining <= needed {
        state.exhausted = true;
        return false;
    }
    true
}

#[derive(Copy, Drop)]
struct Color {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

#[derive(Copy, Drop)]
struct Rng {
    state: u32,
}

fn rng_new(seed: u32) -> Rng {
    Rng { state: seed }
}

fn rng_next_u8(ref rng: Rng) -> u8 {
    let next: u128 = rng_next_u32(ref rng).into();
    let value = mod_u128(next, 256_u128);
    value.try_into().unwrap()
}

fn rng_next_usize(ref rng: Rng, max: usize) -> usize {
    if max == 0 {
        return 0;
    }
    let next: u128 = rng_next_u32(ref rng).into();
    let max_u128: u128 = max.try_into().unwrap();
    let value = mod_u128(next, max_u128);
    value.try_into().unwrap()
}

fn mod_u128(value: u128, modulus: u128) -> u128 {
    let modulus_nz: NonZero<u128> = modulus.try_into().unwrap();
    let (_, rem) = u128_safe_divmod(value, modulus_nz);
    rem
}

fn rng_next_u32(ref rng: Rng) -> u32 {
    let next: u128 = rng.state.into();
    let next = next * LCG_A + LCG_C;
    let value = mod_u128(next, U32_MOD);
    let out: u32 = value.try_into().unwrap();
    rng.state = out;
    out
}

fn mix_seed(seed: u32, tag: u32) -> u32 {
    seed ^ tag
}

fn rng_bool(ref rng: Rng) -> bool {
    (rng_next_u32(ref rng) & 1_u32) == 1_u32
}

fn remap_fixed(min: u32, max: u32, ref rng: Rng) -> u32 {
    if min > max {
        return remap_fixed(max, min, ref rng);
    }
    let range = max - min;
    if range == 0_u32 {
        return min;
    }
    let rand: u128 = rng_next_u32(ref rng).into();
    let range_u128: u128 = range.into();
    let value = (rand * range_u128) / U32_MOD;
    let value_u32: u32 = value.try_into().unwrap();
    min + value_u32
}

fn truncate_text(text: @ByteArray, max_len: usize, ref state: TickState) -> ByteArray {
    let mut out: ByteArray = "";
    let len = text.len();
    let limit = if len > max_len { max_len } else { len };
    let mut i = 0;
    while i < limit {
        if !tick(ref state, 1_u64) {
            break;
        }
        let byte = text.at(i).unwrap();
        out.append_byte(byte);
        i += 1;
    }
    out
}

fn compute_seed_u128(account_address: ContractAddress, index: u64, text: @ByteArray) -> u128 {
    let account_felt: felt252 = account_address.into();
    let account_u256: u256 = account_felt.into();
    let mut state: u128 = account_u256.low ^ account_u256.high;
    let index_u128: u128 = index.into();
    state = mod_u128(state + index_u128, RNG_MOD);
    let len = text.len();
    let mut i = 0;
    while i < len {
        let byte = text.at(i).unwrap();
        let byte_u128: u128 = byte.into();
        state = mod_u128(state * 131_u128 + byte_u128, RNG_MOD);
        i += 1;
    }
    state
}

fn compute_seed(account_address: ContractAddress, index: u64, text: @ByteArray) -> felt252 {
    let seed_u128 = compute_seed_u128(account_address, index, text);
    seed_u128.into()
}

fn compute_seed32(account_address: ContractAddress, index: u64, text: @ByteArray) -> u32 {
    let seed_u128 = compute_seed_u128(account_address, index, text);
    let masked = mod_u128(seed_u128, U32_MOD);
    masked.try_into().unwrap()
}

fn compute_seed_u128_with_ticks(
    account_address: ContractAddress,
    index: u64,
    text: @ByteArray,
    ref state: TickState,
) -> u128 {
    let account_felt: felt252 = account_address.into();
    let account_u256: u256 = account_felt.into();
    let mut seed: u128 = account_u256.low ^ account_u256.high;
    let index_u128: u128 = index.into();
    seed = mod_u128(seed + index_u128, RNG_MOD);
    let len = text.len();
    let mut i = 0;
    while i < len {
        if !tick(ref state, 2_u64) {
            break;
        }
        let byte = text.at(i).unwrap();
        let byte_u128: u128 = byte.into();
        seed = mod_u128(seed * 131_u128 + byte_u128, RNG_MOD);
        i += 1;
    }
    seed
}

fn compute_seed32_with_ticks(
    account_address: ContractAddress,
    index: u64,
    text: @ByteArray,
    ref state: TickState,
) -> u32 {
    let seed_u128 = compute_seed_u128_with_ticks(account_address, index, text, ref state);
    let masked = mod_u128(seed_u128, U32_MOD);
    masked.try_into().unwrap()
}

fn isqrt_round(value: u32) -> u32 {
    if value == 0_u32 {
        return 0_u32;
    }
    let mut lo: u32 = 0_u32;
    let mut hi: u32 = value;
    let mut floor: u32 = 0_u32;

    loop {
        if lo > hi {
            break;
        }
        let mid = (lo + hi) / 2_u32;
        let mid_u128: u128 = mid.into();
        let sq: u128 = mid_u128 * mid_u128;
        let val_u128: u128 = value.into();
        if sq == val_u128 {
            return mid;
        }
        if sq < val_u128 {
            floor = mid;
            lo = mid + 1_u32;
        } else {
            if mid == 0_u32 {
                break;
            }
            hi = mid - 1_u32;
        }
    }

    let high = floor + 1_u32;
    let floor_u128: u128 = floor.into();
    let high_u128: u128 = high.into();
    let val_u128: u128 = value.into();
    let low_diff = val_u128 - floor_u128 * floor_u128;
    let high_diff = high_u128 * high_u128 - val_u128;
    if low_diff >= high_diff { high } else { floor }
}

fn compute_n(len: usize) -> usize {
    if len > 5 {
        let adjusted: u32 = (len - 5).try_into().unwrap();
        let root = isqrt_round(adjusted);
        return 5 + root.into();
    }
    len + 1
}

fn fp_mul(a: u32, b: u32) -> u32 {
    let prod: u128 = a.into() * b.into();
    let scaled = prod / FP_SCALE.into();
    scaled.try_into().unwrap()
}

fn fp_div(a: u32, b: u32) -> u32 {
    if b == 0_u32 {
        return 0_u32;
    }
    let num: u128 = a.into() * FP_SCALE.into();
    let div = num / b.into();
    div.try_into().unwrap()
}

fn ceil_div(value: usize, divisor: usize) -> usize {
    if divisor == 0 {
        return 0;
    }
    (value + divisor - 1) / divisor
}

fn append_digit(ref svg: ByteArray, digit: u32) {
    let d = if digit > 9_u32 { digit % 10_u32 } else { digit };
    let ch: u8 = (d + 48_u32).try_into().unwrap();
    svg.append_byte(ch);
}

fn append_fixed(ref svg: ByteArray, value: u32, decimals: u32) {
    let scale = if decimals == 3_u32 {
        1000_u32
    } else if decimals == 1_u32 {
        10_u32
    } else {
        1_u32
    };
    let int_part = value / scale;
    let frac = value % scale;
    append_number(ref svg, int_part);
    svg.append_byte(46_u8); // '.'
    if decimals == 3_u32 {
        append_digit(ref svg, frac / 100_u32);
        append_digit(ref svg, (frac / 10_u32) % 10_u32);
        append_digit(ref svg, frac % 10_u32);
    } else if decimals == 1_u32 {
        append_digit(ref svg, frac);
    }
}

fn append_hex_nibble(ref svg: ByteArray, value: u8) {
    let digit: u8 = if value < 10_u8 { value + 48_u8 } else { value - 10_u8 + 97_u8 };
    svg.append_byte(digit);
}

fn append_hex_byte(ref svg: ByteArray, value: u8) {
    append_hex_nibble(ref svg, value / 16_u8);
    append_hex_nibble(ref svg, value % 16_u8);
}

fn append_rgba_hex(ref svg: ByteArray, color: Color) {
    svg.append_byte(35_u8); // '#'
    append_hex_byte(ref svg, color.r);
    append_hex_byte(ref svg, color.g);
    append_hex_byte(ref svg, color.b);
    append_hex_byte(ref svg, color.a);
}

fn encode_color_key(r: u8, g: u8, b: u8, a: u8) -> u32 {
    let r_u32: u32 = r.into();
    let g_u32: u32 = g.into();
    let b_u32: u32 = b.into();
    let a_u32: u32 = a.into();
    r_u32 * 16_777_216_u32 + g_u32 * 65_536_u32 + b_u32 * 256_u32 + a_u32
}

fn decode_color_key(key: u32) -> Color {
    let r = key / 16_777_216_u32;
    let g = (key / 65_536_u32) % 256_u32;
    let b = (key / 256_u32) % 256_u32;
    let a = key % 256_u32;
    Color {
        r: r.try_into().unwrap(),
        g: g.try_into().unwrap(),
        b: b.try_into().unwrap(),
        a: a.try_into().unwrap(),
    }
}

fn split_words(text: @ByteArray, ref state: TickState) -> Array<ByteArray> {
    let mut words: Array<ByteArray> = ArrayTrait::new();
    let mut current: ByteArray = "";
    let len = text.len();
    let mut i = 0;
    while i < len {
        if !tick(ref state, 1_u64) {
            break;
        }
        let byte = text.at(i).unwrap();
        if byte == 10_u8 {
            words.append(current);
            current = "";
            i += 1;
            continue;
        }
        if byte == 32_u8 {
            let mut j = i;
            while j < len {
                if !tick(ref state, 1_u64) {
                    break;
                }
                let next = text.at(j).unwrap();
                if next != 32_u8 {
                    break;
                }
                j += 1;
            }
            let count = j - i;
            if current.len() > 0 {
                words.append(current);
                current = "";
                let leading = if count > 0 { count - 1 } else { 0 };
                let mut k = 0;
                while k < leading {
                    current.append_byte(32_u8);
                    k += 1;
                }
            } else {
                let mut k = 0;
                while k < count {
                    current.append_byte(32_u8);
                    k += 1;
                }
            }
            i = j;
            continue;
        }
        current.append_byte(byte);
        i += 1;
    }
    if current.len() > 0 {
        words.append(current);
    }
    words
}

fn build_char_color_map(
    words: @Array<ByteArray>,
    seed: u32,
    ref state: TickState,
) -> Felt252Dict<u32> {
    let mut rng = rng_new(seed);
    let mut char_map: Felt252Dict<u32> = Default::default();
    let white_key = encode_color_key(WHITE_R, WHITE_G, WHITE_B, WHITE_A);
    char_map.insert(32, white_key);
    char_map.insert(10, white_key);

    let word_count = words.len();
    let mut w = 0;
    while w < word_count {
        if state.exhausted {
            break;
        }
        let word = words.get(w).unwrap();
        let word_len = word.len();
        let mut i = 0;
        while i < word_len {
            if !tick(ref state, 2_u64) {
                break;
            }
            let byte = word.at(i).unwrap();
            let key: felt252 = byte.into();
            let existing = char_map.get(key);
            if existing == 0 {
                if byte == 32_u8 || byte == 10_u8 {
                    char_map.insert(key, white_key);
                } else {
                    let r = rng_next_u8(ref rng);
                    let g = rng_next_u8(ref rng);
                    let b = rng_next_u8(ref rng);
                    let color_key = encode_color_key(r, g, b, WHITE_A);
                    char_map.insert(key, color_key);
                }
            }
            i += 1;
        }
        w += 1;
    }
    char_map
}

fn build_char_grid(
    words: @Array<ByteArray>,
    word_max_len: usize,
    ref state: TickState,
) -> Felt252Dict<u8> {
    let mut grid: Felt252Dict<u8> = Default::default();
    let word_count = words.len();
    let mut y = 0;
    while y < word_count {
        if state.exhausted {
            break;
        }
        let word = words.get(y).unwrap();
        let word_len = word.len();
        let mut x = 0;
        while x < word_len {
            if !tick(ref state, 1_u64) {
                break;
            }
            let byte = word.at(x).unwrap();
            let idx = y * word_max_len + x;
            let key: felt252 = idx.into();
            let stored: u8 = byte + 1_u8;
            grid.insert(key, stored);
            x += 1;
        }
        y += 1;
    }
    grid
}

fn build_palette_and_sample(
    text: @ByteArray,
    seed: u32,
    ref state: TickState,
) -> (
    Array<Color>,
    Array<u16>,
    usize,
    usize,
    Option<u16>,
    Felt252Dict<u32>,
) {
    let words = split_words(text, ref state);
    let mut word_max_len = 0;
    let word_count = words.len();
    let mut i = 0;
    while i < word_count {
        if state.exhausted {
            break;
        }
        let word = words.get(i).unwrap();
        let len = word.len();
        if len > word_max_len {
            word_max_len = len;
        }
        i += 1;
    }

    let mut char_colors = build_char_color_map(@words, seed, ref state);
    let mut char_grid = build_char_grid(@words, word_max_len, ref state);

    let tile_px: usize = 2;
    let data_width = word_max_len * tile_px;
    let data_height = word_count * tile_px;

    let mut palette: Array<Color> = ArrayTrait::new();
    let mut palette_map: Felt252Dict<u16> = Default::default();
    let mut sample: Array<u16> = ArrayTrait::new();
    let mut blank_index: Option<u16> = Option::None;

    let mut y = 0;
    while y < data_height {
        if state.exhausted {
            break;
        }
        let mut x = 0;
        while x < data_width {
            if !tick(ref state, 1_u64) {
                break;
            }
            let char_x = x / tile_px;
            let char_y = y / tile_px;
            let idx = char_y * word_max_len + char_x;
            let key: felt252 = idx.into();
            let stored = char_grid.get(key);
            let color_key_u32 = if stored == 0 {
                0_u32
            } else {
                let byte: u8 = stored - 1_u8;
                let byte_key: felt252 = byte.into();
                let color_key = char_colors.get(byte_key);
                if color_key == 0 {
                    0_u32
                } else {
                    color_key.try_into().unwrap()
                }
            };

            let palette_key: felt252 = color_key_u32.into();
            let existing = palette_map.get(palette_key);
            let palette_index = if existing == 0 {
                let _ = tick(ref state, 5_u64);
                let color = decode_color_key(color_key_u32);
                palette.append(color);
                let index_u16: u16 = (palette.len() - 1).try_into().unwrap();
                palette_map.insert(palette_key, index_u16 + 1);
                if color_key_u32 == 0_u32 {
                    blank_index = Option::Some(index_u16);
                }
                index_u16
            } else {
                existing - 1
            };

            sample.append(palette_index);
            x += 1;
        }
        y += 1;
    }

    let _ = char_grid.squash();
    let _ = palette_map.squash();
    (palette, sample, data_width, data_height, blank_index, char_colors)
}

fn sample_at(sample: @Array<u16>, width: usize, x: usize, y: usize) -> u16 {
    let idx = y * width + x;
    *sample.get(idx).unwrap().deref()
}

fn encode_pattern(p0: u16, p1: u16, p2: u16, p3: u16, base: u16) -> felt252 {
    let base_felt: felt252 = base.into();
    let mut value: felt252 = p0.into();
    value = value * base_felt + p1.into();
    value = value * base_felt + p2.into();
    value = value * base_felt + p3.into();
    value
}

fn rotate_pattern(p0: u16, p1: u16, p2: u16, p3: u16) -> (u16, u16, u16, u16) {
    (p1, p3, p0, p2)
}

fn reflect_pattern(p0: u16, p1: u16, p2: u16, p3: u16) -> (u16, u16, u16, u16) {
    (p1, p0, p3, p2)
}

fn pattern_has_blank(
    blank_index: Option<u16>,
    p0: u16,
    p1: u16,
    p2: u16,
    p3: u16,
) -> bool {
    match blank_index {
        Option::None => false,
        Option::Some(blank) => p0 == blank || p1 == blank || p2 == blank || p3 == blank,
    }
}

fn build_patterns(
    sample: @Array<u16>,
    width: usize,
    height: usize,
    palette_len: u16,
    blank_index: Option<u16>,
    ref state: TickState,
) -> (Array<u16>, Felt252Dict<u16>, usize) {
    let mut patterns: Array<u16> = ArrayTrait::new();
    let mut pattern_map: Felt252Dict<u16> = Default::default();
    let mut weights: Felt252Dict<u16> = Default::default();
    let mut pattern_count = 0;

    if width < N || height < N {
        return (patterns, weights, 0);
    }

    let mut y = 0;
    while y < height {
        if state.exhausted {
            break;
        }
        let mut x = 0;
        while x < width {
            if !tick(ref state, 1_u64) {
                break;
            }
            let p0 = sample_at(sample, width, x % width, y % height);
            let p1 = sample_at(sample, width, (x + 1) % width, y % height);
            let p2 = sample_at(sample, width, x % width, (y + 1) % height);
            let p3 = sample_at(sample, width, (x + 1) % width, (y + 1) % height);

            if !pattern_has_blank(blank_index, p0, p1, p2, p3) {
                let r0 = (p0, p1, p2, p3);
                let r1 = reflect_pattern(p0, p1, p2, p3);
                let r2 = rotate_pattern(p0, p1, p2, p3);
                let (r2a, r2b, r2c, r2d) = r2;
                let r3 = reflect_pattern(r2a, r2b, r2c, r2d);
                let r4 = rotate_pattern(r2a, r2b, r2c, r2d);
                let (r4a, r4b, r4c, r4d) = r4;
                let r5 = reflect_pattern(r4a, r4b, r4c, r4d);
                let r6 = rotate_pattern(r4a, r4b, r4c, r4d);
                let (r6a, r6b, r6c, r6d) = r6;
                let r7 = reflect_pattern(r6a, r6b, r6c, r6d);

                let mut k: u32 = 0_u32;
                while k < 8_u32 {
                    if !tick(ref state, 1_u64) {
                        break;
                    }
                    let (a, b, c, d) = match k {
                        0_u32 => r0,
                        1_u32 => r1,
                        2_u32 => r2,
                        3_u32 => r3,
                        4_u32 => r4,
                        5_u32 => r5,
                        6_u32 => r6,
                        _ => r7,
                    };
                    let key = encode_pattern(a, b, c, d, palette_len);
                    let existing = pattern_map.get(key);
                    if existing == 0 {
                        let _ = tick(ref state, 2_u64);
                        if pattern_count < MAX_PATTERNS {
                            patterns.append(a);
                            patterns.append(b);
                            patterns.append(c);
                            patterns.append(d);
                            pattern_count += 1;
                            let stored: u16 = pattern_count.try_into().unwrap();
                            pattern_map.insert(key, stored);
                            let weight_key: felt252 = (stored - 1_u16).into();
                            weights.insert(weight_key, 1);
                        }
                    } else {
                        let _ = tick(ref state, 2_u64);
                        let weight_key: felt252 = (existing - 1_u16).into();
                        let current = weights.get(weight_key);
                        weights.insert(weight_key, current + 1);
                    }
                    k += 1_u32;
                }
            }
            x += 1;
        }
        y += 1;
    }

    let _ = pattern_map.squash();
    (patterns, weights, pattern_count)
}

fn pattern_at(patterns: @Array<u16>, t: usize, idx: usize) -> u16 {
    let offset = t * 4 + idx;
    *patterns.get(offset).unwrap().deref()
}

fn pattern_agrees(patterns: @Array<u16>, t1: usize, t2: usize, dir: u8) -> bool {
    let a1 = pattern_at(patterns, t1, 0);
    let b1 = pattern_at(patterns, t1, 1);
    let c1 = pattern_at(patterns, t1, 2);
    let d1 = pattern_at(patterns, t1, 3);

    let a2 = pattern_at(patterns, t2, 0);
    let b2 = pattern_at(patterns, t2, 1);
    let c2 = pattern_at(patterns, t2, 2);
    let d2 = pattern_at(patterns, t2, 3);

    match dir {
        0 => a1 == b2 && c1 == d2, // left
        1 => c1 == a2 && d1 == b2, // down
        2 => b1 == a2 && d1 == c2, // right
        _ => a1 == c2 && b1 == d2, // up
    }
}

fn prop_index(dir: u32, t: usize, pattern_count: usize) -> usize {
    let dir_usize: usize = dir.try_into().unwrap();
    dir_usize * pattern_count + t
}

fn build_propagator(
    patterns: @Array<u16>,
    pattern_count: usize,
    ref state: TickState,
) -> (Array<u32>, Array<u16>) {
    let mut starts: Array<u32> = ArrayTrait::new();
    let mut list: Array<u16> = ArrayTrait::new();
    let mut total: u32 = 0;

    let mut dir: u32 = 0;
    while dir < 4_u32 {
        if state.exhausted {
            break;
        }
        let mut t = 0;
        while t < pattern_count {
            if state.exhausted {
                break;
            }
            starts.append(total);
            let mut t2 = 0;
            while t2 < pattern_count {
                if !tick(ref state, 1_u64) {
                    break;
                }
                if pattern_agrees(patterns, t, t2, dir.try_into().unwrap()) {
                    list.append(t2.try_into().unwrap());
                    total += 1_u32;
                }
                t2 += 1;
            }
            t += 1;
        }
        dir += 1_u32;
    }
    starts.append(total);
    (starts, list)
}

fn wave_key(cell: usize, t: usize, pattern_count: usize) -> felt252 {
    let idx = cell * pattern_count + t;
    idx.into()
}

fn count_key(cell: usize) -> felt252 {
    cell.into()
}

fn compat_key(cell: usize, t: usize, dir: u32, pattern_count: usize) -> felt252 {
    let dir_usize: usize = dir.try_into().unwrap();
    let idx = (cell * pattern_count + t) * 4 + dir_usize;
    idx.into()
}

fn on_boundary(x: usize, y: usize, grid_size: usize, periodic: bool) -> bool {
    if periodic {
        return false;
    }
    x + N > grid_size || y + N > grid_size
}

fn ban(
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    ref queue: Array<(usize, usize)>,
    ref contradiction_cell: Option<usize>,
    cell: usize,
    t: usize,
    pattern_count: usize,
) {
    let key = wave_key(cell, t, pattern_count);
    let current = wave.get(key);
    if current == 0 {
        return;
    }
    wave.insert(key, 0);

    let count_key = count_key(cell);
    let count = counts.get(count_key);
    if count > 0 {
        counts.insert(count_key, count - 1);
        if count - 1 == 0 {
            if contradiction_cell.is_none() {
                contradiction_cell = Option::Some(cell);
            }
        }
    }
    queue.append((cell, t));
}

fn wfc_generate(
    patterns: @Array<u16>,
    pattern_count: usize,
    grid_size: usize,
    seed: u32,
) -> (Array<u16>, Option<usize>) {
    let mut rng = rng_new(seed);
    let cells = grid_size * grid_size;

    let mut wave: Felt252Dict<u8> = Default::default();
    let mut counts: Felt252Dict<u16> = Default::default();
    let mut queue: Array<(usize, usize)> = ArrayTrait::new();

    let mut cell = 0;
    while cell < cells {
        let mut t = 0;
        while t < pattern_count {
            let key = wave_key(cell, t, pattern_count);
            wave.insert(key, 1);
            t += 1;
        }
        counts.insert(count_key(cell), pattern_count.try_into().unwrap());
        cell += 1;
    }

    let mut contradiction_cell: Option<usize> = Option::None;

    loop {
        let mut min_count: u16 = 0xffff;
        let mut target: Option<usize> = Option::None;
        let mut i = 0;
        while i < cells {
            let count = counts.get(count_key(i));
            if count == 0 {
                if contradiction_cell.is_none() {
                    contradiction_cell = Option::Some(i);
                }
                break;
            }
            if count > 1 && count < min_count {
                min_count = count;
                target = Option::Some(i);
            }
            i += 1;
        }

        if contradiction_cell.is_some() {
            break;
        }

        match target {
            Option::None => {
                break;
            },
            Option::Some(cell_index) => {
                let pick = rng_next_usize(ref rng, min_count.into());
                let mut seen = 0;
                let mut choice = 0;
                let mut t = 0;
                while t < pattern_count {
                    let key = wave_key(cell_index, t, pattern_count);
                    if wave.get(key) == 1 {
                        if seen == pick {
                            choice = t;
                            break;
                        }
                        seen += 1;
                    }
                    t += 1;
                }

                let mut t2 = 0;
                while t2 < pattern_count {
                    if t2 != choice {
                        ban(
                            ref wave,
                            ref counts,
                            ref queue,
                            ref contradiction_cell,
                            cell_index,
                            t2,
                            pattern_count,
                        );
                    }
                    t2 += 1;
                }

                loop {
                    match queue.pop_front() {
                        Option::None => {
                            break;
                        },
                        Option::Some((cell_a, pattern_a)) => {
                            let x = cell_a % grid_size;
                            let y = cell_a / grid_size;
                            let mut dir = 0_u8;
                            while dir < 4_u8 {
                                let (nx, ny) = match dir {
                                    0_u8 => {
                                        let nx = if x == 0 { grid_size - 1 } else { x - 1 };
                                        (nx, y)
                                    },
                                    1_u8 => {
                                        let ny = if y + 1 >= grid_size { 0 } else { y + 1 };
                                        (x, ny)
                                    },
                                    2_u8 => {
                                        let nx = if x + 1 >= grid_size { 0 } else { x + 1 };
                                        (nx, y)
                                    },
                                    _ => {
                                        let ny = if y == 0 { grid_size - 1 } else { y - 1 };
                                        (x, ny)
                                    },
                                };

                                let neighbor = ny * grid_size + nx;
                                let mut t = 0;
                                while t < pattern_count {
                                    let key = wave_key(neighbor, t, pattern_count);
                                    if wave.get(key) == 1 {
                                        if !pattern_agrees(patterns, pattern_a, t, dir) {
                                            ban(
                                                ref wave,
                                                ref counts,
                                                ref queue,
                                                ref contradiction_cell,
                                                neighbor,
                                                t,
                                                pattern_count,
                                            );
                                            if contradiction_cell.is_some() {
                                                break;
                                            }
                                        }
                                    }
                                    t += 1;
                                }
                                if contradiction_cell.is_some() {
                                    break;
                                }
                                dir += 1_u8;
                            }
                            if contradiction_cell.is_some() {
                                break;
                            }
                        },
                    }
                    if contradiction_cell.is_some() {
                        break;
                    }
                }
                if contradiction_cell.is_some() {
                    break;
                }
            },
        }
    }

    let mut output: Array<u16> = ArrayTrait::new();
    let mut i = 0;
    while i < cells {
        if let Option::Some(bad) = contradiction_cell {
            if bad == i {
                output.append(BLACK_INDEX);
                i += 1;
                continue;
            }
        }
        let mut t = 0;
        let mut chosen = 0_u16;
        while t < pattern_count {
            let key = wave_key(i, t, pattern_count);
            if wave.get(key) == 1 {
                let p0 = pattern_at(patterns, t, 0);
                chosen = p0;
                break;
            }
            t += 1;
        }
        output.append(chosen);
        i += 1;
    }

    let _ = wave.squash();
    let _ = counts.squash();
    (output, contradiction_cell)
}

fn fallback_grid(grid_size: usize) -> Array<u16> {
    let mut output: Array<u16> = ArrayTrait::new();
    let mut i = 0;
    while i < grid_size * grid_size {
        output.append(0);
        i += 1;
    }
    output
}

fn append_number(ref svg: ByteArray, value: u32) {
    let s = format!("{}", value);
    svg.append(@s);
}

fn append_byte(ref svg: ByteArray, value: u8) {
    let s = format!("{}", value);
    svg.append(@s);
}

fn render_exhausted_svg(text: @ByteArray, phase: u8) -> ByteArray {
    let mut svg: ByteArray = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\" viewBox=\"0 0 10 10\">";
    svg.append(@"<rect width=\"100%\" height=\"100%\" fill=\"#0a0a0a\"/>");
    svg.append(@"<text x=\"1\" y=\"2\" font-family=\"monospace\" font-size=\"0.6\" fill=\"#ffffff\">fuel exhausted</text>");
    svg.append(@"<text x=\"1\" y=\"3\" font-family=\"monospace\" font-size=\"0.4\" fill=\"#ffffff\">phase: ");
    let phase_u32: u32 = phase.into();
    append_number(ref svg, phase_u32);
    svg.append(@"</text>");
    svg.append(@"<text x=\"1\" y=\"4\" font-family=\"monospace\" font-size=\"0.4\" fill=\"#ffffff\">");
    svg.append(text);
    svg.append(@"</text>");
    svg.append(@"</svg>");
    svg
}

fn svg_from_grid(
    palette: @Array<Color>,
    grid: @Array<u16>,
    grid_size: usize,
    account_address: ContractAddress,
    index: u64,
    text: @ByteArray,
    contradiction: Option<usize>,
) -> ByteArray {
    let size: u32 = 256;
    let padding: u32 = 16;
    let top_offset: u32 = 64;
    let grid_width: u32 = size - padding * 2;
    let grid_height: u32 = size - top_offset - padding;
    let span: u32 = if grid_height < grid_width { grid_height } else { grid_width };
    let cell_size: u32 = span / grid_size.try_into().unwrap();

    let mut svg: ByteArray = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\">";
    svg.append(@"<rect width=\"256\" height=\"256\" fill=\"#0a0a0a\"/>");
    svg.append(@"<text x=\"16\" y=\"24\" font-family=\"monospace\" font-size=\"12\" fill=\"#ffffff\">THOUGHT</text>");
    svg.append(@"<text x=\"16\" y=\"44\" font-family=\"monospace\" font-size=\"9\" fill=\"#ffffff\">");
    let meta = format!("account: 0x{:x} index: {} | ", account_address, index);
    svg.append(@meta);
    svg.append(text);
    svg.append(@"</text>");

    svg.append(@"<g id=\"grid\">");

    let mut i = 0;
    while i < grid_size * grid_size {
        let x: u32 = (i % grid_size).try_into().unwrap();
        let y: u32 = (i / grid_size).try_into().unwrap();
        let px = padding + x * cell_size;
        let py = top_offset + y * cell_size;

        svg.append(@"<rect x=\"");
        append_number(ref svg, px);
        svg.append(@"\" y=\"");
        append_number(ref svg, py);
        svg.append(@"\" width=\"");
        append_number(ref svg, cell_size);
        svg.append(@"\" height=\"");
        append_number(ref svg, cell_size);
        svg.append(@"\" fill=\"rgb(");

        let color_index = *grid.get(i).unwrap().deref();
        if color_index == BLACK_INDEX {
            append_byte(ref svg, BLACK_R);
            svg.append(@",");
            append_byte(ref svg, BLACK_G);
            svg.append(@",");
            append_byte(ref svg, BLACK_B);
        } else {
            let color = *palette.get(color_index.into()).unwrap().deref();
            append_byte(ref svg, color.r);
            svg.append(@",");
            append_byte(ref svg, color.g);
            svg.append(@",");
            append_byte(ref svg, color.b);
        }

        svg.append(@")\"/>");
        i += 1;
    }

    svg.append(@"</g>");

    if contradiction.is_some() {
        svg.append(@"<text x=\"16\" y=\"238\" font-family=\"monospace\" font-size=\"9\" fill=\"#ff5555\">contradiction</text>");
    }

    svg.append(@"</svg>");
    svg
}

fn opposite_dir(dir: u32) -> u32 {
    match dir {
        0_u32 => 2_u32,
        1_u32 => 3_u32,
        2_u32 => 0_u32,
        _ => 1_u32,
    }
}

fn prop_len(starts: @Array<u32>, dir: u32, t: usize, pattern_count: usize) -> u16 {
    let idx = prop_index(dir, t, pattern_count);
    let start = *starts.get(idx).unwrap().deref();
    let end = *starts.get(idx + 1).unwrap().deref();
    let len = end - start;
    len.try_into().unwrap()
}

fn get_weight(ref weights: Felt252Dict<u16>, t: usize) -> u32 {
    let key: felt252 = t.into();
    let weight = weights.get(key);
    weight.into()
}

fn stack_push(
    ref stack_cells: Felt252Dict<u32>,
    ref stack_patterns: Felt252Dict<u32>,
    ref stack_size: usize,
    cell: usize,
    pattern: usize,
) {
    let key: felt252 = stack_size.into();
    let cell_u32: u32 = cell.try_into().unwrap();
    let pattern_u32: u32 = pattern.try_into().unwrap();
    stack_cells.insert(key, cell_u32);
    stack_patterns.insert(key, pattern_u32);
    stack_size += 1;
}

fn stack_pop(
    ref stack_cells: Felt252Dict<u32>,
    ref stack_patterns: Felt252Dict<u32>,
    ref stack_size: usize,
) -> Option<(usize, usize)> {
    if stack_size == 0 {
        return Option::None;
    }
    stack_size -= 1;
    let key: felt252 = stack_size.into();
    let cell_u32 = stack_cells.get(key);
    let pattern_u32 = stack_patterns.get(key);
    let cell: usize = cell_u32.try_into().unwrap();
    let pattern: usize = pattern_u32.try_into().unwrap();
    Option::Some((cell, pattern))
}

fn init_wfc_state(
    pattern_count: usize,
    grid_size: usize,
    starts: @Array<u32>,
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    ref compatible: Felt252Dict<u16>,
    ref state: TickState,
) {
    let cells = grid_size * grid_size;
    let mut cell = 0;
    while cell < cells {
        if state.exhausted {
            break;
        }
        let mut t = 0;
        while t < pattern_count {
            if !tick(ref state, 1_u64) {
                break;
            }
            wave.insert(wave_key(cell, t, pattern_count), 1_u8);
            let mut d = 0_u32;
            while d < 4_u32 {
                if !tick(ref state, 1_u64) {
                    break;
                }
                let opp = opposite_dir(d);
                let len = prop_len(starts, opp, t, pattern_count);
                compatible.insert(compat_key(cell, t, d, pattern_count), len);
                d += 1_u32;
            }
            t += 1;
        }
        counts.insert(count_key(cell), pattern_count.try_into().unwrap());
        cell += 1;
    }
}

fn ban_wfc(
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    ref compatible: Felt252Dict<u16>,
    ref stack_cells: Felt252Dict<u32>,
    ref stack_patterns: Felt252Dict<u32>,
    ref stack_size: usize,
    ref contradiction_cell: Option<usize>,
    cell: usize,
    t: usize,
    pattern_count: usize,
) {
    let key = wave_key(cell, t, pattern_count);
    let current = wave.get(key);
    if current == 0_u8 {
        return;
    }
    wave.insert(key, 0_u8);

    let mut d = 0_u32;
    while d < 4_u32 {
        compatible.insert(compat_key(cell, t, d, pattern_count), 0);
        d += 1_u32;
    }

    stack_push(ref stack_cells, ref stack_patterns, ref stack_size, cell, t);

    let ckey = count_key(cell);
    let count = counts.get(ckey);
    if count > 0 {
        let new_count = count - 1;
        counts.insert(ckey, new_count);
        if new_count == 0 {
            if contradiction_cell.is_none() {
                contradiction_cell = Option::Some(cell);
            }
        }
    }
}

fn observe_wfc(
    ref weights: Felt252Dict<u16>,
    pattern_count: usize,
    grid_size: usize,
    ref rng: Rng,
    ref state: TickState,
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    ref compatible: Felt252Dict<u16>,
    ref stack_cells: Felt252Dict<u32>,
    ref stack_patterns: Felt252Dict<u32>,
    ref stack_size: usize,
    ref contradiction_cell: Option<usize>,
) -> Option<bool> {
    let cells = grid_size * grid_size;
    let mut min: u16 = 0xffff_u16;
    let mut argmin: Option<usize> = Option::None;
    let mut i = 0;
    while i < cells {
        if !tick(ref state, 1_u64) {
            return Option::Some(false);
        }
        let count = counts.get(count_key(i));
        if count == 0 {
            if contradiction_cell.is_none() {
                contradiction_cell = Option::Some(i);
            }
            return Option::Some(false);
        }
        if count > 1 {
            if count < min {
                min = count;
                argmin = Option::Some(i);
            } else if count == min {
                if rng_bool(ref rng) {
                    argmin = Option::Some(i);
                }
            }
        }
        i += 1;
    }

    if argmin.is_none() {
        return Option::Some(true);
    }

    let cell_index = match argmin {
        Option::Some(idx) => idx,
        Option::None => 0,
    };

    let mut sum_weights: u32 = 0_u32;
    let mut t = 0;
    while t < pattern_count {
        if !tick(ref state, 1_u64) {
            return Option::Some(false);
        }
        let key = wave_key(cell_index, t, pattern_count);
        if wave.get(key) == 1_u8 {
            sum_weights += get_weight(ref weights, t);
        }
        t += 1;
    }

    let mut choice: usize = 0;
    if sum_weights > 0_u32 {
        let pick = rng_next_usize(ref rng, sum_weights.try_into().unwrap());
        let pick_u32: u32 = pick.try_into().unwrap();
        let mut acc: u32 = 0_u32;
        let mut t2 = 0;
        while t2 < pattern_count {
            let key = wave_key(cell_index, t2, pattern_count);
            if wave.get(key) == 1_u8 {
                acc += get_weight(ref weights, t2);
                if pick_u32 < acc {
                    choice = t2;
                    break;
                }
            }
            t2 += 1;
        }
    }

    let mut t3 = 0;
    while t3 < pattern_count {
        if t3 != choice {
            ban_wfc(
                ref wave,
                ref counts,
                ref compatible,
                ref stack_cells,
                ref stack_patterns,
                ref stack_size,
                ref contradiction_cell,
                cell_index,
                t3,
                pattern_count,
            );
        }
        t3 += 1;
    }

    Option::None
}

fn propagate_wfc(
    pattern_count: usize,
    grid_size: usize,
    starts: @Array<u32>,
    list: @Array<u16>,
    ref state: TickState,
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    ref compatible: Felt252Dict<u16>,
    ref stack_cells: Felt252Dict<u32>,
    ref stack_patterns: Felt252Dict<u32>,
    ref stack_size: usize,
    ref contradiction_cell: Option<usize>,
) {
    loop {
        let entry = stack_pop(ref stack_cells, ref stack_patterns, ref stack_size);
        match entry {
            Option::None => {
                break;
            },
            Option::Some((cell_a, pattern_a)) => {
                if !tick(ref state, 1_u64) {
                    return;
                }
                let x = cell_a % grid_size;
                let y = cell_a / grid_size;
                let mut dir: u32 = 0_u32;
                while dir < 4_u32 {
                    let (nx, ny) = match dir {
                        0_u32 => (if x == 0 { grid_size - 1 } else { x - 1 }, y),
                        1_u32 => (x, if y + 1 >= grid_size { 0 } else { y + 1 }),
                        2_u32 => (if x + 1 >= grid_size { 0 } else { x + 1 }, y),
                        _ => (x, if y == 0 { grid_size - 1 } else { y - 1 }),
                    };
                    let neighbor = ny * grid_size + nx;
                    let pidx = prop_index(dir, pattern_a, pattern_count);
                    let start = *starts.get(pidx).unwrap().deref();
                    let end = *starts.get(pidx + 1).unwrap().deref();
                    let mut idx = start;
                    while idx < end {
                        if !tick(ref state, 1_u64) {
                            return;
                        }
                        let list_index: usize = idx.try_into().unwrap();
                        let t2 = *list.get(list_index).unwrap().deref();
                        let t2_usize: usize = t2.into();
                        let ckey = compat_key(neighbor, t2_usize, dir, pattern_count);
                        let comp = compatible.get(ckey);
                        if comp > 0 {
                            let new_comp = comp - 1;
                            compatible.insert(ckey, new_comp);
                            if new_comp == 0 {
                                ban_wfc(
                                    ref wave,
                                    ref counts,
                                    ref compatible,
                                    ref stack_cells,
                                    ref stack_patterns,
                                    ref stack_size,
                                    ref contradiction_cell,
                                    neighbor,
                                    t2_usize,
                                    pattern_count,
                                );
                            }
                        }
                        idx += 1;
                    }
                    dir += 1_u32;
                }
            },
        }
    }
}

fn append_filter(
    ref defs: ByteArray,
    index: usize,
    freq: u32,
    scale: u32,
    seed: u32,
    ref state: TickState,
) {
    if !tick(ref state, 5_u64) {
        return;
    }
    defs.append(@"
    <filter id=\"wobble-");
    append_number(ref defs, index.try_into().unwrap());
    defs.append(@"\"  x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\" color-interpolation-filters=\"sRGB\" primitiveUnits=\"userSpaceOnUse\">
        <feTurbulence type=\"fractalNoise\" baseFrequency=\"");
    append_fixed(ref defs, freq, 3_u32);
    defs.append(@"\" numOctaves=\"2\" seed=\"");
    append_number(ref defs, seed);
    defs.append(@"\" stitchTiles=\"stitch\" result=\"turbulence-");
    append_number(ref defs, index.try_into().unwrap());
    defs.append(@"\"/>       
        <feDisplacementMap in=\"SourceGraphic\" in2=\"turbulence-");
    append_number(ref defs, index.try_into().unwrap());
    defs.append(@"\" scale=\"");
    append_fixed(ref defs, scale, 3_u32);
    defs.append(@"\" xChannelSelector=\"R\" yChannelSelector=\"G\"/>
    </filter>");
}

fn append_frame_group(
    ref frames: ByteArray,
    index: usize,
    patterns: @Array<u16>,
    pattern_count: usize,
    palette: @Array<Color>,
    grid_size: usize,
    cell_size: u32,
    cell_gap: u32,
    opacity: u32,
    ref wave: Felt252Dict<u8>,
    ref counts: Felt252Dict<u16>,
    generation_complete: bool,
    ref state: TickState,
) {
    let step = cell_size + cell_gap;
    let inset = cell_gap / 2_u32;

    frames.append(@"
<g id=\"iteration-");
    append_number(ref frames, index.try_into().unwrap());
    frames.append(@"\" style=\"display:none; mix-blend-mode:overlay\" filter=\"url(#wobble-");
    append_number(ref frames, index.try_into().unwrap());
    frames.append(@")\">");

    let mut y = 0;
    while y < grid_size {
        if state.exhausted {
            break;
        }
        let mut x = 0;
        while x < grid_size {
            if !tick(ref state, 1_u64) {
                break;
            }
            let cell = y * grid_size + x;
            let count = counts.get(count_key(cell));
            let status_is_collapsed = count == 1_u16;

            let (r, g, b, a) = if generation_complete {
                let dx = if x + N <= grid_size { 0 } else { if x > 0 { 1 } else { 0 } };
                let dy = if y + N <= grid_size { 0 } else { if y > 0 { 1 } else { 0 } };
                let base_cell = (x - dx) + (y - dy) * grid_size;
                let mut t = 0;
                let mut chosen = 0;
                while t < pattern_count {
                    let key = wave_key(base_cell, t, pattern_count);
                    if wave.get(key) == 1_u8 {
                        chosen = t;
                        break;
                    }
                    t += 1;
                }
                let idx = dx + dy * N;
                let color_index = pattern_at(patterns, chosen, idx);
                let color = *palette.get(color_index.into()).unwrap().deref();
                (color.r, color.g, color.b, color.a)
            } else {
                let mut contributors: u32 = 0_u32;
                let mut rs: u32 = 0_u32;
                let mut gs: u32 = 0_u32;
                let mut bs: u32 = 0_u32;
                let mut as_: u32 = 0_u32;
                let mut dy = 0;
                while dy < N {
                    let mut dx = 0;
                    while dx < N {
                        let sx = if x < dx { x + grid_size - dx } else { x - dx };
                        let sy = if y < dy { y + grid_size - dy } else { y - dy };
                        let source = sx + sy * grid_size;
                        let mut t = 0;
                        while t < pattern_count {
                            if state.exhausted {
                                break;
                            }
                            let key = wave_key(source, t, pattern_count);
                            if wave.get(key) == 1_u8 {
                                let _ = tick(ref state, 1_u64);
                                contributors += 1_u32;
                                let color_index = pattern_at(patterns, t, dx + dy * N);
                                let color = *palette.get(color_index.into()).unwrap().deref();
                                rs += color.r.into();
                                gs += color.g.into();
                                bs += color.b.into();
                                as_ += color.a.into();
                            }
                            t += 1;
                        }
                        dx += 1;
                    }
                    dy += 1;
                }
                if contributors == 0_u32 {
                    (0_u8, 0_u8, 0_u8, 255_u8)
                } else {
                    (
                        (rs / contributors).try_into().unwrap(),
                        (gs / contributors).try_into().unwrap(),
                        (bs / contributors).try_into().unwrap(),
                        (as_ / contributors).try_into().unwrap(),
                    )
                }
            };

            let a_u32: u32 = a.into();
            let alpha: u32 = (opacity * a_u32) / 255_u32;
            let px = step * (x.try_into().unwrap()) + inset;
            let py = step * (y.try_into().unwrap()) + inset;

            let _ = tick(ref state, 2_u64);
            frames.append(@"
<rect x=\"");
            append_fixed(ref frames, px, 3_u32);
            frames.append(@"\" y=\"");
            append_fixed(ref frames, py, 3_u32);
            frames.append(@"\" width=\"");
            append_fixed(ref frames, cell_size, 3_u32);
            frames.append(@"\" height=\"");
            append_fixed(ref frames, cell_size, 3_u32);
            frames.append(@"\"
      data-status=\"");
            if status_is_collapsed {
                frames.append(@"Collapsed");
            } else {
                frames.append(@"Superposition");
            }
            frames.append(@"\"
      fill=\"");
            append_rgba_hex(ref frames, Color { r, g, b, a });
            frames.append(@"\"
      opacity=\"");
            append_fixed(ref frames, alpha, 3_u32);
            frames.append(@"\"/>");

            x += 1;
        }
        y += 1;
    }

    frames.append(@"
 <set attributeName=\"display\" to=\"inline\" begin=\"timeline.begin+");
    append_fixed(ref frames, index.try_into().unwrap(), 1_u32);
    frames.append(@"s\" fill=\"freeze\"/>
</g> ");
}

fn append_title(
    ref svg: ByteArray,
    text: @ByteArray,
    ref char_colors: Felt252Dict<u32>,
    title_x: u32,
    title_y: u32,
    title_width: u32,
    title_height: u32,
    ref state: TickState,
) {
    let mut title_chars: Array<u8> = ArrayTrait::new();
    let len = text.len();
    let mut i = 0;
    while i < len {
        let byte = text.at(i).unwrap();
        if byte == 10_u8 {
            title_chars.append(32_u8);
        } else {
            title_chars.append(byte);
        }
        i += 1;
    }

    let total = title_chars.len();
    let mut title_cols = if total == 0 { 1 } else { total };
    let mut title_cell = if total == 0 {
        title_height
    } else {
        let cols_u32: u32 = title_cols.try_into().unwrap();
        let w = title_width / cols_u32;
        if w < title_height { w } else { title_height }
    };

    if total > 0 {
        let mut rows = 1;
        while rows <= total {
            let cols = ceil_div(total, rows);
            let cols_u32: u32 = cols.try_into().unwrap();
            let rows_u32: u32 = rows.try_into().unwrap();
            let cw = title_width / cols_u32;
            let ch = title_height / rows_u32;
            let cell = if cw < ch { cw } else { ch };
            if cell > title_cell {
                title_cell = cell;
                title_cols = cols;
            }
            rows += 1;
        }
    }

    let title_font = title_cell * 6_u32 / 10_u32;

    svg.append(@"
<g id=\"title\">
    ");

    let mut idx = 0;
    while idx < total {
        let ch = *title_chars.get(idx).unwrap().deref();
        if ch == 32_u8 {
            idx += 1;
            continue;
        }
        if !tick(ref state, 2_u64) {
            break;
        }
        let key: felt252 = ch.into();
        let color_key = char_colors.get(key);
        let color = if color_key == 0_u32 {
            Color { r: WHITE_R, g: WHITE_G, b: WHITE_B, a: WHITE_A }
        } else {
            decode_color_key(color_key)
        };

        let row = idx / title_cols;
        let col = idx % title_cols;
        let px = title_x + title_cell * (col.try_into().unwrap());
        let py = title_y + title_cell * (row.try_into().unwrap());

        let r_u32: u32 = color.r.into();
        let g_u32: u32 = color.g.into();
        let b_u32: u32 = color.b.into();
        let luminance: u32 = 2126_u32 * r_u32 + 7152_u32 * g_u32 + 722_u32 * b_u32;
        let text_color = if luminance > 1_530_000_u32 { "#000000" } else { "#ffffff" };

        let center_x = px + title_cell / 2_u32;
        let center_y = py + title_cell / 2_u32;

        svg.append(@"
<rect x=\"");
        append_fixed(ref svg, px, 3_u32);
        svg.append(@"\" y=\"");
        append_fixed(ref svg, py, 3_u32);
        svg.append(@"\" width=\"");
        append_fixed(ref svg, title_cell, 3_u32);
        svg.append(@"\" height=\"");
        append_fixed(ref svg, title_cell, 3_u32);
        svg.append(@"\"
      fill=\"");
        append_rgba_hex(ref svg, color);
        svg.append(@"\"/>
<text x=\"");
        append_fixed(ref svg, center_x, 3_u32);
        svg.append(@"\" y=\"");
        append_fixed(ref svg, center_y, 3_u32);
        svg.append(@"\"
      font-family=\"monospace\"
      font-size=\"");
        append_fixed(ref svg, title_font, 3_u32);
        svg.append(@"\"
      text-anchor=\"middle\"
      dominant-baseline=\"central\"
      fill=\"");
        svg.append(@text_color);
        svg.append(@"\">");
        svg.append_byte(ch);
        svg.append(@"</text>");

        idx += 1;
    }

    svg.append(@"
</g>");
}

fn estimate_frame_cost(grid_size: usize, pattern_count: usize, generation_complete: bool) -> u64 {
    let cells: u64 = (grid_size * grid_size).try_into().unwrap();
    if cells == 0_u64 {
        return 0_u64;
    }
    let per_cell_complete: u64 = 3_u64;
    let per_cell_incomplete: u64 = 3_u64 + (N * N * pattern_count).try_into().unwrap();
    let per_cell = if generation_complete { per_cell_complete } else { per_cell_incomplete };
    cells * per_cell
}

fn render_svg(
    palette: @Array<Color>,
    patterns: @Array<u16>,
    ref weights: Felt252Dict<u16>,
    pattern_count: usize,
    grid_size: usize,
    wfc_seed: u32,
    visual_seed: u32,
    text: @ByteArray,
    ref char_colors: Felt252Dict<u32>,
    ref state: TickState,
    ref frame_count_out: u32,
    ref contradiction_cell_out: u32,
) -> ByteArray {
    frame_count_out = 0_u32;
    contradiction_cell_out = NO_CONTRADICTION_CELL;
    let canvas: u32 = 10_u32;
    let gap_frac_fp: u32 = 0_u32;
    let padding_frac_fp: u32 = 100_u32;
    let opacity_min_fp: u32 = 100_u32;
    let opacity_max_fp: u32 = 1000_u32;
    let main_frac_fp: u32 = FP_SCALE;
    let title_height: u32 = 400_u32;
    let title_bottom_offset: u32 = 200_u32;

    let mut visual_rng = rng_new(visual_seed);
    let opacity = remap_fixed(opacity_min_fp, opacity_max_fp, ref visual_rng);
    let canvas_scale = (canvas * FP_SCALE) / 10_u32;
    let filter_freq = fp_div(remap_fixed(opacity_min_fp, opacity_max_fp, ref visual_rng), canvas_scale);
    let filter_scale = fp_mul(remap_fixed(opacity_min_fp, opacity_max_fp, ref visual_rng), canvas_scale);

    let width_fp = canvas * FP_SCALE;
    let height_fp = canvas * FP_SCALE;
    let main_height = fp_mul(height_fp, main_frac_fp);
    let padding = fp_mul(width_fp, padding_frac_fp);
    let inner = width_fp - 2_u32 * padding;

    let grid_u32: u32 = grid_size.try_into().unwrap();
    let step = if grid_u32 == 0 { 0_u32 } else { inner / grid_u32 };
    let gap_between = fp_mul(step, gap_frac_fp);
    let inset = gap_between / 2_u32;
    let cell_size = step - gap_between;
    let tx = (width_fp - inner) / 2_u32 + inset;
    let ty = (height_fp - inner) / 2_u32 + inset;
    let main_scale = fp_div(main_height, height_fp);
    let main_offset_x = (width_fp - fp_mul(width_fp, main_scale)) / 2_u32;
    let main_offset_y = 0_u32;

    let title_x = padding;
    let title_y = height_fp - title_bottom_offset - title_height;
    let title_width = inner;
    let reserve = SVG_CLOSEOUT_RESERVE_TICKS;
    let cells_u64: u64 = (grid_size * grid_size).try_into().unwrap();

    let mut frame_stack: ByteArray = "";
    let mut filter_stack: ByteArray = "";
    let mut contradiction_cell: Option<usize> = Option::None;
    let mut black_hole_frame: Option<usize> = Option::None;
    let mut frame_count: usize = 0;

    if state.exhausted {
        return render_exhausted_svg(text, state.phase);
    }
    if !ensure_budget(ref state, reserve) {
        return render_exhausted_svg(text, state.phase);
    }

    if pattern_count == 0 {
        set_phase(ref state, PHASE_FRAME_RENDER);
        let frame_cost = estimate_frame_cost(grid_size, pattern_count, false) + 5_u64;
        if !ensure_budget(ref state, reserve + frame_cost) {
            return render_exhausted_svg(text, state.phase);
        }
        let seed = rng_next_usize(ref visual_rng, 1001);
        append_filter(
            ref filter_stack,
            0,
            filter_freq,
            filter_scale,
            seed.try_into().unwrap(),
            ref state,
        );
        // Render a single empty frame
        let mut dummy_wave: Felt252Dict<u8> = Default::default();
        let mut dummy_counts: Felt252Dict<u16> = Default::default();
        let cells = grid_size * grid_size;
        let mut i = 0;
        while i < cells {
            dummy_counts.insert(count_key(i), 0_u16);
            i += 1;
        }
        append_frame_group(
            ref frame_stack,
            0,
            patterns,
            pattern_count,
            palette,
            grid_size,
            cell_size,
            gap_between,
            opacity,
            ref dummy_wave,
            ref dummy_counts,
            false,
            ref state,
        );
        contradiction_cell = if cells > 0 { Option::Some(0) } else { Option::None };
        black_hole_frame = if cells > 0 { Option::Some(0) } else { Option::None };
        frame_count = 1;
    } else {
        set_phase(ref state, PHASE_PROPAGATOR);
        let p_u64: u64 = pattern_count.try_into().unwrap();
        let propagator_cost = 4_u64 * p_u64 * p_u64;
        if !ensure_budget(ref state, reserve + propagator_cost) {
            return render_exhausted_svg(text, state.phase);
        }
        let (starts, list) = build_propagator(patterns, pattern_count, ref state);
        if state.exhausted {
            return render_exhausted_svg(text, state.phase);
        }
        let mut wave: Felt252Dict<u8> = Default::default();
        let mut counts: Felt252Dict<u16> = Default::default();
        let mut compatible: Felt252Dict<u16> = Default::default();
        set_phase(ref state, PHASE_WFC_INIT);
        let init_cost = cells_u64 * p_u64 * 5_u64;
        if !ensure_budget(ref state, reserve + init_cost) {
            return render_exhausted_svg(text, state.phase);
        }
        init_wfc_state(
            pattern_count,
            grid_size,
            @starts,
            ref wave,
            ref counts,
            ref compatible,
            ref state,
        );
        if state.exhausted {
            return render_exhausted_svg(text, state.phase);
        }

        let mut stack_cells: Felt252Dict<u32> = Default::default();
        let mut stack_patterns: Felt252Dict<u32> = Default::default();
        let mut stack_size: usize = 0;

        let mut rng = rng_new(wfc_seed);
        let mut frame_index: usize = 0;

        loop {
            set_phase(ref state, PHASE_WFC_OBSERVE);
            let observe_result = observe_wfc(
                ref weights,
                pattern_count,
                grid_size,
                ref rng,
                ref state,
                ref wave,
                ref counts,
                ref compatible,
                ref stack_cells,
                ref stack_patterns,
                ref stack_size,
                ref contradiction_cell,
            );
            if state.exhausted {
                return render_exhausted_svg(text, state.phase);
            }
            match observe_result {
                Option::None => {
                    set_phase(ref state, PHASE_WFC_PROPAGATE);
                    propagate_wfc(
                        pattern_count,
                        grid_size,
                        @starts,
                        @list,
                        ref state,
                        ref wave,
                        ref counts,
                        ref compatible,
                        ref stack_cells,
                        ref stack_patterns,
                        ref stack_size,
                        ref contradiction_cell,
                    );
                },
                Option::Some(_) => {},
            }
            if state.exhausted {
                return render_exhausted_svg(text, state.phase);
            }

            let seed = rng_next_usize(ref visual_rng, 1001);
            set_phase(ref state, PHASE_FRAME_RENDER);
            let generation_complete = match observe_result {
                Option::Some(true) => true,
                _ => false,
            };
            let frame_cost = estimate_frame_cost(grid_size, pattern_count, generation_complete) + 5_u64;
            if !ensure_budget(ref state, reserve + frame_cost) {
                return render_exhausted_svg(text, state.phase);
            }
            append_filter(
                ref filter_stack,
                frame_index,
                filter_freq,
                filter_scale,
                seed.try_into().unwrap(),
                ref state,
            );

            append_frame_group(
                ref frame_stack,
                frame_index,
                patterns,
                pattern_count,
                palette,
                grid_size,
                cell_size,
                gap_between,
                opacity,
                ref wave,
                ref counts,
                generation_complete,
                ref state,
            );
            if state.exhausted {
                return render_exhausted_svg(text, state.phase);
            }

            if black_hole_frame.is_none() && contradiction_cell.is_some() {
                black_hole_frame = Option::Some(frame_index);
            }

            frame_index += 1;

            match observe_result {
                Option::Some(_) => {
                    break;
                },
                Option::None => {},
            }
        }
        frame_count = frame_index;

        let _ = wave.squash();
        let _ = counts.squash();
        let _ = compatible.squash();
        let _ = starts.len();
        let _ = list.len();
    }

    let mut black_hole_overlay: ByteArray = "";
    if let Option::Some(cell) = contradiction_cell {
        let cx = cell % grid_size;
        let cy = cell / grid_size;
        let px = step * (cx.try_into().unwrap()) + inset;
        let py = step * (cy.try_into().unwrap()) + inset;
        let last_index = if frame_count > 0 { frame_count - 1 } else { 0_usize };
        let filter_index = match black_hole_frame {
            Option::Some(idx) => {
                if idx > last_index { last_index } else { idx }
            },
            Option::None => last_index,
        };
        black_hole_overlay.append(@"
<g id=\"black-hole-cell\" style=\"display:none; mix-blend-mode:overlay\" filter=\"url(#wobble-");
        append_number(ref black_hole_overlay, filter_index.try_into().unwrap());
        black_hole_overlay.append(@")\">
  <rect x=\"");
        append_fixed(ref black_hole_overlay, px, 3_u32);
        black_hole_overlay.append(@"\" y=\"");
        append_fixed(ref black_hole_overlay, py, 3_u32);
        black_hole_overlay.append(@"\" width=\"");
        append_fixed(ref black_hole_overlay, cell_size, 3_u32);
        black_hole_overlay.append(@"\" height=\"");
        append_fixed(ref black_hole_overlay, cell_size, 3_u32);
        black_hole_overlay.append(@"\" fill=\"#000000\"/>
  <set attributeName=\"display\" to=\"inline\" begin=\"timeline.begin+");
        append_fixed(ref black_hole_overlay, filter_index.try_into().unwrap(), 1_u32);
        black_hole_overlay.append(@"s\" fill=\"freeze\"/>
</g>");
    }

    let mut svg: ByteArray = "<svg data-THOUGHT=\"";
    svg.append(text);
    svg.append(@"\" 
    width=\"100%\" height=\"100%\" viewBox=\"0 0 10 10\" 
    preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\">

    <!-- DISTORTION -->
    <defs>");
    svg.append(@filter_stack);
    svg.append(@"
    </defs>

    <!-- TIME -->
    <rect id=\"clock\" width=\"0\" height=\"0\" fill=\"none\">
        <animate id=\"timeline\" 
            attributeName=\"x\" from=\"0\" to=\"0\" 
            dur=\"10s\" 
            begin=\"0s;timeline.end\"/>
    </rect>

    <!-- VOID -->
    <rect id=\"background\" width = \"100%\" height = \"100%\" fill = \"#000000ff\" />

    <!-- COLLAPSE -->
    <g id=\"main-area\" transform=\"translate(");
    append_fixed(ref svg, main_offset_x, 3_u32);
    svg.append(@" ");
    append_fixed(ref svg, main_offset_y, 3_u32);
    svg.append(@") scale(");
    append_fixed(ref svg, main_scale, 3_u32);
    svg.append(@")\">
        <g id=\"Iterations\"
        transform=\"translate(");
    append_fixed(ref svg, tx, 3_u32);
    svg.append(@" , ");
    append_fixed(ref svg, ty, 3_u32);
    svg.append(@") \"
        style=\"isolation:isolate\">");
    svg.append(@frame_stack);
    svg.append(@black_hole_overlay);
    svg.append(@"
        </g>
    </g>");

    if state.exhausted {
        return render_exhausted_svg(text, state.phase);
    }

    set_phase(ref state, PHASE_TITLE_RENDER);
    append_title(
        ref svg,
        text,
        ref char_colors,
        title_x,
        title_y,
        title_width,
        title_height,
        ref state,
    );

    set_phase(ref state, PHASE_SVG_FINALIZE);
    let _ = tick(ref state, 10_u64);
    svg.append(@"

</svg>");

    frame_count_out = frame_count.try_into().unwrap();
    if let Option::Some(cell) = contradiction_cell {
        contradiction_cell_out = cell.try_into().unwrap();
    }
    svg
}

#[starknet::interface]
trait ISeedGenerator<TContractState> {
    fn get_seed(
        self: @TContractState,
        account_address: ContractAddress,
        index: u64,
        text: ByteArray,
    ) -> felt252;
}

#[starknet::interface]
trait IThoughtPreviewer<TContractState> {
    fn preview(
        self: @TContractState,
        account_address: ContractAddress,
        index: u64,
        text: ByteArray,
    ) -> ByteArray;
    fn preview_with_fuel(
        self: @TContractState,
        account_address: ContractAddress,
        index: u64,
        text: ByteArray,
        max_ticks: u64,
    ) -> (ByteArray, u64, u8, u8);
    fn preview_metrics(
        self: @TContractState,
        account_address: ContractAddress,
        index: u64,
        text: ByteArray,
        max_ticks: u64,
    ) -> (u64, u8, u32, u32, u32, u32, u8);
}

#[starknet::contract]
mod SeedGenerator {
    use super::{compute_seed, ContractAddress, ISeedGenerator, ByteArray};

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl SeedGeneratorImpl of ISeedGenerator<ContractState> {
        fn get_seed(
            self: @ContractState,
            account_address: ContractAddress,
            index: u64,
            text: ByteArray,
        ) -> felt252 {
            compute_seed(account_address, index, @text)
        }
    }
}

#[starknet::contract]
mod ThoughtPreviewer {
    use super::{
        build_palette_and_sample, build_patterns, compute_n, compute_seed32_with_ticks, mix_seed,
        render_exhausted_svg, render_svg, set_phase, tick_state_new, ByteArray, ContractAddress,
        IThoughtPreviewer, MAX_TEXT_LEN, NO_CONTRADICTION_CELL, PHASE_PALETTE, PHASE_PATTERNS,
        PHASE_SEED, STATUS_CONTRADICTION, STATUS_EXHAUSTED, STATUS_OK, DEFAULT_MAX_TICKS,
        SEED_TAG_SAMPLE, SEED_TAG_VISUAL, SEED_TAG_WFC, truncate_text,
    };

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl ThoughtPreviewerImpl of IThoughtPreviewer<ContractState> {
        fn preview(
            self: @ContractState,
            account_address: ContractAddress,
            index: u64,
            text: ByteArray,
        ) -> ByteArray {
            let (svg, _, _, _, _, _, _, _) = preview_core(
                account_address,
                index,
                text,
                DEFAULT_MAX_TICKS,
            );
            svg
        }

        fn preview_with_fuel(
            self: @ContractState,
            account_address: ContractAddress,
            index: u64,
            text: ByteArray,
            max_ticks: u64,
        ) -> (ByteArray, u64, u8, u8) {
            let (svg, ticks_used, status, phase, _, _, _, _) = preview_core(
                account_address,
                index,
                text,
                max_ticks,
            );
            (svg, ticks_used, status, phase)
        }

        fn preview_metrics(
            self: @ContractState,
            account_address: ContractAddress,
            index: u64,
            text: ByteArray,
            max_ticks: u64,
        ) -> (u64, u8, u32, u32, u32, u32, u8) {
            let (_, ticks_used, status, phase, grid_size, pattern_count, frame_count, contradiction_cell) =
                preview_core(account_address, index, text, max_ticks);
            (
                ticks_used,
                phase,
                grid_size,
                pattern_count,
                frame_count,
                contradiction_cell,
                status,
            )
        }
    }

    fn preview_core(
        account_address: ContractAddress,
        index: u64,
        text: ByteArray,
        max_ticks: u64,
    ) -> (ByteArray, u64, u8, u8, u32, u32, u32, u32) {
        let mut state = tick_state_new(max_ticks);
        set_phase(ref state, PHASE_SEED);
        let trimmed = truncate_text(@text, MAX_TEXT_LEN, ref state);
        let grid_size = compute_n(trimmed.len());
        if state.exhausted {
            let svg = render_exhausted_svg(@trimmed, state.phase);
            return (
                svg,
                state.ticks_used,
                STATUS_EXHAUSTED,
                state.phase,
                grid_size.try_into().unwrap(),
                0_u32,
                0_u32,
                NO_CONTRADICTION_CELL,
            );
        }

        let base_seed = compute_seed32_with_ticks(account_address, index, @trimmed, ref state);
        let sample_seed = mix_seed(base_seed, SEED_TAG_SAMPLE);
        let wfc_seed = mix_seed(base_seed, SEED_TAG_WFC);
        let visual_seed = mix_seed(base_seed, SEED_TAG_VISUAL);

        if state.exhausted {
            let svg = render_exhausted_svg(@trimmed, state.phase);
            return (
                svg,
                state.ticks_used,
                STATUS_EXHAUSTED,
                state.phase,
                grid_size.try_into().unwrap(),
                0_u32,
                0_u32,
                NO_CONTRADICTION_CELL,
            );
        }

        set_phase(ref state, PHASE_PALETTE);
        let (palette, sample, width, height, blank_index, mut char_colors) =
            build_palette_and_sample(@trimmed, sample_seed, ref state);
        if state.exhausted {
            let svg = render_exhausted_svg(@trimmed, state.phase);
            return (
                svg,
                state.ticks_used,
                STATUS_EXHAUSTED,
                state.phase,
                grid_size.try_into().unwrap(),
                0_u32,
                0_u32,
                NO_CONTRADICTION_CELL,
            );
        }

        set_phase(ref state, PHASE_PATTERNS);
        let palette_len: u16 = palette.len().try_into().unwrap();
        let (patterns, mut weights, pattern_count) =
            build_patterns(@sample, width, height, palette_len, blank_index, ref state);
        if state.exhausted {
            let svg = render_exhausted_svg(@trimmed, state.phase);
            return (
                svg,
                state.ticks_used,
                STATUS_EXHAUSTED,
                state.phase,
                grid_size.try_into().unwrap(),
                pattern_count.try_into().unwrap(),
                0_u32,
                NO_CONTRADICTION_CELL,
            );
        }

        let mut frame_count_out: u32 = 0_u32;
        let mut contradiction_cell_out: u32 = NO_CONTRADICTION_CELL;
        let svg = render_svg(
            @palette,
            @patterns,
            ref weights,
            pattern_count,
            grid_size,
            wfc_seed,
            visual_seed,
            @trimmed,
            ref char_colors,
            ref state,
            ref frame_count_out,
            ref contradiction_cell_out,
        );

        let status = if state.exhausted {
            STATUS_EXHAUSTED
        } else if contradiction_cell_out != NO_CONTRADICTION_CELL {
            STATUS_CONTRADICTION
        } else {
            STATUS_OK
        };

        (
            svg,
            state.ticks_used,
            status,
            state.phase,
            grid_size.try_into().unwrap(),
            pattern_count.try_into().unwrap(),
            frame_count_out,
            contradiction_cell_out,
        )
    }
}
