// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AnaguLandTitleNFT} from "../AnaguLandTitleNFT.sol";

/**
 * @title ReentrantReceiverMock
 * @notice Test-only ERC721Receiver used to verify that malicious recipient contracts
 *         cannot bypass PeerToPeerTransferBlocked or reenter registryTransfer during callbacks.
 */
contract ReentrantReceiverMock is IERC721Receiver {
    AnaguLandTitleNFT public immutable registry;
    address public attackTarget;
    bool public attemptTransferFromOnReceive;
    bool public attemptSafeTransferFromOnReceive;

    constructor(address registryAddress, address targetAddress) {
        registry = AnaguLandTitleNFT(registryAddress);
        attackTarget = targetAddress;
    }

    function configureAttack(bool tryTransferFrom, bool trySafeTransferFrom) external {
        attemptTransferFromOnReceive = tryTransferFrom;
        attemptSafeTransferFromOnReceive = trySafeTransferFrom;
    }

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (attemptTransferFromOnReceive) {
            registry.transferFrom(address(this), attackTarget, tokenId);
        }
        if (attemptSafeTransferFromOnReceive) {
            registry.safeTransferFrom(address(this), attackTarget, tokenId);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

/**
 * @title NonReceiverContractMock
 * @notice Test-only contract that does NOT implement IERC721Receiver.
 */
contract NonReceiverContractMock {}
