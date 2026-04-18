// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SeedGenerator} from "../src/SeedGenerator.sol";
import {ThoughtPreviewer} from "../src/ThoughtPreviewer.sol";

contract ThoughtPreviewerTest {
    SeedGenerator private immutable seedGenerator = new SeedGenerator();
    ThoughtPreviewer private immutable previewer = new ThoughtPreviewer();

    function testSeedGeneratorMatchesKnownValue() public view {
        uint256 seed = seedGenerator.getSeed(0x1234, 7, "hi");
        require(seed == 80_104_116, "unexpected seed");
    }

    function testPreviewWrapperMatchesDefaultFuel() public view {
        string memory wrapped = previewer.preview(0x1234, 7, "hi");
        (string memory fueled, uint64 ticksUsed, uint8 status,) = previewer.previewWithFuel(
            0x1234,
            7,
            "hi",
            previewer.DEFAULT_MAX_TICKS()
        );

        require(keccak256(bytes(wrapped)) == keccak256(bytes(fueled)), "preview wrapper mismatch");
        require(ticksUsed > 0, "ticks should increase");
        require(status != previewer.STATUS_EXHAUSTED(), "default fuel exhausted");
    }

    function testPreviewMetricsExposeDeterministicShape() public view {
        (uint64 ticksUsed, uint8 phase, uint32 gridSize, uint32 patternCount, uint32 frameCount, uint32 contradictionCell, uint8 status) =
            previewer.previewMetrics(0x1234, 7, "hello", previewer.DEFAULT_MAX_TICKS());

        require(ticksUsed > 0, "ticks missing");
        require(gridSize == 6, "unexpected grid size");
        require(patternCount > 0, "missing patterns");
        require(phase <= previewer.PHASE_SVG_FINALIZE(), "invalid phase");
        if (status != previewer.STATUS_EXHAUSTED()) {
            require(frameCount > 0, "missing frames");
        }
        if (status == previewer.STATUS_CONTRADICTION()) {
            require(contradictionCell != previewer.NO_CONTRADICTION_CELL(), "missing contradiction cell");
        }
    }

    function testLowFuelExhausts() public view {
        (, uint64 ticksUsed, uint8 status, uint8 phase) = previewer.previewWithFuel(0x1234, 7, "hello world", 10);

        require(ticksUsed > 0, "expected some ticks");
        require(status == previewer.STATUS_EXHAUSTED(), "expected exhaustion");
        require(phase <= previewer.PHASE_SVG_FINALIZE(), "invalid phase");
    }

    function testPreviewMetricsOnShortInput() public view {
        previewer.previewMetrics(0x1234, 7, "hi", previewer.DEFAULT_MAX_TICKS());
    }
}
