// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ThoughtSeedLib} from "./ThoughtSeedLib.sol";

contract SeedGenerator {
    function getSeed(uint256 accountAddress, uint64 index, string calldata text) external pure returns (uint256) {
        return ThoughtSeedLib.computeSeed128(accountAddress, index, bytes(text));
    }
}

