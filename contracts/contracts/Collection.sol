// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Collection
/// @notice Cloneable ERC721 implementation for per-creator NFT collections.
/// @dev Deployed once as an implementation contract; clones are deployed via CollectionFactory
///      using EIP-1167 minimal proxy pattern. Name/symbol are stored in custom storage slots
///      and returned via overridden name()/symbol() to work around OZ v5 ERC721 constructor
///      limitation (Pitfall 5 in RESEARCH.md).
contract Collection is ERC721, ERC721URIStorage, ERC2981, Ownable {
    // ──── Storage ────

    /// @dev Custom name storage — ERC721 constructor sets its own private _name which clones cannot
    ///      access, so we keep our own and override name()/symbol() to return these.
    string private _collectionName;
    string private _collectionSymbol;

    /// @dev One-shot initialize guard. Set to true in constructor so the implementation itself
    ///      cannot be re-initialized (prevents front-running via Pitfall 4 in RESEARCH.md).
    bool private _initialized;

    uint256 private _nextTokenId;

    /// @notice Maximum royalty in basis points (10%)
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    // ──── Events ────

    event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI);

    // ──── Constructor ────

    /// @dev Constructor disables this implementation from being used directly.
    ///      ERC721 base requires non-empty args in its constructor even though clones skip it.
    ///      Ownable must receive msg.sender — this is the factory deployer, not a collection creator.
    constructor() ERC721("", "") Ownable(msg.sender) {
        // Mark as initialized so this implementation contract cannot be re-initialized directly.
        _initialized = true;
    }

    // ──── Initialization ────

    /// @notice Initialize a clone with its collection name, symbol, and creator.
    /// @dev Must be called atomically with Clones.clone() in CollectionFactory.createCollection().
    ///      The _initialized guard prevents anyone from calling this twice (re-entrancy/front-run guard).
    /// @param collectionName  Human-readable name for this collection (e.g. "My Art")
    /// @param collectionSymbol Token symbol (e.g. "MYART")
    /// @param creator         The address that will own this collection and can mint into it
    function initialize(
        string memory collectionName,
        string memory collectionSymbol,
        address creator
    ) external {
        require(!_initialized, "Already initialized");
        _initialized = true;
        _collectionName = collectionName;
        _collectionSymbol = collectionSymbol;
        _transferOwnership(creator);
    }

    // ──── ERC721 Metadata Overrides ────

    /// @notice Returns the collection name (stored in custom slot, not ERC721's private _name).
    function name() public view override returns (string memory) {
        return _collectionName;
    }

    /// @notice Returns the collection symbol (stored in custom slot, not ERC721's private _symbol).
    function symbol() public view override returns (string memory) {
        return _collectionSymbol;
    }

    // ──── Minting ────

    /// @notice Mint a new NFT into this collection. Only the collection owner (creator) can mint.
    /// @param _tokenURI   IPFS metadata URI for this token
    /// @param royaltyBps  Per-token royalty in basis points (e.g. 500 = 5%). Max 1000 (10%).
    /// @return tokenId    The ID of the newly minted token
    function mintNFT(string memory _tokenURI, uint96 royaltyBps)
        public
        onlyOwner
        returns (uint256)
    {
        require(royaltyBps <= MAX_ROYALTY_BPS, "Royalty exceeds 10%");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        // Royalty receiver is the collection owner (creator) at mint time
        _setTokenRoyalty(tokenId, msg.sender, royaltyBps);

        emit NFTMinted(msg.sender, tokenId, _tokenURI);
        return tokenId;
    }

    /// @notice Returns the total number of tokens minted in this collection
    function totalMinted() public view returns (uint256) {
        return _nextTokenId;
    }

    // ──── Required Overrides ────

    /// @notice Returns the token URI — resolves ERC721/ERC721URIStorage conflict.
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /// @notice Resolves the diamond conflict between ERC721, ERC721URIStorage, and ERC2981.
    ///         All three override supportsInterface — explicit override required in Solidity.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
