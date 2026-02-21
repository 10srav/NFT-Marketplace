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

    struct Offer {
        uint256 offerId;
        address nftContract;
        uint256 tokenId;
        address payable buyer;
        uint256 amount;
        uint256 expiry;
        bool active;
    }

    // ──── State ────
    uint256 private _nextListingId;
    uint256 private _nextOfferId;

    uint256 public commissionRate = 250; // 2.5% (basis points / 100)
    uint256 public constant COMMISSION_DENOMINATOR = 10000;

    uint256 public constant DEFAULT_OFFER_DURATION = 7 days;
    uint256 public constant MIN_OFFER_DURATION = 1 hours;
    uint256 public constant MAX_OFFER_DURATION = 30 days;

    mapping(uint256 => Listing) public listings;
    uint256[] private _activeListingIds;

    /// @notice Reverse lookup: (nftContract => tokenId => listingId+1). 0 = no active listing.
    mapping(address => mapping(uint256 => uint256)) public activeListingByToken;

    mapping(uint256 => Offer) public offers;

    /// @notice Accumulated commission from sales (excludes escrowed offer ETH).
    uint256 private _accumulatedCommission;

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

    event OfferMade(
        uint256 indexed offerId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address buyer,
        uint256 amount,
        uint256 expiry
    );
    event OfferAccepted(
        uint256 indexed offerId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 amount
    );
    event OfferRejected(uint256 indexed offerId);
    event OfferCancelled(uint256 indexed offerId);

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

    // ──── Offer Functions ────

    /// @notice Make an ETH offer on any NFT. ETH is escrowed in the contract.
    /// @param nftContract The NFT contract address
    /// @param tokenId The token to offer on
    /// @param durationSeconds Offer validity in seconds (1h–30d; 0 uses default 7 days)
    function makeOffer(
        address nftContract,
        uint256 tokenId,
        uint256 durationSeconds
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(msg.value > 0, "Offer amount must be > 0");

        uint256 duration = durationSeconds == 0 ? DEFAULT_OFFER_DURATION : durationSeconds;
        require(duration >= MIN_OFFER_DURATION, "Duration too short (min 1h)");
        require(duration <= MAX_OFFER_DURATION, "Duration too long (max 30d)");

        uint256 offerId = _nextOfferId++;
        uint256 expiry = block.timestamp + duration;

        offers[offerId] = Offer({
            offerId: offerId,
            nftContract: nftContract,
            tokenId: tokenId,
            buyer: payable(msg.sender),
            amount: msg.value,
            expiry: expiry,
            active: true
        });

        emit OfferMade(offerId, nftContract, tokenId, msg.sender, msg.value, expiry);
        return offerId;
    }

    /// @notice Accept an offer. Caller must be the NFT owner and have approved this contract.
    /// @dev Follows CEI: state change before external calls to prevent reentrancy.
    function acceptOffer(uint256 offerId) external nonReentrant whenNotPaused {
        Offer storage offer = offers[offerId];
        require(offer.active, "Offer not active");
        require(block.timestamp <= offer.expiry, "Offer expired");
        require(
            IERC721(offer.nftContract).ownerOf(offer.tokenId) == msg.sender,
            "Not the NFT owner"
        );

        // CEI: mark inactive BEFORE external calls
        offer.active = false;

        address nftContract = offer.nftContract;
        uint256 tokenId = offer.tokenId;
        address payable buyer = offer.buyer;
        uint256 amount = offer.amount;

        // Auto-unlist any active fixed-price listing for this NFT
        _unlistIfActive(nftContract, tokenId);

        // Transfer NFT from seller to buyer
        IERC721(nftContract).safeTransferFrom(msg.sender, buyer, tokenId);

        // Deduct fees and pay seller from escrowed ETH
        _deductFeesAndPay(
            nftContract,
            tokenId,
            payable(msg.sender),
            amount
        );

        emit OfferAccepted(offerId, nftContract, tokenId, msg.sender, buyer, amount);
    }

    /// @notice Reject an offer (NFT owner only). Refunds escrowed ETH to buyer.
    function rejectOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        require(offer.active, "Offer not active");
        require(
            IERC721(offer.nftContract).ownerOf(offer.tokenId) == msg.sender,
            "Not the NFT owner"
        );

        offer.active = false;

        // Refund buyer
        offer.buyer.transfer(offer.amount);

        emit OfferRejected(offerId);
    }

    /// @notice Cancel your own pending offer. Refunds escrowed ETH.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "Offer not active");
        require(offer.buyer == msg.sender, "Not the offer buyer");

        offer.active = false;

        // Refund buyer
        offer.buyer.transfer(offer.amount);

        emit OfferCancelled(offerId);
    }

    /// @notice Get offer details by ID
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
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

    /// @notice Get total number of offers ever created
    function totalOffers() external view returns (uint256) {
        return _nextOfferId;
    }

    /// @notice Get the accumulated commission available to withdraw
    function accumulatedCommission() external view returns (uint256) {
        return _accumulatedCommission;
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

    /// @notice Withdraw accumulated commission only (never touches escrowed offer ETH)
    function withdrawCommission() external onlyOwner {
        uint256 amount = _accumulatedCommission;
        require(amount > 0, "No commission to withdraw");
        _accumulatedCommission = 0;
        payable(owner()).transfer(amount);
    }

    // ──── Internal ────

    /// @notice Deduct commission and royalty from sale price, pay seller and royalty receiver.
    /// @dev Commission stays in contract and is tracked via _accumulatedCommission;
    ///      owner withdraws via withdrawCommission().
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

        // Track commission separately from escrowed offer ETH
        _accumulatedCommission += commission;

        // Pay royalty receiver if applicable
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            payable(royaltyReceiver).transfer(royaltyAmount);
        }

        // Pay seller (commission stays in contract)
        seller.transfer(sellerProceeds);

        return royaltyAmount;
    }

    /// @notice Unlist a token if it has an active fixed-price listing.
    /// @dev Used by acceptOffer to auto-cancel listings when an offer is accepted.
    function _unlistIfActive(address nftContract, uint256 tokenId) internal {
        uint256 storedId = activeListingByToken[nftContract][tokenId];
        if (storedId == 0) return; // No active listing

        uint256 listingId = storedId - 1; // Convert from stored (id+1) to actual id
        Listing storage listing = listings[listingId];

        if (!listing.active) return; // Guard: already inactive

        listing.active = false;
        activeListingByToken[nftContract][tokenId] = 0;
        _removeActiveListing(listingId);

        emit ItemUnlisted(listingId);
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
