import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { AnaguLandTitleNFT } from "../typechain-types";

describe("AnaguLandTitleNFT (ERC-721 Land Title Registry)", function () {
  const PARCEL_1 = "PAR-2026-0001";
  const PARCEL_2 = "PAR-2026-0002";
  const CADASTRAL_1 = "FCT/ABJ/MAI/2026/00142";
  const CADASTRAL_2 = "FCT/ABJ/WUS/2026/00988";
  const SPATIAL_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("postgis:polygon:PAR-2026-0001"));
  const DOCUMENT_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("sha256:deed:PAR-2026-0001"));
  const ATTESTATION_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("oracle:attestation:PAR-2026-0001"));
  const INSTRUMENT_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("deed-of-assignment:2026-01"));
  const INSTRUMENT_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("deed-of-assignment:2026-02"));
  const REASON_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("section28:public-road-corridor"));
  const GAZETTE_NO_1 = "FGN Official Gazette Vol. 113 No. 42 (2026)";

  async function deployFixture() {
    const [admin, registrar, oracle, governor, ownerA, ownerB, ownerC, stranger] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AnaguLandTitleNFT");
    const contract: AnaguLandTitleNFT = await Factory.deploy(
      admin.address,
      registrar.address,
      oracle.address,
      governor.address
    );
    await contract.waitForDeployment();

    const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();
    const REGISTRAR_ROLE = await contract.REGISTRAR_ROLE();
    const ORACLE_ROLE = await contract.ORACLE_ROLE();
    const GOVERNOR_ROLE = await contract.GOVERNOR_ROLE();

    return {
      contract,
      admin,
      registrar,
      oracle,
      governor,
      ownerA,
      ownerB,
      ownerC,
      stranger,
      DEFAULT_ADMIN_ROLE,
      REGISTRAR_ROLE,
      ORACLE_ROLE,
      GOVERNOR_ROLE,
    };
  }

  async function deployAndMintParcel1Fixture() {
    const fixture = await deployFixture();
    const { contract, registrar, oracle, ownerA } = fixture;

    await contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1);
    await contract
      .connect(registrar)
      .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1);

    return fixture;
  }

  describe("1 & 2. Deployment, Role Assignment, and Least-Privilege Access Control", function () {
    it("deploys with expected ERC-721 metadata, interfaces, and segregated roles", async function () {
      const {
        contract,
        admin,
        registrar,
        oracle,
        governor,
        stranger,
        DEFAULT_ADMIN_ROLE,
        REGISTRAR_ROLE,
        ORACLE_ROLE,
        GOVERNOR_ROLE,
      } = await deployFixture();

      expect(await contract.name()).to.equal("ANAGU Land Title NFT");
      expect(await contract.symbol()).to.equal("ANAGU-TITLE");
      expect(await contract.totalMintedTitles()).to.equal(0n);

      // ERC-721 (0x80ac58cd) and AccessControl (0x7965db0b) interface IDs
      expect(await contract.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await contract.supportsInterface("0x7965db0b")).to.equal(true);

      // Least-privilege separation: admin holds ONLY DEFAULT_ADMIN_ROLE
      expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await contract.hasRole(REGISTRAR_ROLE, admin.address)).to.equal(false);
      expect(await contract.hasRole(ORACLE_ROLE, admin.address)).to.equal(false);
      expect(await contract.hasRole(GOVERNOR_ROLE, admin.address)).to.equal(false);

      expect(await contract.hasRole(REGISTRAR_ROLE, registrar.address)).to.equal(true);
      expect(await contract.hasRole(ORACLE_ROLE, oracle.address)).to.equal(true);
      expect(await contract.hasRole(GOVERNOR_ROLE, governor.address)).to.equal(true);
      expect(await contract.hasRole(REGISTRAR_ROLE, stranger.address)).to.equal(false);
    });

    it("rejects zero-address initialAdmin and allows deferred operational role assignment", async function () {
      const [admin, newRegistrar] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("AnaguLandTitleNFT");

      await expect(
        Factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Factory, "ZeroAddress");

      const deferred = await Factory.deploy(
        admin.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      await deferred.waitForDeployment();

      const REGISTRAR_ROLE = await deferred.REGISTRAR_ROLE();
      expect(await deferred.hasRole(REGISTRAR_ROLE, newRegistrar.address)).to.equal(false);
      await deferred.connect(admin).grantRole(REGISTRAR_ROLE, newRegistrar.address);
      expect(await deferred.hasRole(REGISTRAR_ROLE, newRegistrar.address)).to.equal(true);
    });
  });

  describe("3, 4 & 8. Oracle Attestation and Pre-Mint Gate", function () {
    it("allows ORACLE_ROLE to record attestation, emits OracleAttested, and does not grant ownership", async function () {
      const { contract, oracle } = await deployFixture();
      const expectedHash = await contract.computeParcelIdHash(PARCEL_1);

      await expect(contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1))
        .to.emit(contract, "OracleAttested")
        .withArgs(expectedHash, ATTESTATION_HASH_1, oracle.address, anyValue);

      const att = await contract.getOracleAttestation(PARCEL_1);
      expect(att.exists).to.equal(true);
      expect(att.attestationHash).to.equal(ATTESTATION_HASH_1);
      expect(att.attestedBy).to.equal(oracle.address);
      expect(att.attestedAt).to.be.greaterThan(0n);

      // Attestation alone never mints or registers a token
      expect(await contract.totalMintedTitles()).to.equal(0n);
      expect(await contract.isParcelRegistered(PARCEL_1)).to.equal(false);
      expect(await contract.getTokenIdByParcelId(PARCEL_1)).to.equal(0n);
    });

    it("rejects unauthorized oracle attestation calls (admin, registrar, governor, stranger)", async function () {
      const { contract, admin, registrar, governor, stranger, ORACLE_ROLE } = await deployFixture();

      for (const caller of [admin, registrar, governor, stranger]) {
        await expect(
          contract.connect(caller).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1)
        )
          .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
          .withArgs(caller.address, ORACLE_ROLE);
      }
    });

    it("rejects empty parcelId or zero attestationHash", async function () {
      const { contract, oracle } = await deployFixture();

      await expect(
        contract.connect(oracle).recordOracleAttestation("", ATTESTATION_HASH_1)
      ).to.be.revertedWithCustomError(contract, "InvalidParcelId");

      await expect(
        contract.connect(oracle).recordOracleAttestation(PARCEL_1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(contract, "InvalidAttestationHash");
    });

    it("rejects mintTitle when parcel has no recorded oracle attestation", async function () {
      const { contract, registrar, ownerA } = await deployFixture();
      const parcelHash = await contract.computeParcelIdHash(PARCEL_1);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "OracleAttestationRequired")
        .withArgs(parcelHash);
    });
  });

  describe("5, 6, 7, 14 & 15. Title Minting, Uniqueness, Validation, and Metadata", function () {
    it("mints unique ERC-721 title after attestation, emits TitleMinted, and stores immutable metadata", async function () {
      const { contract, registrar, oracle, ownerA } = await deployFixture();
      const parcelHash = await contract.computeParcelIdHash(PARCEL_1);

      await contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.emit(contract, "TitleMinted")
        .withArgs(
          1n,
          parcelHash,
          ownerA.address,
          CADASTRAL_1,
          SPATIAL_HASH_1,
          DOCUMENT_HASH_1,
          ATTESTATION_HASH_1,
          anyValue,
          registrar.address
        );

      expect(await contract.ownerOf(1n)).to.equal(ownerA.address);
      expect(await contract.balanceOf(ownerA.address)).to.equal(1n);
      expect(await contract.totalMintedTitles()).to.equal(1n);
      expect(await contract.isParcelRegistered(PARCEL_1)).to.equal(true);
      expect(await contract.getTokenIdByParcelId(PARCEL_1)).to.equal(1n);
      expect(await contract.getTokenIdByParcelHash(parcelHash)).to.equal(1n);

      const issuance = await contract.getTitleIssuance(1n);
      expect(issuance.parcelIdHash).to.equal(parcelHash);
      expect(issuance.cadastralRef).to.equal(CADASTRAL_1);
      expect(issuance.spatialHash).to.equal(SPATIAL_HASH_1);
      expect(issuance.documentHash).to.equal(DOCUMENT_HASH_1);
      expect(issuance.oracleAttestationHash).to.equal(ATTESTATION_HASH_1);
      expect(issuance.issuedBy).to.equal(registrar.address);
      expect(issuance.initialOwner).to.equal(ownerA.address);
      expect(issuance.issuedAt).to.be.greaterThan(0n);

      const state = await contract.getTitleState(1n);
      expect(state.status).to.equal(0n); // TitleStatus.Active
      expect(state.transferCount).to.equal(0n);
      expect(state.lastInstrumentHash).to.equal(ethers.ZeroHash);
      expect(await contract.isTitleRevoked(1n)).to.equal(false);
    });

    it("rejects duplicate parcel registration and blocks overwriting oracle attestation after mint", async function () {
      const { contract, registrar, oracle, ownerB } = await deployAndMintParcel1Fixture();
      const parcelHash = await contract.computeParcelIdHash(PARCEL_1);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerB.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "ParcelAlreadyRegistered")
        .withArgs(parcelHash, 1n);

      await expect(
        contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "ParcelAlreadyRegistered")
        .withArgs(parcelHash, 1n);
    });

    it("rejects unauthorized mint attempts (admin, oracle, governor, stranger)", async function () {
      const { contract, admin, oracle, governor, stranger, ownerA, REGISTRAR_ROLE } =
        await deployFixture();
      await contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1);

      for (const caller of [admin, oracle, governor, stranger]) {
        await expect(
          contract
            .connect(caller)
            .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
        )
          .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
          .withArgs(caller.address, REGISTRAR_ROLE);
      }
    });

    it("rejects zero-address recipient, non-ERC721Receiver contracts, and invalid metadata inputs", async function () {
      const { contract, registrar, oracle, ownerA } = await deployFixture();
      await contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ethers.ZeroAddress, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "InvalidRecipient")
        .withArgs(ethers.ZeroAddress);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, "", CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      ).to.be.revertedWithCustomError(contract, "InvalidParcelId");

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, PARCEL_1, "", SPATIAL_HASH_1, DOCUMENT_HASH_1)
      ).to.be.revertedWithCustomError(contract, "InvalidCadastralRef");

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, ethers.ZeroHash, DOCUMENT_HASH_1)
      ).to.be.revertedWithCustomError(contract, "InvalidSpatialHash");

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerA.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(contract, "InvalidDocumentHash");

      // Non-ERC721Receiver contract recipient must be rejected by _safeMint
      const NonReceiverFactory = await ethers.getContractFactory("NonReceiverContractMock");
      const nonReceiver = await NonReceiverFactory.deploy();
      const nonReceiverAddress = await nonReceiver.getAddress();

      await expect(
        contract
          .connect(registrar)
          .mintTitle(nonReceiverAddress, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "ERC721InvalidReceiver")
        .withArgs(nonReceiverAddress);
    });
  });

  describe("10, 11 & 16. Registry-Controlled Transfers, P2P Blocking, and Ownership History", function () {
    it("blocks ordinary wallet-to-wallet transferFrom and safeTransferFrom (direct and approved)", async function () {
      const { contract, ownerA, ownerB, stranger } = await deployAndMintParcel1Fixture();

      // Direct owner transferFrom
      await expect(
        contract.connect(ownerA).transferFrom(ownerA.address, ownerB.address, 1n)
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);

      // Direct owner safeTransferFrom (3-arg and 4-arg overloads)
      await expect(
        contract
          .connect(ownerA)
          ["safeTransferFrom(address,address,uint256)"](ownerA.address, ownerB.address, 1n)
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);

      await expect(
        contract
          .connect(ownerA)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            ownerA.address,
            ownerB.address,
            1n,
            "0x1234"
          )
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);

      // Approved spender / operator still cannot bypass _update guard
      await contract.connect(ownerA).approve(stranger.address, 1n);
      await expect(
        contract.connect(stranger).transferFrom(ownerA.address, ownerB.address, 1n)
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);

      await contract.connect(ownerA).setApprovalForAll(stranger.address, true);
      await expect(
        contract
          .connect(stranger)
          ["safeTransferFrom(address,address,uint256)"](ownerA.address, ownerB.address, 1n)
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);

      expect(await contract.ownerOf(1n)).to.equal(ownerA.address);
    });

    it("executes approved registryTransfer, preserves immutable issuance data, and tracks transfer history", async function () {
      const { contract, registrar, ownerA, ownerB, ownerC } = await deployAndMintParcel1Fixture();
      const parcelHash = await contract.computeParcelIdHash(PARCEL_1);

      await expect(
        contract.connect(registrar).registryTransfer(1n, ownerB.address, INSTRUMENT_HASH_1)
      )
        .to.emit(contract, "RegistryTransferExecuted")
        .withArgs(
          1n,
          parcelHash,
          ownerA.address,
          ownerB.address,
          INSTRUMENT_HASH_1,
          anyValue,
          registrar.address
        );

      expect(await contract.ownerOf(1n)).to.equal(ownerB.address);
      expect(await contract.getTokenIdByParcelId(PARCEL_1)).to.equal(1n);

      // Second transfer to ownerC
      await contract.connect(registrar).registryTransfer(1n, ownerC.address, INSTRUMENT_HASH_2);
      expect(await contract.ownerOf(1n)).to.equal(ownerC.address);

      // Immutable issuance record remains unchanged
      const issuance = await contract.getTitleIssuance(1n);
      expect(issuance.initialOwner).to.equal(ownerA.address);
      expect(issuance.parcelIdHash).to.equal(parcelHash);
      expect(issuance.cadastralRef).to.equal(CADASTRAL_1);
      expect(issuance.spatialHash).to.equal(SPATIAL_HASH_1);

      // Mutable state & history reflect both transfers
      const state = await contract.getTitleState(1n);
      expect(state.transferCount).to.equal(2n);
      expect(state.lastInstrumentHash).to.equal(INSTRUMENT_HASH_2);
      expect(state.lastTransferredAt).to.be.greaterThan(0n);

      const history = await contract.getTransferHistory(1n);
      expect(history.length).to.equal(2);
      expect(history[0].from).to.equal(ownerA.address);
      expect(history[0].to).to.equal(ownerB.address);
      expect(history[0].instrumentHash).to.equal(INSTRUMENT_HASH_1);
      expect(history[1].from).to.equal(ownerB.address);
      expect(history[1].to).to.equal(ownerC.address);
      expect(history[1].instrumentHash).to.equal(INSTRUMENT_HASH_2);
    });

    it("rejects unauthorized or invalid registryTransfer calls and blocks callback transfer bypasses", async function () {
      const { contract, admin, registrar, oracle, governor, ownerA, ownerB, stranger, REGISTRAR_ROLE } =
        await deployAndMintParcel1Fixture();

      for (const caller of [admin, oracle, governor, ownerA, stranger]) {
        await expect(
          contract.connect(caller).registryTransfer(1n, ownerB.address, INSTRUMENT_HASH_1)
        )
          .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
          .withArgs(caller.address, REGISTRAR_ROLE);
      }

      await expect(
        contract.connect(registrar).registryTransfer(999n, ownerB.address, INSTRUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "TitleDoesNotExist")
        .withArgs(999n);

      await expect(
        contract.connect(registrar).registryTransfer(1n, ethers.ZeroAddress, INSTRUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "InvalidRecipient")
        .withArgs(ethers.ZeroAddress);

      await expect(
        contract.connect(registrar).registryTransfer(1n, ownerA.address, INSTRUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "TransferToSameOwner")
        .withArgs(1n, ownerA.address);

      await expect(
        contract.connect(registrar).registryTransfer(1n, ownerB.address, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(contract, "InvalidInstrumentHash");

      // Malicious ERC721Receiver attempting to piggyback transferFrom during onERC721Received callback
      const MaliciousFactory = await ethers.getContractFactory("ReentrantReceiverMock");
      const malicious = await MaliciousFactory.deploy(
        await contract.getAddress(),
        stranger.address
      );
      await malicious.configureAttack(true, false);

      await expect(
        contract
          .connect(registrar)
          .registryTransfer(1n, await malicious.getAddress(), INSTRUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "PeerToPeerTransferBlocked")
        .withArgs(1n);
    });
  });

  describe("9, 12 & 13. Statutory Revocation (Section 28), Transfer Lock, and Anti-Remint", function () {
    it("allows only GOVERNOR_ROLE to revoke with both statutory grounds while preserving history", async function () {
      const { contract, admin, registrar, oracle, governor, ownerA, ownerB, stranger, GOVERNOR_ROLE } =
        await deployAndMintParcel1Fixture();
      const parcelHash1 = await contract.computeParcelIdHash(PARCEL_1);

      // Transfer once before revocation to verify historical preservation
      await contract.connect(registrar).registryTransfer(1n, ownerB.address, INSTRUMENT_HASH_1);

      // Unauthorized revocation attempts revert
      for (const caller of [admin, registrar, oracle, ownerB, stranger]) {
        await expect(
          contract.connect(caller).revokeTitle(1n, 0, GAZETTE_NO_1, REASON_HASH_1)
        )
          .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
          .withArgs(caller.address, GOVERNOR_ROLE);
      }

      // Invalid gazette / reasonHash rejected
      await expect(
        contract.connect(governor).revokeTitle(1n, 0, "", REASON_HASH_1)
      ).to.be.revertedWithCustomError(contract, "InvalidGazetteNumber");

      await expect(
        contract.connect(governor).revokeTitle(1n, 0, GAZETTE_NO_1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(contract, "InvalidReasonHash");

      // Ground 0: OverridingPublicInterest
      await expect(
        contract.connect(governor).revokeTitle(1n, 0, GAZETTE_NO_1, REASON_HASH_1)
      )
        .to.emit(contract, "TitleRevoked")
        .withArgs(
          1n,
          parcelHash1,
          0n,
          GAZETTE_NO_1,
          REASON_HASH_1,
          ownerB.address,
          governor.address,
          anyValue
        );

      // Token is NOT burned and preserves historical owner, issuance, and transfer history
      expect(await contract.ownerOf(1n)).to.equal(ownerB.address);
      expect(await contract.isTitleRevoked(1n)).to.equal(true);
      expect((await contract.getTitleState(1n)).status).to.equal(1n); // TitleStatus.Revoked

      const revRecord = await contract.getRevocationRecord(1n);
      expect(revRecord.revoked).to.equal(true);
      expect(revRecord.ground).to.equal(0n);
      expect(revRecord.gazetteNumber).to.equal(GAZETTE_NO_1);
      expect(revRecord.reasonHash).to.equal(REASON_HASH_1);
      expect(revRecord.revokedBy).to.equal(governor.address);
      expect(revRecord.ownerAtRevocation).to.equal(ownerB.address);

      expect((await contract.getTransferHistory(1n)).length).to.equal(1);
      expect((await contract.getTitleIssuance(1n)).initialOwner).to.equal(ownerA.address);

      // Double revocation is rejected
      await expect(
        contract.connect(governor).revokeTitle(1n, 1, GAZETTE_NO_1, REASON_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "TitleAlreadyRevoked")
        .withArgs(1n);

      // Ground 1: BreachOfStatutoryCondition on second parcel
      await contract.connect(oracle).recordOracleAttestation(PARCEL_2, ATTESTATION_HASH_1);
      await contract
        .connect(registrar)
        .mintTitle(ownerA.address, PARCEL_2, CADASTRAL_2, SPATIAL_HASH_1, DOCUMENT_HASH_1);
      await contract.connect(governor).revokeTitle(2n, 1, "FGN Gazette No. 43", REASON_HASH_1);
      expect((await contract.getRevocationRecord(2n)).ground).to.equal(1n);
    });

    it("permanently blocks transfers of revoked titles and prevents re-minting revoked parcels", async function () {
      const { contract, registrar, oracle, governor, ownerA, ownerB } =
        await deployAndMintParcel1Fixture();
      const parcelHash = await contract.computeParcelIdHash(PARCEL_1);

      await contract.connect(governor).revokeTitle(1n, 0, GAZETTE_NO_1, REASON_HASH_1);

      // Even REGISTRAR_ROLE cannot transfer a revoked title
      await expect(
        contract.connect(registrar).registryTransfer(1n, ownerB.address, INSTRUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "TitleAlreadyRevoked")
        .withArgs(1n);

      // P2P transfer also reverts with TitleAlreadyRevoked
      await expect(
        contract.connect(ownerA).transferFrom(ownerA.address, ownerB.address, 1n)
      )
        .to.be.revertedWithCustomError(contract, "TitleAlreadyRevoked")
        .withArgs(1n);

      // Re-attesting or re-minting the revoked parcel is permanently blocked
      await expect(
        contract.connect(oracle).recordOracleAttestation(PARCEL_1, ATTESTATION_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "RevokedParcelCannotBeReminted")
        .withArgs(parcelHash, 1n);

      await expect(
        contract
          .connect(registrar)
          .mintTitle(ownerB.address, PARCEL_1, CADASTRAL_1, SPATIAL_HASH_1, DOCUMENT_HASH_1)
      )
        .to.be.revertedWithCustomError(contract, "RevokedParcelCannotBeReminted")
        .withArgs(parcelHash, 1n);

      // Permanent parcel-to-token binding remains intact
      expect(await contract.getTokenIdByParcelId(PARCEL_1)).to.equal(1n);
      expect(await contract.isParcelRegistered(PARCEL_1)).to.equal(true);
    });
  });
});
