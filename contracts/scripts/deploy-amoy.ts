import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

/**
 * Deploys both `AnaguToken` (ERC-20) and `AnaguLandTitleNFT` (ERC-721)
 * to Polygon Amoy Testnet (Chain ID 80002) and writes the live deployed
 * addresses directly into:
 *   1. contracts/deployments/polygon-amoy.json
 *   2. src/config/polygonAmoyDeployment.json (consumed automatically by the React app)
 *
 * Required environment variable:
 *   POLYGON_AMOY_DEPLOYER_PRIVATE_KEY (funded with Polygon Amoy testnet POL)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer wallet configured. Set POLYGON_AMOY_DEPLOYER_PRIVATE_KEY in your .env file before running deploy:amoy."
    );
  }

  const net = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("==============================================================");
  console.log("ANAGU Land Administration — Polygon Amoy Testnet Deployment");
  console.log("==============================================================");
  console.log(`Network:   ${network.name} (Chain ID: ${net.chainId.toString()})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} POL`);

  if (balance === 0n && net.chainId === 80002n) {
    throw new Error(
      `Deployer wallet ${deployer.address} has 0 POL on Polygon Amoy Testnet. Request free testnet POL at https://faucet.polygon.technology/ first.`
    );
  }

  // Operational roles default to the deployer on testnet unless explicitly overridden via env vars.
  const adminAddress = process.env.ANAGU_ADMIN_ADDRESS || deployer.address;
  const registrarAddress = process.env.ANAGU_REGISTRAR_ADDRESS || deployer.address;
  const oracleAddress = process.env.ANAGU_ORACLE_ADDRESS || deployer.address;
  const governorAddress = process.env.ANAGU_GOVERNOR_ADDRESS || deployer.address;
  const treasuryAddress = process.env.ANAGU_TREASURY_ADDRESS || deployer.address;

  const initialSupply = ethers.parseUnits("10000000", 18); // 10,000,000 ANAGU initial treasury supply
  const registrationFee = ethers.parseUnits("50", 18); // 50 ANAGU statutory registration fee
  const enableTestnetFaucet = net.chainId !== 137n; // Enable faucet on Amoy / testnets, off on Polygon mainnet

  console.log("\n1. Deploying AnaguToken (ERC-20)...");
  const TokenFactory = await ethers.getContractFactory("AnaguToken");
  const tokenContract = await TokenFactory.deploy(
    adminAddress,
    registrarAddress,
    treasuryAddress,
    initialSupply,
    registrationFee,
    enableTestnetFaucet
  );
  const tokenDeployTx = tokenContract.deploymentTransaction();
  await tokenContract.waitForDeployment();
  const tokenAddress = await tokenContract.getAddress();
  console.log(`   AnaguToken deployed at: ${tokenAddress}`);
  console.log(`   Tx Hash:                ${tokenDeployTx?.hash || "N/A"}`);

  console.log("\n2. Deploying AnaguLandTitleNFT (ERC-721)...");
  const NftFactory = await ethers.getContractFactory("AnaguLandTitleNFT");
  const nftContract = await NftFactory.deploy(
    adminAddress,
    registrarAddress,
    oracleAddress,
    governorAddress
  );
  const nftDeployTx = nftContract.deploymentTransaction();
  await nftContract.waitForDeployment();
  const nftAddress = await nftContract.getAddress();
  console.log(`   AnaguLandTitleNFT at:   ${nftAddress}`);
  console.log(`   Tx Hash:                ${nftDeployTx?.hash || "N/A"}`);

  const manifest = {
    network: net.chainId === 80002n ? "Polygon Amoy Testnet" : network.name,
    chainId: Number(net.chainId),
    chainIdHex: "0x" + net.chainId.toString(16),
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    explorerUrl: "https://amoy.polygonscan.com",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    anaguTokenAddress: tokenAddress,
    anaguTokenDeployTxHash: tokenDeployTx?.hash || "",
    landTitleNftAddress: nftAddress,
    landTitleNftDeployTxHash: nftDeployTx?.hash || "",
    roles: {
      admin: adminAddress,
      registrar: registrarAddress,
      oracle: oracleAddress,
      governor: governorAddress,
      treasury: treasuryAddress,
    },
    registrationFeeAnagu: "50",
    testnetFaucetEnabled: enableTestnetFaucet,
  };

  const contractsOutDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(contractsOutDir, { recursive: true });
  const contractsManifestPath = path.join(contractsOutDir, "polygon-amoy.json");
  fs.writeFileSync(contractsManifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const frontendManifestPath = path.resolve(
    __dirname,
    "../../src/config/polygonAmoyDeployment.json"
  );
  fs.mkdirSync(path.dirname(frontendManifestPath), { recursive: true });
  fs.writeFileSync(frontendManifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("\nDeployment manifests written to:");
  console.log(`  - ${contractsManifestPath}`);
  console.log(`  - ${frontendManifestPath}`);
  console.log("\nAdd these to Vercel / .env if deploying remotely:");
  console.log(`  VITE_ANAGU_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`  VITE_ANAGU_LAND_TITLE_NFT_ADDRESS=${nftAddress}`);
  console.log("==============================================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
