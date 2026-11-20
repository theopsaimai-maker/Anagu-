import fs from "node:fs";
import path from "node:path";

const artifactPath = path.resolve(
  __dirname,
  "../artifacts/contracts/AnaguLandTitleNFT.sol/AnaguLandTitleNFT.json"
);
const outputDir = path.resolve(__dirname, "../abi");
const outputPath = path.join(outputDir, "AnaguLandTitleNFT.abi.json");
const metadataPath = path.join(outputDir, "AnaguLandTitleNFT.build-info.json");

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Compiled artifact not found at ${artifactPath}. Run 'npm run compile' first.`);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(outputPath, JSON.stringify(artifact.abi, null, 2) + "\n", "utf8");
fs.writeFileSync(
  metadataPath,
  JSON.stringify(
    {
      contractName: artifact.contractName,
      sourceName: artifact.sourceName,
      compiler: {
        solcVersion: "0.8.24",
        evmVersion: process.env.BESU_EVM_VERSION || "paris",
        optimizer: { enabled: true, runs: 200 },
      },
      targetNetwork: {
        name: "ANAGU Private Hyperledger Besu QBFT",
        chainId: 13371,
      },
      constructorParameters: [
        { name: "initialAdmin", type: "address", required: true },
        { name: "initialRegistrar", type: "address", required: false },
        { name: "initialOracle", type: "address", required: false },
        { name: "initialGovernor", type: "address", required: false },
      ],
      bytecodeByteLength:
        typeof artifact.bytecode === "string" ? (artifact.bytecode.length - 2) / 2 : 0,
      deployedBytecodeByteLength:
        typeof artifact.deployedBytecode === "string"
          ? (artifact.deployedBytecode.length - 2) / 2
          : 0,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`Exported ABI to ${outputPath}`);
console.log(`Exported build metadata to ${metadataPath}`);
