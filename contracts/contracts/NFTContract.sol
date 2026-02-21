// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract NFTContract is ERC721, ERC721URIStorage, ERC2981, Ownable {
    uint256 private _nextTokenId;

    /// @notice Maximum royalty in basis points (10%)
    uint256 public constant MAX_ROYALTY_BPS = 1000;

    event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI);
    event NFTBurned(uint256 indexed tokenId);

    constructor() ERC721("NFT Marketplace", "NFTM") Ownable(msg.sender) {}

    /// @notice Mint a new NFT with the given metadata URI and royalty percentage
    /// @param _tokenURI IPFS metadata URI
    /// @param royaltyBps Royalty in basis points (e.g. 500 = 5%). Max 1000 (10%).
    /// @return tokenId The ID of the newly minted token
    function mintNFT(string memory _tokenURI, uint96 royaltyBps) public returns (uint256) {
        require(royaltyBps <= MAX_ROYALTY_BPS, "Royalty exceeds 10%");
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        _setTokenRoyalty(tokenId, msg.sender, royaltyBps);
        emit NFTMinted(msg.sender, tokenId, _tokenURI);
        return tokenId;
    }

    /// @notice Burn a token you own
    /// @param tokenId The token to burn
    function burn(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        _burn(tokenId);
        emit NFTBurned(tokenId);
    }

    /// @notice Get total number of tokens minted
    function totalMinted() public view returns (uint256) {
        return _nextTokenId;
    }

    // Required overrides for ERC721URIStorage
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    // Required override to resolve diamond conflict between ERC721URIStorage and ERC2981
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
