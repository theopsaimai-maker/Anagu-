// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AnaguToken
 * @notice ERC-20 utility, statutory filing fee, and Registrar-controlled escrow
 *         settlement token for the ANAGU Land Administration ecosystem on
 *         Polygon Amoy Testnet (Chain ID 80002), Polygon PoS, and Besu QBFT.
 *
 * @dev Statutory Due Process Integration:
 *      1. Land Registration Filing Fee: Citizens call `payLandRegistrationFee(parcelId)`
 *         to settle the statutory filing fee to the Ministry Treasury before GIS
 *         cadastral verification, Community Oracle attestation, and Registrar minting
 *         of `AnaguLandTitleNFT`.
 *      2. Land Purchase Escrow: Because `AnaguLandTitleNFT` blocks unauthorized P2P
 *         ERC-721 transfers under the Nigerian Land Use Act (1978), buyers lock ANAGU
 *         tokens via `openPurchaseEscrow(parcelId, seller, amount)`. Once the Ministry
 *         Registrar executes `AnaguLandTitleNFT.registryTransfer`, the Registrar
 *         releases funds to the seller via `releasePurchaseEscrow` (or refunds the
 *         buyer via `refundPurchaseEscrow` if consent is denied).
 *      3. Zero PII on-chain: Parcel identifiers are hashed with `keccak256` and no
 *         names, NINs, phone numbers, or emails are ever stored on-chain.
 */
contract AnaguToken is ERC20, ERC20Burnable, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Hard cap: 1,000,000,000 ANAGU (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Default testnet faucet claim amount: 1,000 ANAGU.
    uint256 public constant FAUCET_DRIP_AMOUNT = 1_000 * 10 ** 18;

    /// @notice Cooldown between faucet claims per wallet on testnets.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    enum EscrowStatus {
        None,
        Funded,
        Released,
        Refunded
    }

    struct RegistrationFeeReceipt {
        address payer;
        uint256 amount;
        uint64 paidAt;
        bool paid;
    }

    struct PurchaseEscrow {
        uint256 escrowId;
        bytes32 parcelIdHash;
        address buyer;
        address seller;
        uint256 amount;
        EscrowStatus status;
        uint64 createdAt;
        uint64 settledAt;
        bytes32 instrumentHash;
    }

    /// @notice Ministry Land Registry Treasury receiving statutory filing fees.
    address public treasury;

    /// @notice Statutory fee required to file a land registration application (in wei, 18 decimals).
    uint256 public registrationFee;

    /// @notice Optional testnet faucet flag (enabled on Polygon Amoy Testnet, disabled on mainnet).
    bool public testnetFaucetEnabled;

    /// @notice Monotonic escrow identifier counter (1-based).
    uint256 private _nextEscrowId;

    /// @notice Parcel hash -> statutory registration fee payment receipt.
    mapping(bytes32 => RegistrationFeeReceipt) private _registrationReceipts;

    /// @notice Escrow ID -> land purchase escrow record.
    mapping(uint256 => PurchaseEscrow) private _escrows;

    /// @notice Parcel hash -> list of escrow IDs opened for that parcel.
    mapping(bytes32 => uint256[]) private _parcelEscrowIds;

    /// @notice Wallet -> last testnet faucet claim timestamp.
    mapping(address => uint64) public lastFaucetClaimAt;

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidAmount();
    error InvalidParcelId();
    error InvalidInstrumentHash();
    error CapExceeded(uint256 requestedSupply, uint256 maxSupply);
    error RegistrationFeeAlreadyPaid(bytes32 parcelIdHash);
    error BuyerCannotBeSeller(address account);
    error EscrowNotFound(uint256 escrowId);
    error EscrowNotFunded(uint256 escrowId, EscrowStatus currentStatus);
    error UnauthorizedEscrowRefund(address caller, uint256 escrowId);
    error TestnetFaucetDisabled();
    error FaucetCooldownActive(uint256 retryAfterTimestamp);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event RegistrationFeeUpdated(uint256 previousFee, uint256 newFee);
    event TestnetFaucetToggled(bool enabled);
    event TestnetFaucetClaimed(address indexed recipient, uint256 amount, uint64 timestamp);

    event LandRegistrationFeePaid(
        bytes32 indexed parcelIdHash,
        address indexed payer,
        address indexed treasury,
        uint256 amount,
        uint64 paidAt
    );

    event PurchaseEscrowOpened(
        uint256 indexed escrowId,
        bytes32 indexed parcelIdHash,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint64 createdAt
    );

    event PurchaseEscrowReleased(
        uint256 indexed escrowId,
        bytes32 indexed parcelIdHash,
        address indexed seller,
        uint256 amount,
        bytes32 instrumentHash,
        address releasedBy,
        uint64 settledAt
    );

    event PurchaseEscrowRefunded(
        uint256 indexed escrowId,
        bytes32 indexed parcelIdHash,
        address indexed buyer,
        uint256 amount,
        address refundedBy,
        string reason,
        uint64 settledAt
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialAdmin        Receives DEFAULT_ADMIN_ROLE. Must not be address(0).
     * @param initialRegistrar    Optional REGISTRAR_ROLE holder for escrow release/refund.
     * @param initialTreasury     Ministry Treasury address receiving registration fees.
     * @param initialSupply       Initial supply minted to `initialTreasury` (<= MAX_SUPPLY).
     * @param initialRegFee       Initial statutory registration fee in ANAGU wei (e.g. 50e18).
     * @param enableFaucet        Enable public testnet faucet (true on Polygon Amoy Testnet).
     */
    constructor(
        address initialAdmin,
        address initialRegistrar,
        address initialTreasury,
        uint256 initialSupply,
        uint256 initialRegFee,
        bool enableFaucet
    ) ERC20("ANAGU Land Registry Token", "ANAGU") {
        if (initialAdmin == address(0) || initialTreasury == address(0)) {
            revert ZeroAddress();
        }
        if (initialSupply > MAX_SUPPLY) {
            revert CapExceeded(initialSupply, MAX_SUPPLY);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(MINTER_ROLE, initialAdmin);
        if (initialRegistrar != address(0)) {
            _grantRole(REGISTRAR_ROLE, initialRegistrar);
        }

        treasury = initialTreasury;
        registrationFee = initialRegFee;
        testnetFaucetEnabled = enableFaucet;

        if (initialSupply > 0) {
            _mint(initialTreasury, initialSupply);
        }
    }

    // -------------------------------------------------------------------------
    // Token Minting & Governance Controls
    // -------------------------------------------------------------------------

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 nextSupply = totalSupply() + amount;
        if (nextSupply > MAX_SUPPLY) {
            revert CapExceeded(nextSupply, MAX_SUPPLY);
        }
        _mint(to, amount);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address prev = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(prev, newTreasury);
    }

    function setRegistrationFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 prev = registrationFee;
        registrationFee = newFee;
        emit RegistrationFeeUpdated(prev, newFee);
    }

    function setTestnetFaucetEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        testnetFaucetEnabled = enabled;
        emit TestnetFaucetToggled(enabled);
    }

    /**
     * @notice Polygon Amoy Testnet faucet so citizens and buyers can acquire test ANAGU
     *         tokens to test land registration fees and purchase escrow flows.
     */
    function claimTestnetFaucet() external nonReentrant {
        if (!testnetFaucetEnabled) revert TestnetFaucetDisabled();

        uint64 lastClaim = lastFaucetClaimAt[msg.sender];
        if (lastClaim != 0 && block.timestamp < uint256(lastClaim) + FAUCET_COOLDOWN) {
            revert FaucetCooldownActive(uint256(lastClaim) + FAUCET_COOLDOWN);
        }

        uint256 nextSupply = totalSupply() + FAUCET_DRIP_AMOUNT;
        if (nextSupply > MAX_SUPPLY) {
            revert CapExceeded(nextSupply, MAX_SUPPLY);
        }

        lastFaucetClaimAt[msg.sender] = uint64(block.timestamp);
        _mint(msg.sender, FAUCET_DRIP_AMOUNT);

        emit TestnetFaucetClaimed(msg.sender, FAUCET_DRIP_AMOUNT, uint64(block.timestamp));
    }

    // -------------------------------------------------------------------------
    // Step 1 Due Process: Statutory Land Registration Fee Payment
    // -------------------------------------------------------------------------

    /**
     * @notice Settles the statutory ANAGU land registration filing fee for `parcelId`.
     * @param parcelId Unique off-chain parcel application ID (e.g. "PAR-2026-4821").
     * @return parcelIdHash Deterministic keccak256 hash stored on-chain (zero PII).
     */
    function payLandRegistrationFee(
        string calldata parcelId
    ) external nonReentrant returns (bytes32 parcelIdHash) {
        if (bytes(parcelId).length == 0) revert InvalidParcelId();

        parcelIdHash = keccak256(abi.encodePacked(parcelId));
        if (_registrationReceipts[parcelIdHash].paid) {
            revert RegistrationFeeAlreadyPaid(parcelIdHash);
        }

        uint256 fee = registrationFee;
        if (fee > 0) {
            _transfer(msg.sender, treasury, fee);
        }

        uint64 nowTs = uint64(block.timestamp);
        _registrationReceipts[parcelIdHash] = RegistrationFeeReceipt({
            payer: msg.sender,
            amount: fee,
            paidAt: nowTs,
            paid: true
        });

        emit LandRegistrationFeePaid(parcelIdHash, msg.sender, treasury, fee, nowTs);
    }

    // -------------------------------------------------------------------------
    // Step 4 Due Process: Statutory Land Purchase Escrow
    // -------------------------------------------------------------------------

    /**
     * @notice Locks ANAGU tokens in statutory purchase escrow pending Registrar title
     *         transfer consent (`AnaguLandTitleNFT.registryTransfer`).
     * @param parcelId Unique parcel identifier being purchased.
     * @param seller   Verified titleholder receiving wallet address.
     * @param amount   Purchase settlement amount in ANAGU wei (18 decimals).
     * @return escrowId Monotonic escrow identifier.
     */
    function openPurchaseEscrow(
        string calldata parcelId,
        address seller,
        uint256 amount
    ) external nonReentrant returns (uint256 escrowId) {
        if (bytes(parcelId).length == 0) revert InvalidParcelId();
        if (seller == address(0)) revert ZeroAddress();
        if (seller == msg.sender) revert BuyerCannotBeSeller(msg.sender);
        if (amount == 0) revert InvalidAmount();

        bytes32 parcelIdHash = keccak256(abi.encodePacked(parcelId));
        escrowId = ++_nextEscrowId;
        uint64 nowTs = uint64(block.timestamp);

        _escrows[escrowId] = PurchaseEscrow({
            escrowId: escrowId,
            parcelIdHash: parcelIdHash,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            status: EscrowStatus.Funded,
            createdAt: nowTs,
            settledAt: 0,
            instrumentHash: bytes32(0)
        });
        _parcelEscrowIds[parcelIdHash].push(escrowId);

        _transfer(msg.sender, address(this), amount);

        emit PurchaseEscrowOpened(escrowId, parcelIdHash, msg.sender, seller, amount, nowTs);
    }

    /**
     * @notice Releases escrowed ANAGU funds to the seller once the Ministry Registrar
     *         approves and records the statutory Deed of Assignment.
     */
    function releasePurchaseEscrow(
        uint256 escrowId,
        bytes32 instrumentHash
    ) external onlyRole(REGISTRAR_ROLE) nonReentrant {
        if (instrumentHash == bytes32(0)) revert InvalidInstrumentHash();

        PurchaseEscrow storage escrow = _escrows[escrowId];
        if (escrow.escrowId == 0) revert EscrowNotFound(escrowId);
        if (escrow.status != EscrowStatus.Funded) {
            revert EscrowNotFunded(escrowId, escrow.status);
        }

        uint64 nowTs = uint64(block.timestamp);
        escrow.status = EscrowStatus.Released;
        escrow.settledAt = nowTs;
        escrow.instrumentHash = instrumentHash;

        _transfer(address(this), escrow.seller, escrow.amount);

        emit PurchaseEscrowReleased(
            escrowId,
            escrow.parcelIdHash,
            escrow.seller,
            escrow.amount,
            instrumentHash,
            msg.sender,
            nowTs
        );
    }

    /**
     * @notice Refunds escrowed ANAGU funds back to the buyer if the Registrar declines
     *         consent or the buyer cancels before settlement.
     */
    function refundPurchaseEscrow(
        uint256 escrowId,
        string calldata reason
    ) external nonReentrant {
        PurchaseEscrow storage escrow = _escrows[escrowId];
        if (escrow.escrowId == 0) revert EscrowNotFound(escrowId);
        if (escrow.status != EscrowStatus.Funded) {
            revert EscrowNotFunded(escrowId, escrow.status);
        }
        if (msg.sender != escrow.buyer && !hasRole(REGISTRAR_ROLE, msg.sender)) {
            revert UnauthorizedEscrowRefund(msg.sender, escrowId);
        }

        uint64 nowTs = uint64(block.timestamp);
        escrow.status = EscrowStatus.Refunded;
        escrow.settledAt = nowTs;

        _transfer(address(this), escrow.buyer, escrow.amount);

        emit PurchaseEscrowRefunded(
            escrowId,
            escrow.parcelIdHash,
            escrow.buyer,
            escrow.amount,
            msg.sender,
            reason,
            nowTs
        );
    }

    // -------------------------------------------------------------------------
    // View Helpers
    // -------------------------------------------------------------------------

    function computeParcelIdHash(string calldata parcelId) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(parcelId));
    }

    function hasPaidRegistrationFee(string calldata parcelId) external view returns (bool) {
        return _registrationReceipts[keccak256(abi.encodePacked(parcelId))].paid;
    }

    function getRegistrationFeeReceipt(
        string calldata parcelId
    ) external view returns (RegistrationFeeReceipt memory) {
        return _registrationReceipts[keccak256(abi.encodePacked(parcelId))];
    }

    function getPurchaseEscrow(uint256 escrowId) external view returns (PurchaseEscrow memory) {
        if (_escrows[escrowId].escrowId == 0) revert EscrowNotFound(escrowId);
        return _escrows[escrowId];
    }

    function getParcelEscrowIds(string calldata parcelId) external view returns (uint256[] memory) {
        return _parcelEscrowIds[keccak256(abi.encodePacked(parcelId))];
    }

    function totalEscrows() external view returns (uint256) {
        return _nextEscrowId;
    }
}
