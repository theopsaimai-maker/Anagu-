import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { AnaguLandTitleNFT, AnaguToken } from "../typechain-types";

describe("AnaguToken (ERC-20) & Statutory Due-Process Integration", function () {
  const PARCEL_ID = "PAR-2026-8002";
  const CADASTRAL_REF = "FCT/AMAC/2026-8002";
  const SPATIAL_HASH = ethers.keccak256(ethers.toUtf8Bytes("postgis:polygon:PAR-2026-8002"));
  const DOCUMENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("sha256:survey:PAR-2026-8002"));
  const ATTESTATION_HASH = ethers.keccak256(ethers.toUtf8Bytes("oracle:quorum:PAR-2026-8002"));
  const INSTRUMENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("deed-of-assignment:PAR-2026-8002"));

  const INITIAL_SUPPLY = ethers.parseUnits("10000000", 18);
  const REGISTRATION_FEE = ethers.parseUnits("50", 18);
  const PURCHASE_AMOUNT = ethers.parseUnits("25000", 18);

  async function deployEcosystemFixture() {
    const [admin, registrar, oracle, governor, treasury, seller, buyer, stranger] =
      await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("AnaguToken");
    const token: AnaguToken = await TokenFactory.deploy(
      admin.address,
      registrar.address,
      treasury.address,
      INITIAL_SUPPLY,
      REGISTRATION_FEE,
      true
    );
    await token.waitForDeployment();

    const NftFactory = await ethers.getContractFactory("AnaguLandTitleNFT");
    const nft: AnaguLandTitleNFT = await NftFactory.deploy(
      admin.address,
      registrar.address,
      oracle.address,
      governor.address
    );
    await nft.waitForDeployment();

    return {
      token,
      nft,
      admin,
      registrar,
      oracle,
      governor,
      treasury,
      seller,
      buyer,
      stranger,
    };
  }

  it("deploys AnaguToken with expected metadata, treasury supply, and registration fee", async function () {
    const { token, treasury } = await deployEcosystemFixture();

    expect(await token.name()).to.equal("ANAGU Land Registry Token");
    expect(await token.symbol()).to.equal("ANAGU");
    expect(await token.decimals()).to.equal(18n);
    expect(await token.balanceOf(treasury.address)).to.equal(INITIAL_SUPPLY);
    expect(await token.registrationFee()).to.equal(REGISTRATION_FEE);
    expect(await token.testnetFaucetEnabled()).to.equal(true);
  });

  it("allows citizens on testnet to claim faucet tokens once per cooldown", async function () {
    const { token, seller } = await deployEcosystemFixture();

    await expect(token.connect(seller).claimTestnetFaucet())
      .to.emit(token, "TestnetFaucetClaimed")
      .withArgs(seller.address, ethers.parseUnits("1000", 18), anyValue);

    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseUnits("1000", 18));

    await expect(token.connect(seller).claimTestnetFaucet()).to.be.revertedWithCustomError(
      token,
      "FaucetCooldownActive"
    );
  });

  it("executes the full statutory 4-step land registration & purchase escrow due process", async function () {
    const { token, nft, registrar, oracle, treasury, seller, buyer } =
      await deployEcosystemFixture();

    // Fund seller & buyer with ANAGU tokens
    await token.connect(seller).claimTestnetFaucet();
    await token.connect(treasury).transfer(buyer.address, PURCHASE_AMOUNT);

    // STEP 1: Citizen pays statutory land registration filing fee in ANAGU
    const expectedParcelHash = await token.computeParcelIdHash(PARCEL_ID);
    await expect(token.connect(seller).payLandRegistrationFee(PARCEL_ID))
      .to.emit(token, "LandRegistrationFeePaid")
      .withArgs(expectedParcelHash, seller.address, treasury.address, REGISTRATION_FEE, anyValue);

    expect(await token.hasPaidRegistrationFee(PARCEL_ID)).to.equal(true);
    const receipt = await token.getRegistrationFeeReceipt(PARCEL_ID);
    expect(receipt.payer).to.equal(seller.address);
    expect(receipt.amount).to.equal(REGISTRATION_FEE);

    // Duplicate registration fee payment for same parcel reverts
    await expect(token.connect(seller).payLandRegistrationFee(PARCEL_ID))
      .to.be.revertedWithCustomError(token, "RegistrationFeeAlreadyPaid")
      .withArgs(expectedParcelHash);

    // STEP 2 & 3: Surveyor spatial pass + Community Oracle records attestation on AnaguLandTitleNFT
    await nft.connect(oracle).recordOracleAttestation(PARCEL_ID, ATTESTATION_HASH);

    // STEP 4A: Ministry Registrar mints statutory LandTitleNFT to the applicant (seller)
    await nft
      .connect(registrar)
      .mintTitle(seller.address, PARCEL_ID, CADASTRAL_REF, SPATIAL_HASH, DOCUMENT_HASH);
    const tokenId = await nft.getTokenIdByParcelId(PARCEL_ID);
    expect(tokenId).to.equal(1n);
    expect(await nft.ownerOf(tokenId)).to.equal(seller.address);

    // STEP 4B: Buyer opens ANAGU Purchase Escrow on Access Lands
    await expect(token.connect(buyer).openPurchaseEscrow(PARCEL_ID, seller.address, PURCHASE_AMOUNT))
      .to.emit(token, "PurchaseEscrowOpened")
      .withArgs(1n, expectedParcelHash, buyer.address, seller.address, PURCHASE_AMOUNT, anyValue);

    expect(await token.balanceOf(buyer.address)).to.equal(0n);
    expect(await token.balanceOf(await token.getAddress())).to.equal(PURCHASE_AMOUNT);

    // Direct P2P NFT transfer by seller is blocked by Land Use Act invariant
    await expect(
      nft.connect(seller).transferFrom(seller.address, buyer.address, tokenId)
    ).to.be.revertedWithCustomError(nft, "PeerToPeerTransferBlocked");

    // STEP 4C: Registrar executes statutory registryTransfer AND releases ANAGU escrow to seller
    await nft.connect(registrar).registryTransfer(tokenId, buyer.address, INSTRUMENT_HASH);
    expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);

    const sellerBalanceBefore = await token.balanceOf(seller.address);
    await expect(token.connect(registrar).releasePurchaseEscrow(1n, INSTRUMENT_HASH))
      .to.emit(token, "PurchaseEscrowReleased")
      .withArgs(
        1n,
        expectedParcelHash,
        seller.address,
        PURCHASE_AMOUNT,
        INSTRUMENT_HASH,
        registrar.address,
        anyValue
      );

    expect(await token.balanceOf(seller.address)).to.equal(sellerBalanceBefore + PURCHASE_AMOUNT);
    const settledEscrow = await token.getPurchaseEscrow(1n);
    expect(settledEscrow.status).to.equal(2n); // EscrowStatus.Released
  });

  it("allows buyer or registrar to refund an unsettled purchase escrow and blocks strangers", async function () {
    const { token, treasury, seller, buyer, stranger } = await deployEcosystemFixture();
    await token.connect(treasury).transfer(buyer.address, PURCHASE_AMOUNT);

    await token.connect(buyer).openPurchaseEscrow(PARCEL_ID, seller.address, PURCHASE_AMOUNT);

    await expect(
      token.connect(stranger).refundPurchaseEscrow(1n, "Unauthorized attempt")
    ).to.be.revertedWithCustomError(token, "UnauthorizedEscrowRefund");

    await expect(token.connect(buyer).refundPurchaseEscrow(1n, "Buyer withdrew before consent"))
      .to.emit(token, "PurchaseEscrowRefunded")
      .withArgs(
        1n,
        await token.computeParcelIdHash(PARCEL_ID),
        buyer.address,
        PURCHASE_AMOUNT,
        buyer.address,
        "Buyer withdrew before consent",
        anyValue
      );

    expect(await token.balanceOf(buyer.address)).to.equal(PURCHASE_AMOUNT);
  });
});
