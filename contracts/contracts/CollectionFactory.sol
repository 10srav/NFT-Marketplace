// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Collection} from "./Collection.sol";

/// @title CollectionFactory
/// @notice Factory contract that deploys per-creator ERC721 collection contracts
///         using EIP-1167 minimal proxies (clones). Each collection costs ~$2 to deploy
///         vs ~$50 for a full contract deployment, and gets its own contract address for
///         clean indexing in Phase 2 subgraph.
/// @dev Uses OpenZeppelin Clones.clone() to deploy minimal proxies of the Collection
///      implementation contract, then atomically calls initialize() to prevent front-running
///      (Pitfall 4 in RESEARCH.md).
contract CollectionFactory is Ownable {
    // ──── State ────

    /// @notice The singleton Collection implementation contract that all clones delegate to.
    address public immutable collectionImplementation;

    /// @notice All collection clone addresses ever created through this factory.
    address[] public allCollections;

    /// @notice Per-creator collection addresses.
    mapping(address => address[]) public collectionsByCreator;

    // ──── Events ────

    event CollectionCreated(
        address indexed creator,
        address indexed collection,
        string name,
        string symbol
    );

    // ──── Constructor ────

    /// @dev Deploy the singleton implementation. The implementation's constructor sets
    ///      _initialized = true so it cannot be initialized directly.
    constructor() Ownable(msg.sender) {
        collectionImplementation = address(new Collection());
    }

    // ──── Core ────

    /// @notice Deploy a new ERC721 collection clone and initialize it for the caller.
    /// @dev Clones are deployed and initialized in the same transaction to prevent
    ///      front-running between clone() and initialize() (Pitfall 4 in RESEARCH.md).
    /// @param collectionName   Human-readable name for the collection (e.g. "My Art")
    /// @param collectionSymbol Token symbol (e.g. "MYART")
    /// @return cloneAddress    The address of the newly deployed collection clone
    function createCollection(string memory collectionName, string memory collectionSymbol)
        external
        returns (address cloneAddress)
    {
        cloneAddress = Clones.clone(collectionImplementation);
        Collection(cloneAddress).initialize(collectionName, collectionSymbol, msg.sender);

        allCollections.push(cloneAddress);
        collectionsByCreator[msg.sender].push(cloneAddress);

        emit CollectionCreated(msg.sender, cloneAddress, collectionName, collectionSymbol);
    }

    // ──── View Functions ────

    /// @notice Returns all collection clone addresses ever created through this factory.
    function getAllCollections() external view returns (address[] memory) {
        return allCollections;
    }

    /// @notice Returns all collection clone addresses created by a specific creator.
    function getCollectionsByCreator(address creator)
        external
        view
        returns (address[] memory)
    {
        return collectionsByCreator[creator];
    }

    /// @notice Returns the total number of collections created through this factory.
    function totalCollections() external view returns (uint256) {
        return allCollections.length;
    }
}
