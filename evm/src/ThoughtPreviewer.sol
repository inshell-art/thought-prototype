// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ThoughtSeedLib} from "./ThoughtSeedLib.sol";

contract ThoughtPreviewer {
    uint256 private constant MAX_TEXT_LEN = 23;
    uint256 private constant MAX_PALETTE = 64;
    uint256 private constant MAX_PATTERNS = 1024;
    uint256 private constant N = 2;

    uint8 private constant WHITE_R = 255;
    uint8 private constant WHITE_G = 255;
    uint8 private constant WHITE_B = 255;
    uint8 private constant WHITE_A = 255;

    uint8 private constant BLACK_R = 0;
    uint8 private constant BLACK_G = 0;
    uint8 private constant BLACK_B = 0;
    uint16 private constant BLACK_INDEX = type(uint16).max - 1;

    uint256 private constant FP_SCALE = 1000;
    uint256 private constant U32_MOD = 1 << 32;
    uint256 private constant LCG_A = 1664525;
    uint256 private constant LCG_C = 1013904223;

    uint32 private constant SEED_TAG_SAMPLE = 0x53414d50;
    uint32 private constant SEED_TAG_WFC = 0x57464330;
    uint32 private constant SEED_TAG_VISUAL = 0x56495330;

    uint64 public constant DEFAULT_MAX_TICKS = 30_000;
    uint64 public constant SVG_CLOSEOUT_RESERVE_TICKS = 5_000;

    uint8 public constant STATUS_OK = 0;
    uint8 public constant STATUS_EXHAUSTED = 1;
    uint8 public constant STATUS_CONTRADICTION = 2;
    uint32 public constant NO_CONTRADICTION_CELL = type(uint32).max;

    uint8 public constant PHASE_SEED = 0;
    uint8 public constant PHASE_PALETTE = 1;
    uint8 public constant PHASE_PATTERNS = 2;
    uint8 public constant PHASE_PROPAGATOR = 3;
    uint8 public constant PHASE_WFC_INIT = 4;
    uint8 public constant PHASE_WFC_OBSERVE = 5;
    uint8 public constant PHASE_WFC_PROPAGATE = 6;
    uint8 public constant PHASE_FRAME_RENDER = 7;
    uint8 public constant PHASE_TITLE_RENDER = 8;
    uint8 public constant PHASE_SVG_FINALIZE = 9;

    struct TickState {
        uint64 ticksUsed;
        uint64 maxTicks;
        bool exhausted;
        uint8 phase;
    }

    struct Color {
        uint8 r;
        uint8 g;
        uint8 b;
        uint8 a;
    }

    struct Rng {
        uint32 state;
    }

    struct PaletteSample {
        Color[] palette;
        uint16[] sample;
        uint32[256] charColors;
        uint256 width;
        uint256 height;
        bool hasBlank;
        uint16 blankIndex;
    }

    struct PatternSet {
        uint16[] patterns;
        uint16[] weights;
        uint16[] baseCompatible;
        uint256 patternCount;
    }

    struct WfcState {
        bool[] wave;
        uint16[] counts;
        uint16[] compatible;
        uint32[] stackCells;
        uint16[] stackPatterns;
        uint256 stackSize;
        bool hasContradiction;
        uint256 contradictionCell;
    }

    function preview(uint256 accountAddress, uint64 index, string calldata text) external pure returns (string memory) {
        (string memory svg,,,,,,,) = _previewCore(accountAddress, index, text, DEFAULT_MAX_TICKS);
        return svg;
    }

    function previewWithFuel(
        uint256 accountAddress,
        uint64 index,
        string calldata text,
        uint64 maxTicks
    ) external pure returns (string memory svg, uint64 ticksUsed, uint8 status, uint8 phase) {
        (svg, ticksUsed, status, phase,,,,) = _previewCore(accountAddress, index, text, maxTicks);
    }

    function previewMetrics(
        uint256 accountAddress,
        uint64 index,
        string calldata text,
        uint64 maxTicks
    ) external pure returns (uint64 ticksUsed, uint8 phase, uint32 gridSize, uint32 patternCount, uint32 frameCount, uint32 contradictionCell, uint8 status) {
        (, ticksUsed, status, phase, gridSize, patternCount, frameCount, contradictionCell) = _previewCore(accountAddress, index, text, maxTicks);
    }

    function _previewCore(
        uint256 accountAddress,
        uint64 index,
        string memory text,
        uint64 maxTicks
    )
        internal
        pure
        returns (
            string memory svg,
            uint64 ticksUsed,
            uint8 status,
            uint8 phase,
            uint32 gridSize,
            uint32 patternCount,
            uint32 frameCount,
            uint32 contradictionCell
        )
    {
        TickState memory state = _tickStateNew(maxTicks);
        _setPhase(state, PHASE_SEED);

        bytes memory trimmed = _truncateText(bytes(text), MAX_TEXT_LEN, state);
        uint256 gridSize256 = _computeN(trimmed.length);
        gridSize = uint32(gridSize256);

        if (state.exhausted) {
            svg = _renderExhaustedSvg(trimmed, state.phase);
            return (svg, state.ticksUsed, STATUS_EXHAUSTED, state.phase, gridSize, 0, 0, NO_CONTRADICTION_CELL);
        }

        uint32 baseSeed = _computeSeed32WithTicks(accountAddress, index, trimmed, state);
        uint32 sampleSeed = _mixSeed(baseSeed, SEED_TAG_SAMPLE);
        uint32 wfcSeed = _mixSeed(baseSeed, SEED_TAG_WFC);
        uint32 visualSeed = _mixSeed(baseSeed, SEED_TAG_VISUAL);

        if (state.exhausted) {
            svg = _renderExhaustedSvg(trimmed, state.phase);
            return (svg, state.ticksUsed, STATUS_EXHAUSTED, state.phase, gridSize, 0, 0, NO_CONTRADICTION_CELL);
        }

        _setPhase(state, PHASE_PALETTE);
        PaletteSample memory paletteSample = _buildPaletteAndSample(trimmed, sampleSeed, state);
        if (state.exhausted) {
            svg = _renderExhaustedSvg(trimmed, state.phase);
            return (svg, state.ticksUsed, STATUS_EXHAUSTED, state.phase, gridSize, 0, 0, NO_CONTRADICTION_CELL);
        }

        _setPhase(state, PHASE_PATTERNS);
        PatternSet memory patternSet = _buildPatterns(
            paletteSample.sample,
            paletteSample.width,
            paletteSample.height,
            uint16(paletteSample.palette.length),
            paletteSample.hasBlank,
            paletteSample.blankIndex,
            state
        );
        patternCount = uint32(patternSet.patternCount);

        if (state.exhausted) {
            svg = _renderExhaustedSvg(trimmed, state.phase);
            return (svg, state.ticksUsed, STATUS_EXHAUSTED, state.phase, gridSize, patternCount, 0, NO_CONTRADICTION_CELL);
        }

        (svg, frameCount, contradictionCell, status) = _renderSvg(
            paletteSample.palette,
            patternSet.patterns,
            patternSet.weights,
            patternSet.baseCompatible,
            patternSet.patternCount,
            gridSize256,
            wfcSeed,
            visualSeed,
            trimmed,
            state
        );

        ticksUsed = state.ticksUsed;
        phase = state.phase;
    }

    function _tickStateNew(uint64 maxTicks) private pure returns (TickState memory) {
        return TickState({ticksUsed: 0, maxTicks: maxTicks, exhausted: false, phase: PHASE_SEED});
    }

    function _setPhase(TickState memory state, uint8 phase) private pure {
        state.phase = phase;
    }

    function _tick(TickState memory state, uint64 amount) private pure returns (bool) {
        if (state.exhausted) {
            return false;
        }
        uint64 next = state.ticksUsed + amount;
        state.ticksUsed = next;
        if (next > state.maxTicks) {
            state.exhausted = true;
            return false;
        }
        return true;
    }

    function _ticksRemaining(TickState memory state) private pure returns (uint64) {
        if (state.ticksUsed >= state.maxTicks) {
            return 0;
        }
        return state.maxTicks - state.ticksUsed;
    }

    function _ensureBudget(TickState memory state, uint64 needed) private pure returns (bool) {
        if (_ticksRemaining(state) <= needed) {
            state.exhausted = true;
            return false;
        }
        return true;
    }

    function _rngNew(uint32 seed) private pure returns (Rng memory) {
        return Rng({state: seed});
    }

    function _rngNextU32(Rng memory rng) private pure returns (uint32) {
        uint256 next = uint256(rng.state) * LCG_A + LCG_C;
        rng.state = uint32(next % U32_MOD);
        return rng.state;
    }

    function _rngNextU8(Rng memory rng) private pure returns (uint8) {
        return uint8(_rngNextU32(rng));
    }

    function _rngNextUint(Rng memory rng, uint256 max) private pure returns (uint256) {
        if (max == 0) {
            return 0;
        }
        return uint256(_rngNextU32(rng)) % max;
    }

    function _rngBool(Rng memory rng) private pure returns (bool) {
        return (_rngNextU32(rng) & 1) == 1;
    }

    function _mixSeed(uint32 seed, uint32 tag) private pure returns (uint32) {
        return seed ^ tag;
    }

    function _remapFixed(uint32 min, uint32 max, Rng memory rng) private pure returns (uint32) {
        if (min > max) {
            return _remapFixed(max, min, rng);
        }
        uint256 range = uint256(max) - uint256(min);
        if (range == 0) {
            return min;
        }
        uint256 value = (uint256(_rngNextU32(rng)) * range) / U32_MOD;
        return uint32(uint256(min) + value);
    }

    function _truncateText(bytes memory text, uint256 maxLen, TickState memory state) private pure returns (bytes memory out) {
        uint256 limit = text.length > maxLen ? maxLen : text.length;
        out = new bytes(limit);
        for (uint256 i = 0; i < limit; i++) {
            if (!_tick(state, 1)) {
                assembly ("memory-safe") {
                    mstore(out, i)
                }
                return out;
            }
            out[i] = text[i];
        }
    }

    function _computeSeed32WithTicks(
        uint256 accountAddress,
        uint64 index,
        bytes memory text,
        TickState memory state
    ) private pure returns (uint32) {
        uint256 low = accountAddress & ((uint256(1) << 128) - 1);
        uint256 high = (accountAddress >> 128) & ((uint256(1) << 128) - 1);
        uint256 seed = (low ^ high) % ThoughtSeedLib.RNG_MOD;
        seed = (seed + index) % ThoughtSeedLib.RNG_MOD;
        for (uint256 i = 0; i < text.length; i++) {
            if (!_tick(state, 2)) {
                break;
            }
            seed = (seed * 131 + uint8(text[i])) % ThoughtSeedLib.RNG_MOD;
        }
        return uint32(seed);
    }

    function _computeN(uint256 len) private pure returns (uint256) {
        if (len > 5) {
            return 5 + _isqrtRound(len - 5);
        }
        return len + 1;
    }

    function _isqrtRound(uint256 value) private pure returns (uint256) {
        if (value == 0) {
            return 0;
        }
        uint256 lo = 0;
        uint256 hi = value;
        uint256 floor = 0;
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            uint256 sq = mid * mid;
            if (sq == value) {
                return mid;
            }
            if (sq < value) {
                floor = mid;
                lo = mid + 1;
            } else {
                if (mid == 0) {
                    break;
                }
                hi = mid - 1;
            }
        }
        uint256 high = floor + 1;
        uint256 lowDiff = value - floor * floor;
        uint256 highDiff = high * high - value;
        return lowDiff >= highDiff ? high : floor;
    }

    function _fpMul(uint32 a, uint32 b) private pure returns (uint32) {
        return uint32((uint256(a) * uint256(b)) / FP_SCALE);
    }

    function _fpDiv(uint32 a, uint32 b) private pure returns (uint32) {
        if (b == 0) {
            return 0;
        }
        return uint32((uint256(a) * FP_SCALE) / uint256(b));
    }

    function _ceilDiv(uint256 value, uint256 divisor) private pure returns (uint256) {
        if (divisor == 0) {
            return 0;
        }
        return (value + divisor - 1) / divisor;
    }

    function _repeatByte(bytes1 value, uint256 count) private pure returns (bytes memory out) {
        out = new bytes(count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = value;
        }
    }

    function _splitWords(bytes memory text, TickState memory state) private pure returns (bytes[] memory words) {
        bytes[] memory temp = new bytes[](MAX_TEXT_LEN + 1);
        uint256 count = 0;
        bytes memory current = new bytes(0);
        uint256 i = 0;

        while (i < text.length) {
            if (!_tick(state, 1)) {
                break;
            }
            bytes1 ch = text[i];
            if (ch == bytes1(uint8(10))) {
                temp[count] = current;
                count++;
                current = new bytes(0);
                i++;
                continue;
            }
            if (ch == bytes1(uint8(32))) {
                uint256 j = i;
                while (j < text.length) {
                    if (!_tick(state, 1)) {
                        break;
                    }
                    if (text[j] != bytes1(uint8(32))) {
                        break;
                    }
                    j++;
                }
                uint256 span = j - i;
                if (current.length > 0) {
                    temp[count] = current;
                    count++;
                    current = span > 0 ? _repeatByte(bytes1(uint8(32)), span - 1) : new bytes(0);
                } else {
                    current = bytes.concat(current, _repeatByte(bytes1(uint8(32)), span));
                }
                i = j;
                continue;
            }
            current = bytes.concat(current, abi.encodePacked(ch));
            i++;
        }

        if (current.length > 0) {
            temp[count] = current;
            count++;
        }

        words = new bytes[](count);
        for (uint256 k = 0; k < count; k++) {
            words[k] = temp[k];
        }
    }

    function _encodeColorKey(uint8 r, uint8 g, uint8 b, uint8 a) private pure returns (uint32) {
        return (uint32(r) << 24) | (uint32(g) << 16) | (uint32(b) << 8) | uint32(a);
    }

    function _decodeColorKey(uint32 key) private pure returns (Color memory) {
        return Color({
            r: uint8(key >> 24),
            g: uint8(key >> 16),
            b: uint8(key >> 8),
            a: uint8(key)
        });
    }

    function _buildPaletteAndSample(bytes memory text, uint32 seed, TickState memory state) private pure returns (PaletteSample memory result) {
        bytes[] memory words = _splitWords(text, state);
        uint256 wordMaxLen = 0;
        for (uint256 i = 0; i < words.length; i++) {
            if (state.exhausted) {
                break;
            }
            if (words[i].length > wordMaxLen) {
                wordMaxLen = words[i].length;
            }
        }

        Rng memory rng = _rngNew(seed);
        result.charColors[32] = _encodeColorKey(WHITE_R, WHITE_G, WHITE_B, WHITE_A);
        result.charColors[10] = _encodeColorKey(WHITE_R, WHITE_G, WHITE_B, WHITE_A);

        bool[256] memory seenChars;
        seenChars[32] = true;
        seenChars[10] = true;

        for (uint256 w = 0; w < words.length; w++) {
            if (state.exhausted) {
                break;
            }
            bytes memory word = words[w];
            for (uint256 i = 0; i < word.length; i++) {
                if (!_tick(state, 2)) {
                    break;
                }
                uint8 ch = uint8(word[i]);
                if (!seenChars[ch]) {
                    seenChars[ch] = true;
                    if (ch == 32 || ch == 10) {
                        result.charColors[ch] = _encodeColorKey(WHITE_R, WHITE_G, WHITE_B, WHITE_A);
                    } else {
                        result.charColors[ch] = _encodeColorKey(
                            _rngNextU8(rng),
                            _rngNextU8(rng),
                            _rngNextU8(rng),
                            WHITE_A
                        );
                    }
                }
            }
        }

        uint256 charGridSize = wordMaxLen * words.length;
        uint8[] memory charGrid = new uint8[](charGridSize);
        for (uint256 y = 0; y < words.length; y++) {
            if (state.exhausted) {
                break;
            }
            bytes memory word = words[y];
            for (uint256 x = 0; x < word.length; x++) {
                if (!_tick(state, 1)) {
                    break;
                }
                charGrid[y * wordMaxLen + x] = uint8(word[x]) + 1;
            }
        }

        uint256 tilePx = 2;
        result.width = wordMaxLen * tilePx;
        result.height = words.length * tilePx;
        result.sample = new uint16[](result.width * result.height);

        Color[] memory paletteTemp = new Color[](MAX_PALETTE);
        uint32[] memory paletteKeys = new uint32[](MAX_PALETTE);
        uint256 paletteCount = 0;

        for (uint256 y = 0; y < result.height; y++) {
            if (state.exhausted) {
                break;
            }
            for (uint256 x = 0; x < result.width; x++) {
                if (!_tick(state, 1)) {
                    break;
                }
                uint256 charX = x / tilePx;
                uint256 charY = y / tilePx;
                uint8 stored = charGrid[charY * wordMaxLen + charX];
                uint32 colorKey = stored == 0 ? 0 : result.charColors[stored - 1];

                (uint16 paletteIndex, uint256 nextCount, bool added) = _paletteFindOrAdd(
                    paletteTemp,
                    paletteKeys,
                    paletteCount,
                    colorKey
                );
                if (added) {
                    _tick(state, 5);
                    paletteCount = nextCount;
                    if (colorKey == 0) {
                        result.hasBlank = true;
                        result.blankIndex = paletteIndex;
                    }
                }
                result.sample[y * result.width + x] = paletteIndex;
            }
        }

        result.palette = new Color[](paletteCount);
        for (uint256 i = 0; i < paletteCount; i++) {
            result.palette[i] = paletteTemp[i];
        }
    }

    function _paletteFindOrAdd(
        Color[] memory paletteTemp,
        uint32[] memory paletteKeys,
        uint256 paletteCount,
        uint32 colorKey
    ) private pure returns (uint16 paletteIndex, uint256 nextCount, bool added) {
        for (uint256 i = 0; i < paletteCount; i++) {
            if (paletteKeys[i] == colorKey) {
                return (uint16(i), paletteCount, false);
            }
        }

        if (paletteCount >= MAX_PALETTE) {
            return (uint16(paletteCount - 1), paletteCount, false);
        }

        paletteKeys[paletteCount] = colorKey;
        paletteTemp[paletteCount] = _decodeColorKey(colorKey);
        return (uint16(paletteCount), paletteCount + 1, true);
    }

    function _encodePattern(uint16 p0, uint16 p1, uint16 p2, uint16 p3, uint16 base) private pure returns (uint256) {
        uint256 value = p0;
        value = value * base + p1;
        value = value * base + p2;
        value = value * base + p3;
        return value;
    }

    function _rotatePattern(uint16 p0, uint16 p1, uint16 p2, uint16 p3) private pure returns (uint16, uint16, uint16, uint16) {
        return (p1, p3, p0, p2);
    }

    function _reflectPattern(uint16 p0, uint16 p1, uint16 p2, uint16 p3) private pure returns (uint16, uint16, uint16, uint16) {
        return (p1, p0, p3, p2);
    }

    function _patternHasBlank(bool hasBlank, uint16 blankIndex, uint16 p0, uint16 p1, uint16 p2, uint16 p3) private pure returns (bool) {
        if (!hasBlank) {
            return false;
        }
        return p0 == blankIndex || p1 == blankIndex || p2 == blankIndex || p3 == blankIndex;
    }

    function _sampleAt(uint16[] memory sample, uint256 width, uint256 x, uint256 y) private pure returns (uint16) {
        return sample[y * width + x];
    }

    function _buildPatterns(
        uint16[] memory sample,
        uint256 width,
        uint256 height,
        uint16 paletteLen,
        bool hasBlank,
        uint16 blankIndex,
        TickState memory state
    ) private pure returns (PatternSet memory result) {
        if (width < N || height < N) {
            result.patterns = new uint16[](0);
            result.weights = new uint16[](0);
            result.baseCompatible = new uint16[](0);
            result.patternCount = 0;
            return result;
        }

        uint16[] memory patternTemp = new uint16[](MAX_PATTERNS * 4);
        uint16[] memory weightTemp = new uint16[](MAX_PATTERNS);
        uint256[] memory patternKeys = new uint256[](MAX_PATTERNS);
        uint256 patternCountLocal = 0;

        for (uint256 y = 0; y < height; y++) {
            if (state.exhausted) {
                break;
            }
            for (uint256 x = 0; x < width; x++) {
                if (!_tick(state, 1)) {
                    break;
                }
                uint16 p0 = _sampleAt(sample, width, x % width, y % height);
                uint16 p1 = _sampleAt(sample, width, (x + 1) % width, y % height);
                uint16 p2 = _sampleAt(sample, width, x % width, (y + 1) % height);
                uint16 p3 = _sampleAt(sample, width, (x + 1) % width, (y + 1) % height);

                if (_patternHasBlank(hasBlank, blankIndex, p0, p1, p2, p3)) {
                    continue;
                }

                (uint16[32] memory variants0, uint256 variantCount) = _buildPatternVariants(p0, p1, p2, p3);
                for (uint256 k = 0; k < variantCount; k++) {
                    if (!_tick(state, 1)) {
                        break;
                    }
                    patternCountLocal = _insertPatternVariant(
                        patternTemp,
                        weightTemp,
                        patternKeys,
                        patternCountLocal,
                        variants0[k * 4 + 0],
                        variants0[k * 4 + 1],
                        variants0[k * 4 + 2],
                        variants0[k * 4 + 3],
                        paletteLen,
                        state
                    );
                }
            }
        }

        result.patterns = new uint16[](patternCountLocal * 4);
        result.weights = new uint16[](patternCountLocal);
        result.baseCompatible = new uint16[](patternCountLocal * 4);
        result.patternCount = patternCountLocal;

        for (uint256 i = 0; i < patternCountLocal; i++) {
            result.weights[i] = weightTemp[i];
            uint256 offset = i * 4;
            result.patterns[offset + 0] = patternTemp[offset + 0];
            result.patterns[offset + 1] = patternTemp[offset + 1];
            result.patterns[offset + 2] = patternTemp[offset + 2];
            result.patterns[offset + 3] = patternTemp[offset + 3];
        }

        for (uint256 t = 0; t < patternCountLocal; t++) {
            for (uint256 d = 0; d < 4; d++) {
                uint16 support = 0;
                for (uint256 s = 0; s < patternCountLocal; s++) {
                    if (_patternAgrees(result.patterns, s, t, _oppositeDir(d))) {
                        support += 1;
                    }
                }
                result.baseCompatible[t * 4 + d] = support;
            }
        }
    }

    function _buildPatternVariants(uint16 p0, uint16 p1, uint16 p2, uint16 p3) private pure returns (uint16[32] memory variants, uint256 count) {
        (uint16 r20, uint16 r21, uint16 r22, uint16 r23) = _rotatePattern(p0, p1, p2, p3);
        (uint16 r40, uint16 r41, uint16 r42, uint16 r43) = _rotatePattern(r20, r21, r22, r23);
        (uint16 r60, uint16 r61, uint16 r62, uint16 r63) = _rotatePattern(r40, r41, r42, r43);
        (uint16 f10, uint16 f11, uint16 f12, uint16 f13) = _reflectPattern(p0, p1, p2, p3);
        (uint16 f30, uint16 f31, uint16 f32, uint16 f33) = _reflectPattern(r20, r21, r22, r23);
        (uint16 f50, uint16 f51, uint16 f52, uint16 f53) = _reflectPattern(r40, r41, r42, r43);
        (uint16 f70, uint16 f71, uint16 f72, uint16 f73) = _reflectPattern(r60, r61, r62, r63);

        uint16[32] memory data = [
            p0, p1, p2, p3,
            f10, f11, f12, f13,
            r20, r21, r22, r23,
            f30, f31, f32, f33,
            r40, r41, r42, r43,
            f50, f51, f52, f53,
            r60, r61, r62, r63,
            f70, f71, f72, f73
        ];
        return (data, 8);
    }

    function _insertPatternVariant(
        uint16[] memory patternTemp,
        uint16[] memory weightTemp,
        uint256[] memory patternKeys,
        uint256 patternCountLocal,
        uint16 a,
        uint16 b,
        uint16 c,
        uint16 d,
        uint16 paletteLen,
        TickState memory state
    ) private pure returns (uint256) {
        uint256 key = _encodePattern(a, b, c, d, paletteLen);
        for (uint256 i = 0; i < patternCountLocal; i++) {
            if (patternKeys[i] == key) {
                _tick(state, 2);
                weightTemp[i] += 1;
                return patternCountLocal;
            }
        }

        if (patternCountLocal >= MAX_PATTERNS) {
            return patternCountLocal;
        }

        _tick(state, 2);
        patternKeys[patternCountLocal] = key;
        uint256 offset = patternCountLocal * 4;
        patternTemp[offset + 0] = a;
        patternTemp[offset + 1] = b;
        patternTemp[offset + 2] = c;
        patternTemp[offset + 3] = d;
        weightTemp[patternCountLocal] = 1;
        return patternCountLocal + 1;
    }

    function _patternAt(uint16[] memory patterns, uint256 t, uint256 idx) private pure returns (uint16) {
        return patterns[t * 4 + idx];
    }

    function _patternAgrees(uint16[] memory patterns, uint256 t1, uint256 t2, uint256 dir) private pure returns (bool) {
        uint16 a1 = _patternAt(patterns, t1, 0);
        uint16 b1 = _patternAt(patterns, t1, 1);
        uint16 c1 = _patternAt(patterns, t1, 2);
        uint16 d1 = _patternAt(patterns, t1, 3);

        uint16 a2 = _patternAt(patterns, t2, 0);
        uint16 b2 = _patternAt(patterns, t2, 1);
        uint16 c2 = _patternAt(patterns, t2, 2);
        uint16 d2 = _patternAt(patterns, t2, 3);

        if (dir == 0) return a1 == b2 && c1 == d2;
        if (dir == 1) return c1 == a2 && d1 == b2;
        if (dir == 2) return b1 == a2 && d1 == c2;
        return a1 == c2 && b1 == d2;
    }

    function _waveIndex(uint256 cell, uint256 t, uint256 patternCount) private pure returns (uint256) {
        return cell * patternCount + t;
    }

    function _compatIndex(uint256 cell, uint256 t, uint256 dir, uint256 patternCount) private pure returns (uint256) {
        return (cell * patternCount + t) * 4 + dir;
    }

    function _oppositeDir(uint256 dir) private pure returns (uint256) {
        if (dir == 0) return 2;
        if (dir == 1) return 3;
        if (dir == 2) return 0;
        return 1;
    }

    function _banWfc(WfcState memory wfc, uint256 cell, uint256 t, uint256 patternCount) private pure {
        uint256 widx = _waveIndex(cell, t, patternCount);
        if (!wfc.wave[widx]) {
            return;
        }
        wfc.wave[widx] = false;
        for (uint256 d = 0; d < 4; d++) {
            wfc.compatible[_compatIndex(cell, t, d, patternCount)] = 0;
        }

        wfc.stackCells[wfc.stackSize] = uint32(cell);
        wfc.stackPatterns[wfc.stackSize] = uint16(t);
        wfc.stackSize += 1;

        uint16 count = wfc.counts[cell];
        if (count > 0) {
            count -= 1;
            wfc.counts[cell] = count;
            if (count == 0 && !wfc.hasContradiction) {
                wfc.hasContradiction = true;
                wfc.contradictionCell = cell;
            }
        }
    }

    function _initWfcState(
        WfcState memory wfc,
        uint16[] memory baseCompatible,
        uint256 patternCount,
        uint256 gridSize,
        TickState memory state
    ) private pure {
        uint256 cells = gridSize * gridSize;
        for (uint256 cell = 0; cell < cells; cell++) {
            if (state.exhausted) {
                break;
            }
            for (uint256 t = 0; t < patternCount; t++) {
                if (!_tick(state, 1)) {
                    break;
                }
                wfc.wave[_waveIndex(cell, t, patternCount)] = true;
                for (uint256 d = 0; d < 4; d++) {
                    if (!_tick(state, 1)) {
                        break;
                    }
                    wfc.compatible[_compatIndex(cell, t, d, patternCount)] = baseCompatible[t * 4 + d];
                }
            }
            wfc.counts[cell] = uint16(patternCount);
        }
    }

    function _observeWfc(
        WfcState memory wfc,
        uint16[] memory weights,
        uint256 patternCount,
        uint256 gridSize,
        Rng memory rng,
        TickState memory state
    ) private pure returns (uint8) {
        uint256 cells = gridSize * gridSize;
        uint16 min = type(uint16).max;
        uint256 argmin = 0;
        bool hasArgmin = false;

        for (uint256 i = 0; i < cells; i++) {
            if (!_tick(state, 1)) {
                return STATUS_EXHAUSTED;
            }
            uint16 count = wfc.counts[i];
            if (count == 0) {
                if (!wfc.hasContradiction) {
                    wfc.hasContradiction = true;
                    wfc.contradictionCell = i;
                }
                return STATUS_CONTRADICTION;
            }
            if (count > 1) {
                if (count < min || (count == min && _rngBool(rng))) {
                    min = count;
                    argmin = i;
                    hasArgmin = true;
                }
            }
        }

        if (!hasArgmin) {
            return STATUS_OK;
        }

        uint256 sumWeights = 0;
        for (uint256 t = 0; t < patternCount; t++) {
            if (!_tick(state, 1)) {
                return STATUS_EXHAUSTED;
            }
            if (wfc.wave[_waveIndex(argmin, t, patternCount)]) {
                sumWeights += weights[t];
            }
        }

        uint256 choice = 0;
        if (sumWeights > 0) {
            uint256 pick = _rngNextUint(rng, sumWeights);
            uint256 acc = 0;
            for (uint256 t = 0; t < patternCount; t++) {
                if (wfc.wave[_waveIndex(argmin, t, patternCount)]) {
                    acc += weights[t];
                    if (pick < acc) {
                        choice = t;
                        break;
                    }
                }
            }
        }

        for (uint256 t = 0; t < patternCount; t++) {
            if (t != choice) {
                _banWfc(wfc, argmin, t, patternCount);
            }
        }

        return 255;
    }

    function _propagateWfc(
        WfcState memory wfc,
        uint16[] memory patterns,
        uint256 patternCount,
        uint256 gridSize,
        TickState memory state
    ) private pure {
        while (wfc.stackSize > 0) {
            if (!_tick(state, 1)) {
                return;
            }

            wfc.stackSize -= 1;
            uint256 cellA = wfc.stackCells[wfc.stackSize];
            uint256 patternA = wfc.stackPatterns[wfc.stackSize];
            uint256 x = cellA % gridSize;
            uint256 y = cellA / gridSize;

            for (uint256 dir = 0; dir < 4; dir++) {
                (uint256 nx, uint256 ny) = _neighbor(x, y, gridSize, dir);
                uint256 neighbor = ny * gridSize + nx;
                uint256 oppDir = _oppositeDir(dir);

                for (uint256 t2 = 0; t2 < patternCount; t2++) {
                    if (!_tick(state, 1)) {
                        return;
                    }
                    uint256 waveIdx = _waveIndex(neighbor, t2, patternCount);
                    if (!wfc.wave[waveIdx]) {
                        continue;
                    }
                    if (_patternAgrees(patterns, patternA, t2, dir)) {
                        uint256 cidx = _compatIndex(neighbor, t2, oppDir, patternCount);
                        uint16 comp = wfc.compatible[cidx];
                        if (comp > 0) {
                            comp -= 1;
                            wfc.compatible[cidx] = comp;
                            if (comp == 0) {
                                _banWfc(wfc, neighbor, t2, patternCount);
                                if (wfc.hasContradiction) {
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function _neighbor(uint256 x, uint256 y, uint256 gridSize, uint256 dir) private pure returns (uint256 nx, uint256 ny) {
        if (dir == 0) {
            return (x == 0 ? gridSize - 1 : x - 1, y);
        }
        if (dir == 1) {
            return (x, y + 1 >= gridSize ? 0 : y + 1);
        }
        if (dir == 2) {
            return (x + 1 >= gridSize ? 0 : x + 1, y);
        }
        return (x, y == 0 ? gridSize - 1 : y - 1);
    }

    function _estimateFrameCost(uint256 gridSize, uint256 patternCount, bool generationComplete) private pure returns (uint64) {
        uint64 cells = uint64(gridSize * gridSize);
        if (cells == 0) {
            return 0;
        }
        uint64 perCell = generationComplete ? 3 : uint64(3 + N * N * patternCount);
        return cells * perCell;
    }

    function _renderSvg(
        Color[] memory palette,
        uint16[] memory patterns,
        uint16[] memory weights,
        uint16[] memory baseCompatible,
        uint256 patternCount,
        uint256 gridSize,
        uint32 wfcSeed,
        uint32 visualSeed,
        bytes memory text,
        TickState memory state
    ) private pure returns (string memory svg, uint32 frameCountOut, uint32 contradictionCellOut, uint8 status) {
        contradictionCellOut = NO_CONTRADICTION_CELL;

        uint32 canvas = 10_000;
        uint32 gapFracFp = 0;
        uint32 paddingFracFp = 100;
        uint32 opacityMinFp = 100;
        uint32 opacityMaxFp = 1000;
        uint32 mainFracFp = uint32(FP_SCALE);
        uint32 footerX = 800;
        uint32 footerY = 9500;
        uint32 footerFont = 400;

        Rng memory visualRng = _rngNew(visualSeed);
        uint32 opacity = _remapFixed(opacityMinFp, opacityMaxFp, visualRng);
        uint32 canvasScale = (canvas * uint32(FP_SCALE)) / 10_000;
        uint32 strokeWidth = _min(_fpDiv(_remapFixed(opacityMinFp, opacityMaxFp, visualRng), canvasScale), 125);

        uint32 widthFp = canvas;
        uint32 heightFp = canvas;
        uint32 mainHeight = _fpMul(heightFp, mainFracFp);
        uint32 padding = _fpMul(widthFp, paddingFracFp);
        uint32 inner = widthFp - 2 * padding;
        uint32 gridU32 = uint32(gridSize);
        uint32 step = gridU32 == 0 ? 0 : inner / gridU32;
        uint32 gapBetween = _fpMul(step, gapFracFp);
        uint32 inset = gapBetween / 2;
        uint32 cellSize = step - gapBetween;
        uint32 translateX = (widthFp - inner) / 2 + inset;
        uint32 translateY = (heightFp - inner) / 2 + inset;
        uint32 mainScale = _fpDiv(mainHeight, heightFp);
        uint32 mainOffsetX = (widthFp - _fpMul(widthFp, mainScale)) / 2;
        uint64 reserve = SVG_CLOSEOUT_RESERVE_TICKS;
        uint64 cellsU64 = uint64(gridSize * gridSize);

        if (state.exhausted || !_ensureBudget(state, reserve)) {
            return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
        }

        bool hasContradiction = false;
        uint256 contradictionCell = 0;
        uint256 frameCount = 0;
        bool generationComplete = false;
        WfcState memory wfc;

        if (patternCount == 0) {
            wfc = WfcState({
                wave: new bool[](0),
                counts: new uint16[](gridSize * gridSize),
                compatible: new uint16[](0),
                stackCells: new uint32[](0),
                stackPatterns: new uint16[](0),
                stackSize: 0,
                hasContradiction: false,
                contradictionCell: 0
            });
            if (gridSize > 0) {
                hasContradiction = true;
                contradictionCell = 0;
            }
            frameCount = 1;
        } else {
            _setPhase(state, PHASE_PROPAGATOR);
            uint64 propagatorCost = uint64(4 * patternCount * patternCount);
            if (!_ensureBudget(state, reserve + propagatorCost)) {
                return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
            }

            wfc = WfcState({
                wave: new bool[](gridSize * gridSize * patternCount),
                counts: new uint16[](gridSize * gridSize),
                compatible: new uint16[](gridSize * gridSize * patternCount * 4),
                stackCells: new uint32[](gridSize * gridSize * patternCount),
                stackPatterns: new uint16[](gridSize * gridSize * patternCount),
                stackSize: 0,
                hasContradiction: false,
                contradictionCell: 0
            });

            _setPhase(state, PHASE_WFC_INIT);
            uint64 initCost = cellsU64 * uint64(patternCount) * 5;
            if (!_ensureBudget(state, reserve + initCost)) {
                return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
            }
            _initWfcState(wfc, baseCompatible, patternCount, gridSize, state);
            if (state.exhausted) {
                return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
            }

            Rng memory wfcRng = _rngNew(wfcSeed);

            while (true) {
                _setPhase(state, PHASE_WFC_OBSERVE);
                uint8 observeResult = _observeWfc(wfc, weights, patternCount, gridSize, wfcRng, state);
                if (state.exhausted) {
                    return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
                }

                generationComplete = observeResult == STATUS_OK;
                bool terminal = generationComplete || observeResult == STATUS_CONTRADICTION;

                if (!terminal) {
                    _setPhase(state, PHASE_WFC_PROPAGATE);
                    _propagateWfc(wfc, patterns, patternCount, gridSize, state);
                    if (state.exhausted) {
                        return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
                    }
                    if (wfc.hasContradiction) {
                        terminal = true;
                        observeResult = STATUS_CONTRADICTION;
                    }
                }

                if (!hasContradiction && wfc.hasContradiction) {
                    hasContradiction = true;
                    contradictionCell = wfc.contradictionCell;
                }

                frameCount += 1;
                if (terminal) {
                    break;
                }
            }
        }

        _setPhase(state, PHASE_FRAME_RENDER);
        uint64 frameCost = _estimateFrameCost(gridSize, patternCount, generationComplete) + 5;
        if (!_ensureBudget(state, reserve + frameCost)) {
            return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
        }

        bytes memory gridMarkup = _appendStaticGrid(
            new bytes(0),
            patterns,
            patternCount,
            palette,
            gridSize,
            cellSize,
            gapBetween,
            opacity,
            strokeWidth,
            wfc,
            state
        );
        if (state.exhausted) {
            return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
        }

        bytes memory blackHoleOverlay;
        if (hasContradiction) {
            uint256 cx = contradictionCell % gridSize;
            uint256 cy = contradictionCell / gridSize;
            uint32 px = step * uint32(cx) + inset;
            uint32 py = step * uint32(cy) + inset;
            blackHoleOverlay = abi.encodePacked(
                "\n<rect x=\"",
                _fixedString(px, 3),
                "\" y=\"",
                _fixedString(py, 3),
                "\" width=\"",
                _fixedString(cellSize, 3),
                "\" height=\"",
                _fixedString(cellSize, 3),
                "\" fill=\"#000000\" opacity=\"1.000\"/>"
            );
        }

        bytes memory out = abi.encodePacked(
            "<svg data-THOUGHT=\"",
            text,
            "\" width=\"100%\" height=\"100%\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\">\n\n    <rect id=\"background\" width = \"100%\" height = \"100%\" fill = \"#000000ff\" />\n\n    <g id=\"main-area\" transform=\"translate(",
            _fixedString(mainOffsetX, 3),
            " ",
            _fixedString(0, 3),
            ") scale(",
            _fixedString(mainScale, 3),
            ")\">\n        <g id=\"Iterations\" transform=\"translate(",
            _fixedString(translateX, 3),
            " , ",
            _fixedString(translateY, 3),
            ") \" style=\"isolation:isolate\">",
            gridMarkup,
            blackHoleOverlay,
            "\n        </g>\n    </g>"
        );

        if (state.exhausted) {
            return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
        }

        _setPhase(state, PHASE_TITLE_RENDER);
        out = _appendFooterText(out, text, footerX, footerY, footerFont, state);
        if (state.exhausted) {
            return (_renderExhaustedSvg(text, state.phase), 0, NO_CONTRADICTION_CELL, STATUS_EXHAUSTED);
        }

        _setPhase(state, PHASE_SVG_FINALIZE);
        _tick(state, 10);
        out = abi.encodePacked(out, "\n\n</svg>");

        frameCountOut = uint32(frameCount);
        if (hasContradiction) {
            contradictionCellOut = uint32(contradictionCell);
            status = STATUS_CONTRADICTION;
        } else {
            status = STATUS_OK;
        }
        svg = string(out);
    }

    function _appendFooterText(
        bytes memory svg,
        bytes memory text,
        uint32 footerX,
        uint32 footerY,
        uint32 footerFont,
        TickState memory state
    ) private pure returns (bytes memory out) {
        bytes memory normalized = new bytes(text.length);
        for (uint256 i = 0; i < text.length; i++) {
            if (!_tick(state, 2)) {
                assembly ("memory-safe") {
                    mstore(normalized, i)
                }
                break;
            }
            normalized[i] = text[i] == bytes1(uint8(10)) ? bytes1(uint8(32)) : text[i];
        }

        out = abi.encodePacked(
            svg,
            "\n<text x=\"",
            _fixedString(footerX, 3),
            "\" y=\"",
            _fixedString(footerY, 3),
            "\" font-family=\"monospace\" font-size=\"",
            _fixedString(footerFont, 3),
            "\" fill=\"#ffffffff\">",
            normalized,
            "</text>"
        );
    }

    function _appendStaticGrid(
        bytes memory out,
        uint16[] memory patterns,
        uint256 patternCount,
        Color[] memory palette,
        uint256 gridSize,
        uint32 cellSize,
        uint32 cellGap,
        uint32 opacity,
        uint32 strokeWidth,
        WfcState memory wfc,
        TickState memory state
    ) private pure returns (bytes memory) {
        uint32 step = cellSize + cellGap;
        uint32 inset = cellGap / 2;

        for (uint256 y = 0; y < gridSize; y++) {
            if (state.exhausted) {
                break;
            }
            for (uint256 x = 0; x < gridSize; x++) {
                if (!_tick(state, 1)) {
                    break;
                }

                Color memory color = _frameColorIncomplete(palette, patterns, wfc, patternCount, gridSize, x, y, state);
                uint32 alpha = (opacity * color.a) / 255;
                uint32 px = step * uint32(x) + inset;
                uint32 py = step * uint32(y) + inset;

                out = abi.encodePacked(
                    out,
                    "\n<rect x=\"",
                    _fixedString(px, 3),
                    "\" y=\"",
                    _fixedString(py, 3),
                    "\" width=\"",
                    _fixedString(cellSize, 3),
                    "\" height=\"",
                    _fixedString(cellSize, 3),
                    "\" fill=\"",
                    _rgbaHex(color),
                    "\" opacity=\"",
                    _fixedString(alpha, 3),
                    "\" stroke=\"#0f0f0fff\" stroke-width=\"",
                    _fixedString(strokeWidth, 3),
                    "\"/>"
                );
            }
        }

        return out;
    }

    function _appendFilter(
        bytes memory defs,
        uint256 index,
        uint32 freq,
        uint32 scale,
        uint32 seed,
        TickState memory state
    ) private pure returns (bytes memory) {
        if (!_tick(state, 5)) {
            return defs;
        }
        return abi.encodePacked(
            defs,
            "\n    <filter id=\"wobble-",
            _toString(index),
            "\"  x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\" color-interpolation-filters=\"sRGB\" primitiveUnits=\"userSpaceOnUse\">\n        <feTurbulence type=\"fractalNoise\" baseFrequency=\"",
            _fixedString(freq, 3),
            "\" numOctaves=\"2\" seed=\"",
            _toString(seed),
            "\" stitchTiles=\"stitch\" result=\"turbulence-",
            _toString(index),
            "\"/>\n        <feDisplacementMap in=\"SourceGraphic\" in2=\"turbulence-",
            _toString(index),
            "\" scale=\"",
            _fixedString(scale, 3),
            "\" xChannelSelector=\"R\" yChannelSelector=\"G\"/>\n    </filter>"
        );
    }

    function _appendFrameGroup(
        bytes memory frames,
        uint256 index,
        uint16[] memory patterns,
        uint256 patternCount,
        Color[] memory palette,
        uint256 gridSize,
        uint32 cellSize,
        uint32 cellGap,
        uint32 opacity,
        WfcState memory wfc,
        bool,
        TickState memory state
    ) private pure returns (bytes memory out) {
        out = abi.encodePacked(
            frames,
            "\n<g id=\"iteration-",
            _toString(index),
            "\" style=\"display:none; mix-blend-mode:overlay\" filter=\"url(#wobble-",
            _toString(index),
            ")\">"
        );

        uint32 step = cellSize + cellGap;
        uint32 inset = cellGap / 2;

        for (uint256 y = 0; y < gridSize; y++) {
            if (state.exhausted) {
                break;
            }
            for (uint256 x = 0; x < gridSize; x++) {
                if (!_tick(state, 1)) {
                    break;
                }

                uint256 cell = y * gridSize + x;
                uint16 count = wfc.counts.length == 0 ? 0 : wfc.counts[cell];
                bool collapsed = count == 1;
                Color memory color = _frameColorIncomplete(palette, patterns, wfc, patternCount, gridSize, x, y, state);

                uint32 alpha = (opacity * color.a) / 255;
                uint32 px = step * uint32(x) + inset;
                uint32 py = step * uint32(y) + inset;

                _tick(state, 2);
                out = abi.encodePacked(
                    out,
                    "\n<rect x=\"",
                    _fixedString(px, 3),
                    "\" y=\"",
                    _fixedString(py, 3),
                    "\" width=\"",
                    _fixedString(cellSize, 3),
                    "\" height=\"",
                    _fixedString(cellSize, 3),
                    "\"\n      data-status=\"",
                    collapsed ? "Collapsed" : "Superposition",
                    "\"\n      fill=\"",
                    _rgbaHex(color),
                    "\"\n      opacity=\"",
                    _fixedString(alpha, 3),
                    "\"/>"
                );
            }
        }

        out = abi.encodePacked(
            out,
            "\n <set attributeName=\"display\" to=\"inline\" begin=\"timeline.begin+",
            _fixedString(index, 1),
            "s\" fill=\"freeze\"/>\n</g> "
        );
    }

    function _frameColorIncomplete(
        Color[] memory palette,
        uint16[] memory patterns,
        WfcState memory wfc,
        uint256 patternCount,
        uint256 gridSize,
        uint256 x,
        uint256 y,
        TickState memory state
    ) private pure returns (Color memory) {
        uint256 contributors = 0;
        uint256 rs = 0;
        uint256 gs = 0;
        uint256 bs = 0;
        uint256 as_ = 0;

        for (uint256 dy = 0; dy < N; dy++) {
            for (uint256 dx = 0; dx < N; dx++) {
                uint256 sx = x < dx ? x + gridSize - dx : x - dx;
                uint256 sy = y < dy ? y + gridSize - dy : y - dy;
                uint256 source = sx + sy * gridSize;
                for (uint256 t = 0; t < patternCount; t++) {
                    if (state.exhausted) {
                        break;
                    }
                    if (wfc.wave[_waveIndex(source, t, patternCount)]) {
                        _tick(state, 1);
                        contributors += 1;
                        Color memory color = palette[_patternAt(patterns, t, dx + dy * N)];
                        rs += color.r;
                        gs += color.g;
                        bs += color.b;
                        as_ += color.a;
                    }
                }
            }
        }

        if (contributors == 0) {
            return Color({r: 0, g: 0, b: 0, a: 255});
        }

        return Color({
            r: uint8(rs / contributors),
            g: uint8(gs / contributors),
            b: uint8(bs / contributors),
            a: uint8(as_ / contributors)
        });
    }

    function _appendTitle(
        bytes memory svg,
        bytes memory text,
        uint32[256] memory charColors,
        uint32 titleX,
        uint32 titleY,
        uint32 titleWidth,
        uint32 titleHeight,
        TickState memory state
    ) private pure returns (bytes memory out) {
        bytes memory titleChars = new bytes(text.length);
        for (uint256 i = 0; i < text.length; i++) {
            titleChars[i] = text[i] == bytes1(uint8(10)) ? bytes1(uint8(32)) : text[i];
        }

        uint256 total = titleChars.length;
        uint256 titleCols = total == 0 ? 1 : total;
        uint32 titleCell = total == 0 ? titleHeight : _min(titleWidth / uint32(titleCols), titleHeight);

        if (total > 0) {
            for (uint256 rows = 1; rows <= total; rows++) {
                uint256 cols = _ceilDiv(total, rows);
                uint32 cell = _min(titleWidth / uint32(cols), titleHeight / uint32(rows));
                if (cell > titleCell) {
                    titleCell = cell;
                    titleCols = cols;
                }
            }
        }

        uint32 titleFont = (titleCell * 6) / 10;
        out = abi.encodePacked(svg, "\n<g id=\"title\">\n    ");

        for (uint256 idx = 0; idx < total; idx++) {
            uint8 ch = uint8(titleChars[idx]);
            if (ch == 32) {
                continue;
            }
            if (!_tick(state, 2)) {
                break;
            }

            uint32 colorKey = charColors[ch];
            Color memory color = colorKey == 0 ? Color(WHITE_R, WHITE_G, WHITE_B, WHITE_A) : _decodeColorKey(colorKey);
            uint256 row = idx / titleCols;
            uint256 col = idx % titleCols;
            uint32 px = titleX + titleCell * uint32(col);
            uint32 py = titleY + titleCell * uint32(row);
            uint32 luminance = 2126 * color.r + 7152 * color.g + 722 * color.b;
            string memory textColor = luminance > 1_530_000 ? "#000000" : "#ffffff";
            uint32 centerX = px + titleCell / 2;
            uint32 centerY = py + titleCell / 2;

            out = abi.encodePacked(
                out,
                "\n<rect x=\"",
                _fixedString(px, 3),
                "\" y=\"",
                _fixedString(py, 3),
                "\" width=\"",
                _fixedString(titleCell, 3),
                "\" height=\"",
                _fixedString(titleCell, 3),
                "\"\n      fill=\"",
                _rgbaHex(color),
                "\"/>\n<text x=\"",
                _fixedString(centerX, 3),
                "\" y=\"",
                _fixedString(centerY, 3),
                "\"\n      font-family=\"monospace\"\n      font-size=\"",
                _fixedString(titleFont, 3),
                "\"\n      text-anchor=\"middle\"\n      dominant-baseline=\"central\"\n      fill=\"",
                textColor,
                "\">",
                bytes1(ch),
                "</text>"
            );
        }

        out = abi.encodePacked(out, "\n</g>");
    }

    function _renderExhaustedSvg(bytes memory text, uint8 phase) private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\" viewBox=\"0 0 10 10\">",
                "<rect width=\"100%\" height=\"100%\" fill=\"#0a0a0a\"/>",
                "<text x=\"1\" y=\"2\" font-family=\"monospace\" font-size=\"0.6\" fill=\"#ffffff\">fuel exhausted</text>",
                "<text x=\"1\" y=\"3\" font-family=\"monospace\" font-size=\"0.4\" fill=\"#ffffff\">phase: ",
                _toString(phase),
                "</text>",
                "<text x=\"1\" y=\"4\" font-family=\"monospace\" font-size=\"0.4\" fill=\"#ffffff\">",
                text,
                "</text>",
                "</svg>"
            )
        );
    }

    function _fixedString(uint256 value, uint256 decimals) private pure returns (string memory) {
        uint256 scale = decimals == 3 ? 1000 : (decimals == 1 ? 10 : 1);
        uint256 intPart = value / scale;
        uint256 frac = value % scale;

        if (decimals == 0) {
            return _toString(intPart);
        }

        if (decimals == 3) {
            return string(
                abi.encodePacked(
                    _toString(intPart),
                    ".",
                    _digit(frac / 100),
                    _digit((frac / 10) % 10),
                    _digit(frac % 10)
                )
            );
        }

        return string(abi.encodePacked(_toString(intPart), ".", _digit(frac)));
    }

    function _digit(uint256 value) private pure returns (bytes1) {
        return bytes1(uint8(48 + (value % 10)));
    }

    function _rgbaHex(Color memory color) private pure returns (string memory) {
        bytes memory out = new bytes(9);
        out[0] = "#";
        out[1] = _hexNibble(color.r >> 4);
        out[2] = _hexNibble(color.r & 0x0f);
        out[3] = _hexNibble(color.g >> 4);
        out[4] = _hexNibble(color.g & 0x0f);
        out[5] = _hexNibble(color.b >> 4);
        out[6] = _hexNibble(color.b & 0x0f);
        out[7] = _hexNibble(color.a >> 4);
        out[8] = _hexNibble(color.a & 0x0f);
        return string(out);
    }

    function _hexNibble(uint8 value) private pure returns (bytes1) {
        return value < 10 ? bytes1(uint8(48 + value)) : bytes1(uint8(87 + value));
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits = 0;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }

    function _min(uint32 a, uint32 b) private pure returns (uint32) {
        return a < b ? a : b;
    }
}
