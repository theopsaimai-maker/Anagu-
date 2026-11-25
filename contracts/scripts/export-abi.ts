import fs from "node:fs";
import path from "node:path";

interface ContractExportConfig {
  contractName: string;
  sourceFile: string;
  constructorParameters: Array<{ name: string; type: string; required: boolean }>;
}

const CONTRACTS: ContractExportConfig[] = [
  {
    contractName: "AnaguToken",
    sourceFile: "AnaguToken.sol",
    constructorParameters: [
      { name: "initialAdmin", type: "address", required: true },
      { name: "initialRegistrar", type: "address", required: false },
      { name: "initialTreasury", type: "address", required: true },
      { name: "initialSupply", type: "uint256", required: true },
      { name: "initialRegFee", type: "uint256", required: true },
      { name: "enableFaucet", type: "bool", required: true },
    ],
  },
  {
    contractName: "AnaguLandTitleNFT",
    sourceFile: "AnaguLandTitleNFT.sol",
    constructorParameters: [
      { name: "initialAdmin", type: "address", required: true },
      { name: "initialRegistrar", type: "address", required: false },
      { name: "initialOracle", type: "address", required: false },
      { name: "initialGovernor", type: "address", required: false },
    ],
  },
];

const outputDir = path.resolve(__dirname, "../abi");
fs.mkdirSync(outputDir, { recursive: true });

for (const item of CONTRACTS) {
  const artifactPath = path.resolve(
    __dirname,
    `../artifacts/contracts/${item.sourceFile}/${item.contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Compiled artifact not found at ${artifactPath}. Run 'npm run compile' first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const outputPath = path.join(outputDir, `${item.contractName}.abi.json`);
  const metadataPath = path.join(outputDir, `${item.contractName}.build-info.json`);

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
        targetNetworks: [
          { name: "Polygon Amoy Testnet", chainId: 80002 },
          { name: "ANAGU Private Hyperledger Besu QBFT", chainId: 13371 },
        ],
        constructorParameters: item.constructorParameters,
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
}
