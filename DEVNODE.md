# THOUGHT Devnode Procedure

This procedure restores a local Anvil devnode after it restarts or loses state.

## Assumptions

- Anvil is reachable from this machine and LAN visitors at `http://192.168.0.104:8545`.
- The default Anvil account `0xf39f...2266` is the dev wallet.
- PATH artifacts are available at `/Users/bigu/Projects/path/evm`.
- The app runs on `http://192.168.0.104:5174` for LAN visitors.

## Full Reset Flow

For recoverable local state, run the devnode with persistent Anvil:

```sh
npm run devnode:start
```

This starts Anvil on `0.0.0.0:8545` and stores state at:

```text
evm/devnode-state/anvil-state.json
```

When the file exists, Anvil loads it on startup. While running, Anvil writes it periodically and on exit. This is the only exact recovery path for minted THOUGHTs, PATH ownership, consumed PATH state, nonces, tx history, and contract storage.

You can also force a snapshot while Anvil is running:

```sh
npm run devnode:save-state
```

And load a saved RPC dump into a running Anvil:

```sh
npm run devnode:load-state
```

Hardhat EDR nodes do not support `anvil_dumpState`, so they cannot exactly preserve minted THOUGHTs across process restarts. Use persistent Anvil for any session where minted local works should survive.

1. Start persistent Anvil if it is not running.

```sh
npm run devnode:start
```

2. Build contracts.

```sh
npm run build:evm
```

3. Deploy the local PATH, THOUGHT spec registry, and THOUGHT contracts.

```sh
RPC_URL=http://192.168.0.104:8545 npm run devnode:deploy
```

By default this deploys raw `THOUGHT.v1.md` bytes into `ThoughtSpecRegistry`, writes `recommendedThoughtSpec*` fields to `evm/addresses.anvil.json`, configures and freezes the PATH `THOUGHT` movement with quota `1`, and mints dev `$PATH #1` through `$PATH #10` to `0xf39f...2266`.

To change the seeded PATH count:

```sh
RPC_URL=http://192.168.0.104:8545 DEV_PATH_COUNT=20 npm run devnode:deploy
```

4. Refresh the THOUGHT app tab.

The deployment writes fresh contract addresses to `evm/addresses.anvil.json`. The browser must refresh to use those addresses.

If you run a local explorer/indexer for Anvil, provide its base URL so detail-page tx links can open there. Links are built as `<base>/tx/<hash>`.

```sh
RPC_URL=http://192.168.0.104:8545 THOUGHT_INDEXER_URL=http://192.168.0.104:4000 npm run devnode:deploy
VITE_THOUGHT_INDEXER_URL=http://192.168.0.104:4000 npm run dev -- --host 0.0.0.0 --port 5174
```

`THOUGHT_EXPLORER_URL` and `VITE_THOUGHT_EXPLORER_BASE_URL` are accepted aliases.

Without an explorer/indexer URL, tx actions copy the tx hash instead of opening a page.

5. In Rabby, make sure the selected network is local Anvil:

```text
RPC: http://192.168.0.104:8545
Chain ID: 31337
Currency: ETH
```

If Anvil is already running on `127.0.0.1:8545` and you do not want to reset state, expose it to LAN with a TCP proxy instead of restarting Anvil:

```sh
node -e 'const net=require("net"); const host="192.168.0.104"; const listenPort=8545; const targetHost="127.0.0.1"; const targetPort=8545; const server=net.createServer((client)=>{ const upstream=net.connect(targetPort,targetHost); client.pipe(upstream); upstream.pipe(client); const close=()=>{ client.destroy(); upstream.destroy(); }; client.on("error",close); upstream.on("error",close); }); server.listen(listenPort,host); setInterval(()=>{}, 60000);'
```

## Mint More Dev PATHs Without Redeploying

Use this when Anvil is still running and the current contracts should stay in place.

```sh
npm run devnode:mint-paths
```

By default this fills missing `$PATH #1` through `$PATH #10` for `0xf39f...2266`.

To mint a different range:

```sh
FIRST_PATH_ID=11 LAST_PATH_ID=20 npm run devnode:mint-paths
```

To mint to a Rabby account instead of the default dev wallet:

```sh
PATH_OWNER=0x794dd86eE3182838a9E679a677e435b26F230fB9 FIRST_PATH_ID=11 LAST_PATH_ID=20 npm run devnode:mint-paths
```

The script skips PATH ids that already exist.

## Verify Current Devnode

```sh
node - <<'NODE'
import fs from 'node:fs';
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';

const addresses = JSON.parse(fs.readFileSync('evm/addresses.anvil.json', 'utf8'));
const provider = new JsonRpcProvider(addresses.rpcUrl);
const registry = new Contract(addresses.thoughtSpecRegistry.address, [
  'function thoughtSpecMeta(bytes32 specId) view returns (bool exists, string specName, bytes32 specHash, string ref, address pointer, uint32 byteLength, uint64 registeredAt)',
  'function thoughtSpecBytes(bytes32 specId) view returns (bytes)',
], provider);
const specId = addresses.recommendedThoughtSpecId;
const localBytes = fs.readFileSync(addresses.recommendedThoughtSpecName);
const localHash = keccak256(localBytes);
const [exists, specName, specHash, ref, , byteLength] = await registry.thoughtSpecMeta(specId);
const readback = await registry.thoughtSpecBytes(specId);
console.log({ ref, byteLength: Number(byteLength), exists, match: specHash.toLowerCase() === localHash.toLowerCase() });
console.log({ specName, readbackMatch: keccak256(readback).toLowerCase() === localHash.toLowerCase() });
NODE
```

Expected:

```text
match: true
```
