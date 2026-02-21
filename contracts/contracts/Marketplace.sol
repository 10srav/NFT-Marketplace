// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Marketplace is ReentrancyGuard, Pausable, Ownable {
    // ──── Types ────
    struct Listing {
        uint256 listingId;
        address nftContract;
        uint256 tokenId;
        address payable seller;
        uint256 price;
        bool active;
    }

    // ──── State ────
    uint256 private _nextListingId;
    uint256 public commissionRate = 250; // 2.5% (basis points / 100)
    uint256 public constant COMMISSION_DENOMINATOR = 10000;

    mapping(uint256 => Listing) public listings;
    uint256[] private _activeListingIds;

    // ──── Events ────
    event ItemListed(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );
    event ItemSold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 price,
        uint256 commission
    );
    event ItemUnlisted(uint256 indexed listingId);
    event CommissionRateUpdated(uint256 newRate);

    constructor() Ownable(msg.sender) {}

    // ──── Core Functions ────

    /// @notice List an NFT for sale. Caller must have approved this contract.
    function listItem(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external whenNotPaused returns (uint256) {
        require(price > 0, "Price must be > 0");
        IERC721 nft = IERC721(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        require(
            nft.getApproved(tokenId) == address(this) ||
                nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        uint256 listingId = _nextListingId++;
        listings[listingId] = Listing({
            listingId: listingId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: payable(msg.sender),
            price: price,
            active: true
        });
        _activeListingIds.push(listingId);

        emit ItemListed(listingId, nftContract, tokenId, msg.sender, price);
        return listingId;
    }

    /// @notice Buy a listed NFT
    function buyItem(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");
        require(msg.sender != listing.seller, "Cannot buy your own NFT");

        listing.active = false;

        // Calculate commission
        uint256 commission = (listing.price * commissionRate) / COMMISSION_DENOMINATOR;
        uint256 sellerProceeds = listing.price - commission;

        // Transfer NFT to buyer
        IERC721(listing.nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId
        );

        // Pay seller
        listing.seller.transfer(sellerProceeds);

        // Refund excess
        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }

        _removeActiveListing(listingId);

        emit ItemSold(listingId, msg.sender, listing.price, commission);
    }

    /// @notice Cancel a listing
    function unlistItem(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        listing.active = false;
        _removeActiveListing(listingId);

        emit ItemUnlisted(listingId);
    }

    // ──── View Functions ────

    /// @notice Get all active listing IDs
    function getActiveListingIds() external view returns (uint256[] memory) {
        return _activeListingIds;
    }

    /// @notice Get total number of listings ever created
    function totalListings() external view returns (uint256) {
        return _nextListingId;
    }

    // ──── Admin ────

    /// @notice Update commission rate (owner only)
    function setCommissionRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Max 10%");
        commissionRate = newRate;
        emit CommissionRateUpdated(newRate);
    }

    /// @notice Pause the marketplace
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the marketplace
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw accumulated commission
    function withdrawCommission() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No commission to withdraw");
        payable(owner()).transfer(balance);
    }

    // ──── Internal ────

    function _removeActiveListing(uint256 listingId) private {
        for (uint256 i = 0; i < _activeListingIds.length; i++) {
            if (_activeListingIds[i] == listingId) {
                _activeListingIds[i] = _activeListingIds[_activeListingIds.length - 1];
                _activeListingIds.pop();
                break;
            }
        }
    }

    receive() external payable {}
}
