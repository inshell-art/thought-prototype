#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, NonceManager, Wallet, ethers } from "ethers";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const privateKey =
  process.env.PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const pathEvmDir = process.env.PATH_EVM_DIR ?? "/Users/bigu/Projects/path/evm";
const addressesFile = path.join(rootDir, "evm", "addresses.anvil.json");
const thoughtSpecName = process.env.THOUGHT_SPEC_NAME ?? "THOUGHT.v1.md";
const thoughtSpecFile = path.resolve(rootDir, process.env.THOUGHT_SPEC_FILE ?? thoughtSpecName);
const thoughtSpecRef = process.env.THOUGHT_SPEC_REF ?? thoughtSpecName;
const maxThoughtSpecBytes = 20_000;
const devPathCount = BigInt(process.env.DEV_PATH_COUNT ?? "10");
const explorerUrl = (process.env.THOUGHT_EXPLORER_URL ?? process.env.THOUGHT_INDEXER_URL ?? "").trim();

const readArtifact = async (artifactPath) => {
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const bytecode =
    typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;
  if (!artifact.abi || !bytecode) {
    throw new Error(`invalid artifact: ${artifactPath}`);
  }
  return { abi: artifact.abi, bytecode };
};

const deploy = async (signer, artifactPath, args = []) => {
  const artifact = await readArtifact(artifactPath);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
};

const readThoughtSpecBytes = async () => {
  const filename = path.basename(thoughtSpecFile);
  const match = /^THOUGHT\.v([1-9][0-9]*)\.md$/.exec(thoughtSpecName);
  if (!match) {
    throw new Error(`invalid THOUGHT spec name: ${thoughtSpecName}`);
  }
  if (filename !== thoughtSpecName) {
    throw new Error(`THOUGHT spec filename/name mismatch: ${filename} != ${thoughtSpecName}`);
  }

  const bytes = await fs.readFile(thoughtSpecFile);
  if (bytes.length === 0) {
    throw new Error("THOUGHT spec file is empty");
  }
  if (bytes.length > maxThoughtSpecBytes) {
    throw new Error(`THOUGHT spec file exceeds ${maxThoughtSpecBytes} bytes`);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("THOUGHT spec file has UTF-8 BOM");
  }
  if (bytes.includes(0x0d)) {
    throw new Error("THOUGHT spec file contains CR/CRLF line endings");
  }

  const text = bytes.toString("utf8");
  if (!text.includes(`Version: v${match[1]}`)) {
    throw new Error(`THOUGHT spec file must contain Version: v${match[1]}`);
  }
  return bytes;
};

const main = async () => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const deployer = new NonceManager(wallet);
  const deployerAddress = await deployer.getAddress();
  const network = await provider.getNetwork();
  const thoughtSpecBytes = await readThoughtSpecBytes();
  const thoughtSpecId = ethers.id(thoughtSpecName);
  const thoughtSpecHash = ethers.keccak256(thoughtSpecBytes);

  const pathNft = await deploy(
    deployer,
    path.join(pathEvmDir, "artifacts", "src", "PathNFT.sol", "PathNFT.json"),
    [deployerAddress, "PATH", "PATH", ""],
  );
  const pathNftAddress = await pathNft.getAddress();
  const minterRole = ethers.id("MINTER_ROLE");
  await (await pathNft.grantRole(minterRole, deployerAddress)).wait();
  await (await pathNft.freezePublicMinter(deployerAddress)).wait();
  for (let tokenId = 1n; tokenId <= devPathCount; tokenId++) {
    await (await pathNft.safeMint(deployerAddress, tokenId, "0x")).wait();
  }

  const seedGenerator = await deploy(
    deployer,
    path.join(rootDir, "evm", "out", "SeedGenerator.sol", "SeedGenerator.json"),
  );
  const colorFontV1 = await deploy(
    deployer,
    path.join(rootDir, "evm", "out", "ColorFontV1.sol", "ColorFontV1.json"),
  );
  const thoughtPreviewer = await deploy(
    deployer,
    path.join(rootDir, "evm", "out", "ThoughtPreviewer.sol", "ThoughtPreviewer.json"),
  );
  const thoughtSpecRegistry = await deploy(
    deployer,
    path.join(rootDir, "evm", "out", "ThoughtSpecRegistry.sol", "ThoughtSpecRegistry.json"),
  );
  const [registeredSpecId, registeredSpecHash, specPointer] =
    await thoughtSpecRegistry.registerThoughtSpec.staticCall(
      thoughtSpecName,
      thoughtSpecRef,
      thoughtSpecBytes,
    );
  if (registeredSpecId !== thoughtSpecId || registeredSpecHash !== thoughtSpecHash) {
    throw new Error("THOUGHT spec static registration hash/id mismatch");
  }
  await (
    await thoughtSpecRegistry.registerThoughtSpec(
      thoughtSpecName,
      thoughtSpecRef,
      thoughtSpecBytes,
    )
  ).wait();
  const [, metaName, metaHash, metaRef, metaPointer, metaByteLength] =
    await thoughtSpecRegistry.thoughtSpecMeta(thoughtSpecId);
  if (metaName !== thoughtSpecName || metaHash !== thoughtSpecHash || metaRef !== thoughtSpecRef) {
    throw new Error("THOUGHT spec registry metadata mismatch");
  }
  if (metaPointer !== specPointer || Number(metaByteLength) !== thoughtSpecBytes.length) {
    throw new Error("THOUGHT spec registry pointer/length mismatch");
  }
  const readbackSpecBytes = await thoughtSpecRegistry.thoughtSpecBytes(thoughtSpecId);
  if (ethers.keccak256(readbackSpecBytes) !== thoughtSpecHash) {
    throw new Error("THOUGHT spec readback hash mismatch");
  }
  const thoughtSpecRegistryAddress = await thoughtSpecRegistry.getAddress();
  const thoughtNft = await deploy(
    deployer,
    path.join(rootDir, "evm", "out", "ThoughtNFT.sol", "ThoughtNFT.json"),
    [pathNftAddress, thoughtSpecRegistryAddress, await colorFontV1.getAddress()],
  );
  const thoughtNftAddress = await thoughtNft.getAddress();

  await (
    await pathNft.setMovementConfig(
      ethers.encodeBytes32String("THOUGHT"),
      thoughtNftAddress,
      1,
    )
  ).wait();
  await (
    await pathNft.freezeMovementConfig(ethers.encodeBytes32String("THOUGHT"))
  ).wait();

  const payload = {
    rpcUrl,
    chainId: Number(network.chainId),
    ...(explorerUrl ? { explorerUrl } : {}),
    pathNft: { address: pathNftAddress },
    pathMovement: { name: "THOUGHT", quota: 1, frozen: true },
    devPathToken: { id: 1, owner: deployerAddress },
    devPathTokens: {
      firstId: 1,
      lastId: Number(devPathCount),
      owner: deployerAddress,
    },
    seedGenerator: { address: await seedGenerator.getAddress() },
    colorFontV1: { address: await colorFontV1.getAddress() },
    thoughtPreviewer: { address: await thoughtPreviewer.getAddress() },
    thoughtSpecRegistry: { address: thoughtSpecRegistryAddress },
    thoughtSpecs: [
      {
        specName: thoughtSpecName,
        specId: thoughtSpecId,
        specHash: thoughtSpecHash,
        ref: thoughtSpecRef,
        pointer: specPointer,
        byteLength: thoughtSpecBytes.length,
      },
    ],
    recommendedThoughtSpecName: thoughtSpecName,
    recommendedThoughtSpecId: thoughtSpecId,
    recommendedThoughtSpecHash: thoughtSpecHash,
    thoughtSpec: {
      specName: thoughtSpecName,
      id: thoughtSpecId,
      hash: thoughtSpecHash,
      ref: thoughtSpecRef,
    },
    thoughtNft: { address: thoughtNftAddress },
  };

  await fs.writeFile(addressesFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(payload, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
