// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTContract is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI);
    event NFTBurned(uint256 indexed tokenId);

    constructor() ERC721("NFT Marketplace", "NFTM") Ownable(msg.sender) {}

    /// @notice Mint a new NFT with the given metadata URI
    /// @param _tokenURI IPFS metadata URI
    /// @return tokenId The ID of the newly minted token
    function mintNFT(string memory _tokenURI) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
