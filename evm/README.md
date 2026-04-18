# EVM Contracts

This port is a transitional checkpoint. Keep it runnable, but treat it as deprecated once the planned near-greenfield refactor begins.

This directory contains the Ethereum/Foundry port of the THOUGHT contracts.

## Contracts
- `SeedGenerator.sol`: deterministic `getSeed(uint256,uint64,string)` helper.
- `ThoughtPreviewer.sol`: `preview`, `previewWithFuel`, and `previewMetrics`.

## Commands
- `forge build`
- `forge test`
- `../scripts/deploy-evm-local.sh`

## Local frontend wiring
- Deployment writes `addresses.anvil.json`.
- `src/contracts-main.ts` reads that file and calls the preview contract over JSON-RPC.
