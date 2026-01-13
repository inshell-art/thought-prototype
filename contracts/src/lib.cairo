use core::array::ArrayTrait;
use core::byte_array::{ByteArray, ByteArrayTrait};
use core::dict::{Felt252Dict, Felt252DictTrait};
use core::integer::{u128_safe_divmod, u256};
use core::traits::{Into, TryInto};
use core::zeroable::NonZero;
use starknet::ContractAddress;

const MAX_TEXT_LEN: usize = 23;
const MAX_PALETTE: usize = 16;
const MAX_PATTERNS: usize = 64;
const GRID_SIZE: usize = 8;
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

#[derive(Copy, Drop)]
struct Color {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

#[derive(Copy, Drop)]
struct Rng {
    state: u128,
}

fn rng_new(seed: u128) -> Rng {
    Rng { state: seed }
}

fn rng_next_u8(ref rng: Rng) -> u8 {
    let next = rng_next_u64(ref rng);
    let value = next & 0xff_u64;
    value.try_into().unwrap()
}

fn rng_next_usize(ref rng: Rng, max: usize) -> usize {
    if max == 0 {
        return 0;
    }
    let next = rng_next_u64(ref rng);
    let max_u64: u64 = max.try_into().unwrap();
    let value = if max_u64 == 0 { 0 } else { next % max_u64 };
    value.try_into().unwrap()
}

fn mod_u128(value: u128, modulus: u128) -> u128 {
    let modulus_nz: NonZero<u128> = modulus.try_into().unwrap();
    let (_, rem) = u128_safe_divmod(value, modulus_nz);
    rem
}

fn rng_next_u64(ref rng: Rng) -> u64 {
    let next = rng.state * 6364136223846793005_u128 + 1442695040888963407_u128;
    rng.state = mod_u128(next, RNG_MOD);
    let value: u64 = rng.state.try_into().unwrap();
    value
}

fn truncate_text(text: @ByteArray, max_len: usize) -> ByteArray {
    let mut out: ByteArray = "";
    let len = text.len();
    let limit = if len > max_len { max_len } else { len };
    let mut i = 0;
    while i < limit {
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

fn palette_index_for_char(
    ref char_map: Felt252Dict<u16>,
    ref palette: Array<Color>,
    ref rng: Rng,
    byte: u8,
) -> u16 {
    let key: felt252 = byte.into();
    let existing = char_map.get(key);
    if existing != 0 {
        return existing - 1;
    }

    if palette.len() >= MAX_PALETTE {
        let fallback = rng_next_usize(ref rng, palette.len());
        let index: u16 = fallback.try_into().unwrap();
        char_map.insert(key, index + 1);
        return index;
    }

    let r = rng_next_u8(ref rng);
    let g = rng_next_u8(ref rng);
    let b = rng_next_u8(ref rng);
    let color = Color { r, g, b, a: WHITE_A };
    palette.append(color);

    let index: u16 = (palette.len() - 1).try_into().unwrap();
    char_map.insert(key, index + 1);
    index
}

fn build_palette_and_sample(text: @ByteArray, seed: u128) -> (Array<Color>, Array<u16>, usize, usize) {
    let mut palette: Array<Color> = ArrayTrait::new();
    palette.append(Color { r: WHITE_R, g: WHITE_G, b: WHITE_B, a: WHITE_A });

    let mut char_map: Felt252Dict<u16> = Default::default();
    char_map.insert(32, 1);
    char_map.insert(10, 1);

    let mut rng = rng_new(seed);

    let len = text.len();
    let mut width = 1;
    while width * width < len {
        width += 1;
    }
    if width < N {
        width = N;
    }
    let mut height = (len + width - 1) / width;
    if height < N {
        height = N;
    }

    let mut sample: Array<u16> = ArrayTrait::new();
    let total = width * height;
    let mut i = 0;
    while i < total {
        let byte = if i < len { text.at(i).unwrap() } else { 32_u8 };
        let index = if byte == 32_u8 || byte == 10_u8 {
            0
        } else {
            palette_index_for_char(ref char_map, ref palette, ref rng, byte)
        };
        sample.append(index);
        i += 1;
    }

    let _ = char_map.squash();
    (palette, sample, width, height)
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

fn build_patterns(
    sample: @Array<u16>,
    width: usize,
    height: usize,
    palette_len: u16,
) -> (Array<u16>, usize) {
    let mut patterns: Array<u16> = ArrayTrait::new();
    let mut pattern_map: Felt252Dict<u16> = Default::default();
    let mut pattern_count = 0;

    let max_y = height - N + 1;
    let max_x = width - N + 1;

    let mut y = 0;
    while y < max_y {
        let mut x = 0;
        while x < max_x {
            let p0 = sample_at(sample, width, x, y);
            let p1 = sample_at(sample, width, x + 1, y);
            let p2 = sample_at(sample, width, x, y + 1);
            let p3 = sample_at(sample, width, x + 1, y + 1);
            let key = encode_pattern(p0, p1, p2, p3, palette_len);

            if pattern_count < MAX_PATTERNS {
                let existing = pattern_map.get(key);
                if existing == 0 {
                    patterns.append(p0);
                    patterns.append(p1);
                    patterns.append(p2);
                    patterns.append(p3);
                    pattern_count += 1;
                    let stored: u16 = pattern_count.try_into().unwrap();
                    pattern_map.insert(key, stored);
                }
            }

            x += 1;
        }
        y += 1;
    }

    let _ = pattern_map.squash();
    (patterns, pattern_count)
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

fn wave_key(cell: usize, t: usize, pattern_count: usize) -> felt252 {
    let idx = cell * pattern_count + t;
    idx.into()
}

fn count_key(cell: usize) -> felt252 {
    cell.into()
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
    seed: u128,
) -> (Array<u16>, Option<usize>) {
    let mut rng = rng_new(seed);
    let cells = GRID_SIZE * GRID_SIZE;

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
                            let x = cell_a % GRID_SIZE;
                            let y = cell_a / GRID_SIZE;
                            let mut dir = 0_u8;
                            while dir < 4_u8 {
                                let (nx, ny) = match dir {
                                    0_u8 => {
                                        let nx = if x == 0 { GRID_SIZE - 1 } else { x - 1 };
                                        (nx, y)
                                    },
                                    1_u8 => {
                                        let ny = if y + 1 >= GRID_SIZE { 0 } else { y + 1 };
                                        (x, ny)
                                    },
                                    2_u8 => {
                                        let nx = if x + 1 >= GRID_SIZE { 0 } else { x + 1 };
                                        (nx, y)
                                    },
                                    _ => {
                                        let ny = if y == 0 { GRID_SIZE - 1 } else { y - 1 };
                                        (x, ny)
                                    },
                                };

                                let neighbor = ny * GRID_SIZE + nx;
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

fn fallback_grid() -> Array<u16> {
    let mut output: Array<u16> = ArrayTrait::new();
    let mut i = 0;
    while i < GRID_SIZE * GRID_SIZE {
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

fn svg_from_grid(
    palette: @Array<Color>,
    grid: @Array<u16>,
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
    let cell_size: u32 = span / GRID_SIZE.try_into().unwrap();

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
    while i < GRID_SIZE * GRID_SIZE {
        let x: u32 = (i % GRID_SIZE).try_into().unwrap();
        let y: u32 = (i / GRID_SIZE).try_into().unwrap();
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
        build_palette_and_sample, build_patterns, compute_seed_u128, fallback_grid, svg_from_grid,
        wfc_generate, ContractAddress, IThoughtPreviewer, ByteArray, MAX_TEXT_LEN, truncate_text,
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
            let trimmed = truncate_text(@text, MAX_TEXT_LEN);
            let seed = compute_seed_u128(account_address, index, @trimmed);
            let (palette, sample, width, height) = build_palette_and_sample(@trimmed, seed);
            let palette_len: u16 = palette.len().try_into().unwrap();
            let (patterns, pattern_count) = build_patterns(@sample, width, height, palette_len);

            if pattern_count == 0 {
                let grid = fallback_grid();
                return svg_from_grid(@palette, @grid, account_address, index, @trimmed, Option::None);
            }

            let (grid, contradiction) = wfc_generate(@patterns, pattern_count, seed);
            svg_from_grid(@palette, @grid, account_address, index, @trimmed, contradiction)
        }
    }
}
