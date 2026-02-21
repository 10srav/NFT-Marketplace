// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Plain ERC721 without ERC-2981 royalty support. Used in Marketplace tests
///         to verify graceful fallback when supportsInterface(IERC2981) returns false.
contract MockPlainERC721 is ERC721 {
    uint256 private _nextTokenId;

    constructor() ERC721("MockPlain", "MOCK") {}

    /// @notice Mint token to a given address (no royalty)
    function mint(address to) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }
}
