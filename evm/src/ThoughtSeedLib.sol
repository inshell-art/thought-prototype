// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library ThoughtSeedLib {
    uint256 internal constant RNG_MOD = 1329227995784915872903807060280344576;
    uint256 internal constant U128_MASK = (uint256(1) << 128) - 1;

    function computeSeed128(uint256 accountAddress, uint64 index, bytes memory text) internal pure returns (uint256) {
        uint256 low = accountAddress & U128_MASK;
        uint256 high = (accountAddress >> 128) & U128_MASK;
        uint256 state = _modU128(low ^ high);
        state = _modU128(state + uint256(index));

        for (uint256 i = 0; i < text.length; i++) {
            state = _modU128(state * 131 + uint8(text[i]));
        }

        return state;
    }

    function computeSeed32(uint256 accountAddress, uint64 index, bytes memory text) internal pure returns (uint32) {
        return uint32(computeSeed128(accountAddress, index, text));
    }

    function _modU128(uint256 value) private pure returns (uint256) {
        return value % RNG_MOD;
    }
}

