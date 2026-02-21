// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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

    /// @notice Reverse lookup: (nftContract => tokenId => listingId+1). 0 = no active listing.
    mapping(address => mapping(uint256 => uint256)) public activeListingByToken;

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
        uint256 commission,
        uint256 royalty
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

        // Reverse lookup: store listingId+1 so 0 can mean "no active listing"
        activeListingByToken[nftContract][tokenId] = listingId + 1;

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

        // Clear reverse lookup
        activeListingByToken[listing.nftContract][listing.tokenId] = 0;

        // Transfer NFT to buyer
        IERC721(listing.nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId
        );

        // Refund excess payment before settlement
        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }

        // Deduct fees and pay seller + royalty receiver
        uint256 royaltyPaid = _deductFeesAndPay(
            listing.nftContract,
            listing.tokenId,
            listing.seller,
            listing.price
        );

        _removeActiveListing(listingId);

        uint256 commission = (listing.price * commissionRate) / COMMISSION_DENOMINATOR;
        emit ItemSold(listingId, msg.sender, listing.price, commission, royaltyPaid);
    }

    /// @notice Cancel a listing
    function unlistItem(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        listing.active = false;

        // Clear reverse lookup
        activeListingByToken[listing.nftContract][listing.tokenId] = 0;

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

    /// @notice Deduct commission and royalty from sale price, pay seller and royalty receiver.
    /// @dev Commission stays in contract; owner withdraws via withdrawCommission().
    /// @return royaltyPaid The royalty amount paid to the royalty receiver (0 if non-ERC2981 NFT).
    function _deductFeesAndPay(
        address nftContract,
        uint256 tokenId,
        address payable seller,
        uint256 salePrice
    ) internal returns (uint256 royaltyPaid) {
        uint256 royaltyAmount = 0;
        address royaltyReceiver = address(0);

        // Check ERC-2981 support via try/catch — handles non-standard contracts gracefully
        try IERC165(nftContract).supportsInterface(type(IERC2981).interfaceId)
            returns (bool supported)
        {
            if (supported) {
                (royaltyReceiver, royaltyAmount) =
                    IERC2981(nftContract).royaltyInfo(tokenId, salePrice);
            }
        } catch {
            // Non-standard contract reverted — treat as no royalty
        }

        uint256 commission = (salePrice * commissionRate) / COMMISSION_DENOMINATOR;

        // ROYL-04: guard against combined fees exceeding sale price
        require(royaltyAmount + commission <= salePrice, "Fees exceed sale price");

        uint256 sellerProceeds = salePrice - commission - royaltyAmount;

        // Pay royalty receiver if applicable
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            payable(royaltyReceiver).transfer(royaltyAmount);
        }

        // Pay seller (commission stays in contract)
        seller.transfer(sellerProceeds);

        return royaltyAmount;
    }

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
