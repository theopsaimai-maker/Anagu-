// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AnaguLandTitleNFT
 * @notice ERC-721 Land Title Registry for the ANAGU Land Administration Platform.
 *
 * Core invariants:
 *  - One registered land parcel = one unique non-fungible title token (1:1 permanent mapping).
 *  - Zero personally identifiable information (PII) stored on-chain; off-chain documents,
 *    coordinates, and statutory records are anchored via cryptographic hashes and non-sensitive references.
 *  - Community/Oracle attestation (ORACLE_ROLE) is mandatory prior to title minting,
 *    but attestation alone never grants ownership or authorizes minting.
 *  - Title issuance (mintTitle) and legal transfers (registryTransfer) are restricted to REGISTRAR_ROLE;
 *    ordinary peer-to-peer wallet transfers are blocked in _update().
 *  - Statutory revocation under Section 28 of the Land Use Act is restricted to GOVERNOR_ROLE;
 *    revoked titles are preserved on-chain (never burned), permanently non-transferable,
 *    and their parcel IDs can never be re-minted.
 */
contract AnaguLandTitleNFT is ERC721, AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Roles (Least Privilege)
    // -------------------------------------------------------------------------

    /// @notice Authorized Land Registrar: mints attested titles and executes approved registry transfers.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Authorized Community / Verification Oracle: records pre-mint parcel attestations.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Authorized State Governor / Statutory Authority: records Section 28 revocations.
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum TitleStatus {
        Active,
        Revoked
    }

    enum RevocationGround {
        OverridingPublicInterest,
        BreachOfStatutoryCondition
    }

    /// @notice Immutable title issuance record written once at mint time.
    struct TitleIssuanceRecord {
        bytes32 parcelIdHash;
        string cadastralRef;
        bytes32 spatialHash;
        bytes32 documentHash;
        bytes32 oracleAttestationHash;
        uint64 issuedAt;
        address issuedBy;
        address initialOwner;
    }

    /// @notice Mutable title lifecycle state separate from immutable issuance metadata.
    struct TitleState {
        TitleStatus status;
        uint32 transferCount;
        bytes32 lastInstrumentHash;
        uint64 lastTransferredAt;
    }

    /// @notice Pre-mint community/oracle attestation record anchored by parcel ID hash.
    struct OracleAttestationRecord {
        bytes32 attestationHash;
        uint64 attestedAt;
        address attestedBy;
        bool exists;
    }

    /// @notice Append-only audit entry for each registry-approved title transfer.
    struct TransferRecord {
        address from;
        address to;
        bytes32 instrumentHash;
        uint64 transferredAt;
        address executedBy;
    }

    /// @notice Permanent audit record for a Section 28 statutory revocation.
    struct RevocationRecord {
        bool revoked;
        RevocationGround ground;
        string gazetteNumber;
        bytes32 reasonHash;
        uint64 revokedAt;
        address revokedBy;
        address ownerAtRevocation;
    }

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidRecipient(address recipient);
    error InvalidParcelId();
    error InvalidCadastralRef();
    error InvalidSpatialHash();
    error InvalidDocumentHash();
    error InvalidAttestationHash();
    error InvalidInstrumentHash();
    error InvalidGazetteNumber();
    error InvalidReasonHash();
    error ParcelAlreadyRegistered(bytes32 parcelIdHash, uint256 existingTokenId);
    error RevokedParcelCannotBeReminted(bytes32 parcelIdHash, uint256 existingTokenId);
    error OracleAttestationRequired(bytes32 parcelIdHash);
    error TitleDoesNotExist(uint256 tokenId);
    error TitleAlreadyRevoked(uint256 tokenId);
    error PeerToPeerTransferBlocked(uint256 tokenId);
    error TransferToSameOwner(uint256 tokenId, address owner);
    error TitleBurningProhibited(uint256 tokenId);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event OracleAttested(
        bytes32 indexed parcelIdHash,
        bytes32 indexed attestationHash,
        address indexed attestedBy,
        uint64 attestedAt
    );

    event TitleMinted(
        uint256 indexed tokenId,
        bytes32 indexed parcelIdHash,
        address indexed recipient,
        string cadastralRef,
        bytes32 spatialHash,
        bytes32 documentHash,
        bytes32 oracleAttestationHash,
        uint64 issuedAt,
        address issuedBy
    );

    event RegistryTransferExecuted(
        uint256 indexed tokenId,
        bytes32 indexed parcelIdHash,
        address indexed from,
        address to,
        bytes32 instrumentHash,
        uint64 transferredAt,
        address executedBy
    );

    event TitleRevoked(
        uint256 indexed tokenId,
        bytes32 indexed parcelIdHash,
        RevocationGround indexed ground,
        string gazetteNumber,
        bytes32 reasonHash,
        address ownerAtRevocation,
        address revokedBy,
        uint64 revokedAt
    );

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    /// @dev Starts at 1 so tokenId == 0 unambiguously indicates an unregistered parcel.
    uint256 private _nextTokenId = 1;

    /// @dev Guard flag allowing transfers in _update() ONLY during registryTransfer().
    bool private _registryTransferInProgress;

    /// @dev Permanent 1:1 binding from canonical parcelIdHash to tokenId. Never deleted.
    mapping(bytes32 parcelIdHash => uint256 tokenId) private _parcelToTokenId;

    mapping(bytes32 parcelIdHash => OracleAttestationRecord) private _oracleAttestations;
    mapping(uint256 tokenId => TitleIssuanceRecord) private _issuanceRecords;
    mapping(uint256 tokenId => TitleState) private _titleStates;
    mapping(uint256 tokenId => TransferRecord[]) private _transferHistory;
    mapping(uint256 tokenId => RevocationRecord) private _revocationRecords;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialAdmin Required address receiving DEFAULT_ADMIN_ROLE (role administration only).
     * @param initialRegistrar Optional initial REGISTRAR_ROLE address (pass address(0) to assign later).
     * @param initialOracle Optional initial ORACLE_ROLE address (pass address(0) to assign later).
     * @param initialGovernor Optional initial GOVERNOR_ROLE address (pass address(0) to assign later).
     */
    constructor(
        address initialAdmin,
        address initialRegistrar,
        address initialOracle,
        address initialGovernor
    ) ERC721("ANAGU Land Title NFT", "ANAGU-TITLE") {
        if (initialAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);

        if (initialRegistrar != address(0)) {
            _grantRole(REGISTRAR_ROLE, initialRegistrar);
        }
        if (initialOracle != address(0)) {
            _grantRole(ORACLE_ROLE, initialOracle);
        }
        if (initialGovernor != address(0)) {
            _grantRole(GOVERNOR_ROLE, initialGovernor);
        }
    }

    // -------------------------------------------------------------------------
    // External State-Changing Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Records a Community / Verification Oracle attestation for a parcel prior to minting.
     * @dev Restricted to ORACLE_ROLE. Attestation alone never grants legal ownership or authorizes minting.
     * @param parcelId Canonical ANAGU parcel identifier (e.g. "PAR-2026-0001").
     * @param attestationHash Non-zero cryptographic hash of the off-chain oracle attestation record.
     */
    function recordOracleAttestation(
        string calldata parcelId,
        bytes32 attestationHash
    ) external onlyRole(ORACLE_ROLE) {
        bytes32 parcelIdHash = computeParcelIdHash(parcelId);
        if (attestationHash == bytes32(0)) revert InvalidAttestationHash();

        uint256 existingTokenId = _parcelToTokenId[parcelIdHash];
        if (existingTokenId != 0) {
            if (_titleStates[existingTokenId].status == TitleStatus.Revoked) {
                revert RevokedParcelCannotBeReminted(parcelIdHash, existingTokenId);
            }
            revert ParcelAlreadyRegistered(parcelIdHash, existingTokenId);
        }

        uint64 attestedAt = uint64(block.timestamp);
        _oracleAttestations[parcelIdHash] = OracleAttestationRecord({
            attestationHash: attestationHash,
            attestedAt: attestedAt,
            attestedBy: msg.sender,
            exists: true
        });

        emit OracleAttested(parcelIdHash, attestationHash, msg.sender, attestedAt);
    }

    /**
     * @notice Mints a unique ERC-721 Land Title NFT for an oracle-attested land parcel.
     * @dev Restricted to REGISTRAR_ROLE. Protected by nonReentrant due to _safeMint ERC721Receiver callback.
     *      Stores only hashes and non-sensitive cadastral references on-chain (no PII).
     * @param to Initial registered titleholder wallet address (must be non-zero).
     * @param parcelId Canonical ANAGU parcel identifier (hashed permanently to enforce 1 parcel = 1 NFT).
     * @param cadastralRef Non-sensitive official cadastral survey reference.
     * @param spatialHash Keccak-256 hash of verified PostGIS parcel geometry.
     * @param documentHash Cryptographic hash (e.g. SHA-256) of off-chain title deed package.
     * @return tokenId Newly minted unique token ID.
     */
    function mintTitle(
        address to,
        string calldata parcelId,
        string calldata cadastralRef,
        bytes32 spatialHash,
        bytes32 documentHash
    ) external onlyRole(REGISTRAR_ROLE) nonReentrant returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidRecipient(to);
        bytes32 parcelIdHash = computeParcelIdHash(parcelId);
        if (bytes(cadastralRef).length == 0) revert InvalidCadastralRef();
        if (spatialHash == bytes32(0)) revert InvalidSpatialHash();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();

        uint256 existingTokenId = _parcelToTokenId[parcelIdHash];
        if (existingTokenId != 0) {
            if (_titleStates[existingTokenId].status == TitleStatus.Revoked) {
                revert RevokedParcelCannotBeReminted(parcelIdHash, existingTokenId);
            }
            revert ParcelAlreadyRegistered(parcelIdHash, existingTokenId);
        }

        OracleAttestationRecord storage attestation = _oracleAttestations[parcelIdHash];
        if (!attestation.exists) {
            revert OracleAttestationRequired(parcelIdHash);
        }

        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
        }

        uint64 issuedAt = uint64(block.timestamp);

        // Effects before external _safeMint callback (Checks-Effects-Interactions)
        _parcelToTokenId[parcelIdHash] = tokenId;

        _issuanceRecords[tokenId] = TitleIssuanceRecord({
            parcelIdHash: parcelIdHash,
            cadastralRef: cadastralRef,
            spatialHash: spatialHash,
            documentHash: documentHash,
            oracleAttestationHash: attestation.attestationHash,
            issuedAt: issuedAt,
            issuedBy: msg.sender,
            initialOwner: to
        });

        _titleStates[tokenId] = TitleState({
            status: TitleStatus.Active,
            transferCount: 0,
            lastInstrumentHash: bytes32(0),
            lastTransferredAt: 0
        });

        emit TitleMinted(
            tokenId,
            parcelIdHash,
            to,
            cadastralRef,
            spatialHash,
            documentHash,
            attestation.attestationHash,
            issuedAt,
            msg.sender
        );

        _safeMint(to, tokenId);
    }

    /**
     * @notice Executes an authorized registry-controlled transfer of an active land title.
     * @dev Restricted to REGISTRAR_ROLE. Protected by nonReentrant. Resets _registryTransferInProgress
     *      BEFORE invoking ERC721Receiver callback so malicious recipients cannot piggyback P2P transfers.
     * @param tokenId Existing active title token ID.
     * @param to New registered titleholder address (non-zero, different from current owner).
     * @param instrumentHash Non-zero hash of the off-chain registered transfer/conveyance instrument.
     */
    function registryTransfer(
        uint256 tokenId,
        address to,
        bytes32 instrumentHash
    ) external onlyRole(REGISTRAR_ROLE) nonReentrant {
        address from = _ownerOf(tokenId);
        if (from == address(0)) revert TitleDoesNotExist(tokenId);
        if (_titleStates[tokenId].status == TitleStatus.Revoked) revert TitleAlreadyRevoked(tokenId);
        if (to == address(0)) revert InvalidRecipient(to);
        if (to == from) revert TransferToSameOwner(tokenId, to);
        if (instrumentHash == bytes32(0)) revert InvalidInstrumentHash();

        uint64 transferredAt = uint64(block.timestamp);
        TitleState storage state = _titleStates[tokenId];
        state.transferCount += 1;
        state.lastInstrumentHash = instrumentHash;
        state.lastTransferredAt = transferredAt;

        _transferHistory[tokenId].push(
            TransferRecord({
                from: from,
                to: to,
                instrumentHash: instrumentHash,
                transferredAt: transferredAt,
                executedBy: msg.sender
            })
        );

        _registryTransferInProgress = true;
        _transfer(from, to, tokenId);
        _registryTransferInProgress = false;

        emit RegistryTransferExecuted(
            tokenId,
            _issuanceRecords[tokenId].parcelIdHash,
            from,
            to,
            instrumentHash,
            transferredAt,
            msg.sender
        );

        // Safe ERC721Receiver callback runs AFTER flag reset and state updates.
        _checkOnERC721Received(_msgSender(), from, to, tokenId, "");
    }

    /**
     * @notice Records a statutory revocation (Land Use Act Section 28) on-chain.
     * @dev Restricted to GOVERNOR_ROLE. Never burns the token or erases historical ownership.
     *      On-chain revocation records the outcome of the statutory legal process and does not
     *      substitute for legally required statutory notice, gazetting, and due process.
     * @param tokenId Existing active title token ID.
     * @param ground Statutory revocation ground (OverridingPublicInterest or BreachOfStatutoryCondition).
     * @param gazetteNumber Official government gazette reference number.
     * @param reasonHash Cryptographic hash of the off-chain statutory revocation instrument/reason.
     */
    function revokeTitle(
        uint256 tokenId,
        RevocationGround ground,
        string calldata gazetteNumber,
        bytes32 reasonHash
    ) external onlyRole(GOVERNOR_ROLE) {
        address currentOwner = _ownerOf(tokenId);
        if (currentOwner == address(0)) revert TitleDoesNotExist(tokenId);
        if (_titleStates[tokenId].status == TitleStatus.Revoked) revert TitleAlreadyRevoked(tokenId);
        if (bytes(gazetteNumber).length == 0) revert InvalidGazetteNumber();
        if (reasonHash == bytes32(0)) revert InvalidReasonHash();

        uint64 revokedAt = uint64(block.timestamp);

        _titleStates[tokenId].status = TitleStatus.Revoked;
        _revocationRecords[tokenId] = RevocationRecord({
            revoked: true,
            ground: ground,
            gazetteNumber: gazetteNumber,
            reasonHash: reasonHash,
            revokedAt: revokedAt,
            revokedBy: msg.sender,
            ownerAtRevocation: currentOwner
        });

        emit TitleRevoked(
            tokenId,
            _issuanceRecords[tokenId].parcelIdHash,
            ground,
            gazetteNumber,
            reasonHash,
            currentOwner,
            msg.sender,
            revokedAt
        );
    }

    // -------------------------------------------------------------------------
    // View / Query Functions
    // -------------------------------------------------------------------------

    /// @notice Computes the canonical bytes32 parcel ID hash from an ANAGU parcel identifier string.
    function computeParcelIdHash(string calldata parcelId) public pure returns (bytes32) {
        if (bytes(parcelId).length == 0) revert InvalidParcelId();
        return keccak256(abi.encodePacked(parcelId));
    }

    /// @notice Returns the token ID bound to a parcel ID string (0 if unregistered).
    function getTokenIdByParcelId(string calldata parcelId) external view returns (uint256) {
        return _parcelToTokenId[computeParcelIdHash(parcelId)];
    }

    /// @notice Returns the token ID bound to a parcel ID hash (0 if unregistered).
    function getTokenIdByParcelHash(bytes32 parcelIdHash) external view returns (uint256) {
        return _parcelToTokenId[parcelIdHash];
    }

    /// @notice Returns true if a parcel ID has ever been registered (including if subsequently revoked).
    function isParcelRegistered(string calldata parcelId) external view returns (bool) {
        return _parcelToTokenId[computeParcelIdHash(parcelId)] != 0;
    }

    /// @notice Returns the recorded oracle attestation for a parcel ID.
    function getOracleAttestation(
        string calldata parcelId
    ) external view returns (OracleAttestationRecord memory) {
        return _oracleAttestations[computeParcelIdHash(parcelId)];
    }

    /// @notice Returns the immutable issuance record for an existing token ID.
    function getTitleIssuance(uint256 tokenId) external view returns (TitleIssuanceRecord memory) {
        if (_ownerOf(tokenId) == address(0)) revert TitleDoesNotExist(tokenId);
        return _issuanceRecords[tokenId];
    }

    /// @notice Returns the mutable lifecycle state for an existing token ID.
    function getTitleState(uint256 tokenId) external view returns (TitleState memory) {
        if (_ownerOf(tokenId) == address(0)) revert TitleDoesNotExist(tokenId);
        return _titleStates[tokenId];
    }

    /// @notice Returns the statutory revocation record for an existing token ID.
    function getRevocationRecord(uint256 tokenId) external view returns (RevocationRecord memory) {
        if (_ownerOf(tokenId) == address(0)) revert TitleDoesNotExist(tokenId);
        return _revocationRecords[tokenId];
    }

    /// @notice Returns the complete registry transfer history for an existing token ID.
    function getTransferHistory(uint256 tokenId) external view returns (TransferRecord[] memory) {
        if (_ownerOf(tokenId) == address(0)) revert TitleDoesNotExist(tokenId);
        return _transferHistory[tokenId];
    }

    /// @notice Returns true if an existing title has been statutorily revoked.
    function isTitleRevoked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert TitleDoesNotExist(tokenId);
        return _titleStates[tokenId].status == TitleStatus.Revoked;
    }

    /// @notice Returns the total number of titles ever minted (including revoked titles).
    function totalMintedTitles() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // -------------------------------------------------------------------------
    // Internal ERC-721 Transfer Guard (OpenZeppelin v5 _update hook)
    // -------------------------------------------------------------------------

    /**
     * @dev Enforces registry-controlled transfers across all ERC-721 transfer entry points
     *      (transferFrom, safeTransferFrom, approved operators).
     *      - Minting (from == address(0)) is permitted only through mintTitle().
     *      - Burning (to == address(0)) is prohibited to preserve statutory audit history.
     *      - Revoked titles can never be transferred.
     *      - Any transfer outside registryTransfer() reverts with PeerToPeerTransferBlocked.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from == address(0)) {
            if (to == address(0)) revert InvalidRecipient(to);
            return super._update(to, tokenId, auth);
        }

        if (to == address(0)) {
            revert TitleBurningProhibited(tokenId);
        }

        if (_titleStates[tokenId].status == TitleStatus.Revoked) {
            revert TitleAlreadyRevoked(tokenId);
        }

        if (!_registryTransferInProgress) {
            revert PeerToPeerTransferBlocked(tokenId);
        }

        return super._update(to, tokenId, auth);
    }

    function _checkOnERC721Received(
        address operator,
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(operator, from, tokenId, data) returns (
                bytes4 retval
            ) {
                if (retval != IERC721Receiver.onERC721Received.selector) {
                    revert ERC721InvalidReceiver(to);
                }
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert ERC721InvalidReceiver(to);
                } else {
                    assembly ("memory-safe") {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // ERC-165 Interface Support
    // -------------------------------------------------------------------------

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
