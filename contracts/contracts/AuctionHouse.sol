// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AuctionHouse — English and Dutch auctions with NFT escrow, pull-payment bidding,
///        anti-sniping timer extension, and royalty-aware settlement.
contract AuctionHouse is ReentrancyGuard, Pausable, Ownable, IERC721Receiver {
    // ──── Commission State ────

    /// @notice Marketplace commission in basis points (2.5%)
    uint256 public commissionRate = 250;
    uint256 public constant COMMISSION_DENOMINATOR = 10000;

    // ──── Auction Constants ────

    uint256 public constant ANTI_SNIPE_WINDOW = 10 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 10 minutes;
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;

    // ──── Auction Structs ────

    struct EnglishAuction {
        address nftContract;
        uint256 tokenId;
        address payable seller;
        uint256 startTime;
        uint256 endTime;
        uint256 reservePrice;
        address highestBidder;
        uint256 highestBid;
        bool settled;
        bool cancelled;
    }

    struct DutchAuction {
        address nftContract;
        uint256 tokenId;
        address payable seller;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 duration;
        bool sold;
        bool cancelled;
    }

    // ──── State ────

    uint256 private _nextEnglishAuctionId;

    /// @notice English auction storage by ID
    mapping(uint256 => EnglishAuction) public englishAuctions;

    /// @notice Pull-payment ledger: auctionId => bidder => refundable amount
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;

    uint256 private _nextDutchAuctionId;

    /// @notice Dutch auction storage by ID
    mapping(uint256 => DutchAuction) public dutchAuctions;

    // ──── Events ────

    event EnglishAuctionCreated(
        uint256 indexed auctionId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 reservePrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 newEndTime
    );

    event BidWithdrawn(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event EnglishAuctionSettled(
        uint256 indexed auctionId,
        address winner,
        uint256 amount
    );

    event EnglishAuctionCancelled(uint256 indexed auctionId);

    event CommissionRateUpdated(uint256 newRate);

    event DutchAuctionCreated(
        uint256 indexed auctionId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    );

    event DutchAuctionSold(
        uint256 indexed auctionId,
        address indexed buyer,
        uint256 price
    );

    event DutchAuctionCancelled(uint256 indexed auctionId);

    // ──── Constructor ────

    constructor() Ownable(msg.sender) {}

    // ──── Core Functions ────

    /// @notice Create an English auction. The NFT is escrowed in this contract.
    /// @param nftContract Address of the ERC-721 contract
    /// @param tokenId     Token to auction
    /// @param reservePrice Minimum bid amount in wei
    /// @param duration    Auction duration in seconds (1h–30d)
    /// @return auctionId  The newly created auction ID
    function createEnglishAuction(
        address nftContract,
        uint256 tokenId,
        uint256 reservePrice,
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        require(reservePrice > 0, "Reserve price must be > 0");
        require(
            duration >= MIN_AUCTION_DURATION && duration <= MAX_AUCTION_DURATION,
            "Invalid duration"
        );
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the NFT owner"
        );

        uint256 auctionId = _nextEnglishAuctionId++;

        englishAuctions[auctionId] = EnglishAuction({
            nftContract: nftContract,
            tokenId: tokenId,
            seller: payable(msg.sender),
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            reservePrice: reservePrice,
            highestBidder: address(0),
            highestBid: 0,
            settled: false,
            cancelled: false
        });

        // Escrow: transfer NFT from seller to this contract
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        emit EnglishAuctionCreated(
            auctionId,
            nftContract,
            tokenId,
            msg.sender,
            reservePrice,
            block.timestamp + duration
        );

        return auctionId;
    }

    /// @notice Place a bid on an active auction.
    ///         Outbid amounts are credited to pendingReturns for pull-payment.
    /// @param auctionId The auction to bid on
    function placeBid(uint256 auctionId) external payable nonReentrant whenNotPaused {
        EnglishAuction storage a = englishAuctions[auctionId];

        require(a.seller != address(0), "Auction does not exist");
        require(!a.settled, "Auction already settled");
        require(!a.cancelled, "Auction is cancelled");
        require(block.timestamp >= a.startTime, "Auction not started");
        require(block.timestamp < a.endTime, "Auction has ended");
        require(msg.value > a.highestBid, "Bid must exceed current highest bid");
        require(msg.value >= a.reservePrice, "Bid below reserve price");
        require(msg.sender != a.seller, "Seller cannot bid");

        // Credit previous highest bidder for pull-withdrawal
        if (a.highestBidder != address(0)) {
            pendingReturns[auctionId][a.highestBidder] += a.highestBid;
        }

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;

        // Anti-sniping: extend auction if bid placed within the snipe window
        if (a.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            a.endTime += ANTI_SNIPE_EXTENSION;
        }

        emit BidPlaced(auctionId, msg.sender, msg.value, a.endTime);
    }

    /// @notice Withdraw a refundable outbid amount. Uses pull-payment pattern (CEI).
    /// @param auctionId The auction from which to withdraw
    function withdrawBid(uint256 auctionId) external nonReentrant {
        uint256 amount = pendingReturns[auctionId][msg.sender];
        require(amount > 0, "No funds to withdraw");

        // CEI: zero before transfer
        pendingReturns[auctionId][msg.sender] = 0;

        payable(msg.sender).transfer(amount);

        emit BidWithdrawn(auctionId, msg.sender, amount);
    }

    /// @notice Settle an expired auction. Anyone can call this.
    ///         - If bids exist: NFT goes to winner, ETH goes to seller minus fees.
    ///         - If no bids: NFT returns to seller.
    /// @param auctionId The auction to settle
    function settleAuction(uint256 auctionId) external nonReentrant {
        EnglishAuction storage a = englishAuctions[auctionId];

        require(a.seller != address(0), "Auction does not exist");
        require(block.timestamp >= a.endTime, "Auction has not ended");
        require(!a.settled, "Auction already settled");
        require(!a.cancelled, "Auction is cancelled");

        // CEI: update state BEFORE external calls
        a.settled = true;

        if (a.highestBidder != address(0)) {
            // Transfer NFT to winner
            IERC721(a.nftContract).safeTransferFrom(
                address(this),
                a.highestBidder,
                a.tokenId
            );

            // Pay seller minus commission and royalty
            _deductFeesAndPay(a.nftContract, a.tokenId, a.seller, a.highestBid);

            emit EnglishAuctionSettled(auctionId, a.highestBidder, a.highestBid);
        } else {
            // No bids — return NFT to seller
            IERC721(a.nftContract).safeTransferFrom(
                address(this),
                a.seller,
                a.tokenId
            );

            emit EnglishAuctionSettled(auctionId, address(0), 0);
        }
    }

    /// @notice Cancel an auction with no bids. Only the seller can cancel.
    ///         The escrowed NFT is returned to the seller.
    /// @param auctionId The auction to cancel
    function cancelEnglishAuction(uint256 auctionId) external {
        EnglishAuction storage a = englishAuctions[auctionId];

        require(a.seller != address(0), "Auction does not exist");
        require(msg.sender == a.seller, "Not the seller");
        require(!a.settled, "Auction already settled");
        require(!a.cancelled, "Auction already cancelled");
        require(a.highestBidder == address(0), "Cannot cancel with active bids");

        a.cancelled = true;

        // Return escrowed NFT to seller
        IERC721(a.nftContract).safeTransferFrom(address(this), a.seller, a.tokenId);

        emit EnglishAuctionCancelled(auctionId);
    }

    // ──── Dutch Auction Functions ────

    /// @notice Create a Dutch auction. The NFT is escrowed in this contract.
    ///         Price decreases linearly from startPrice to endPrice over duration.
    /// @param nftContract  Address of the ERC-721 contract
    /// @param tokenId      Token to auction
    /// @param startPrice   Starting (highest) price in wei
    /// @param endPrice     Floor (lowest) price in wei — must be > 0 and < startPrice
    /// @param duration     Auction duration in seconds (1h–30d)
    /// @return auctionId   The newly created Dutch auction ID
    function createDutchAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        require(startPrice > endPrice, "startPrice must exceed endPrice");
        require(endPrice > 0, "endPrice must be > 0");
        require(
            duration >= MIN_AUCTION_DURATION && duration <= MAX_AUCTION_DURATION,
            "Invalid duration"
        );
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the NFT owner"
        );

        uint256 auctionId = _nextDutchAuctionId++;

        dutchAuctions[auctionId] = DutchAuction({
            nftContract: nftContract,
            tokenId: tokenId,
            seller: payable(msg.sender),
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: block.timestamp,
            duration: duration,
            sold: false,
            cancelled: false
        });

        // Escrow: transfer NFT from seller to this contract
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        emit DutchAuctionCreated(
            auctionId,
            nftContract,
            tokenId,
            msg.sender,
            startPrice,
            endPrice,
            duration
        );

        return auctionId;
    }

    /// @notice Compute the current price of a Dutch auction via linear decay.
    ///         Pure computation — no storage writes. Returns floor once duration elapses.
    /// @param auctionId  The Dutch auction to query
    /// @return           Current price in wei
    function getCurrentPrice(uint256 auctionId) public view returns (uint256) {
        DutchAuction storage a = dutchAuctions[auctionId];
        uint256 elapsed = block.timestamp - a.startTime;
        if (elapsed >= a.duration) {
            return a.endPrice;
        }
        // Linear decay: startPrice - ((startPrice - endPrice) * elapsed / duration)
        uint256 priceDrop = ((a.startPrice - a.endPrice) * elapsed) / a.duration;
        return a.startPrice - priceDrop;
    }

    /// @notice Buy an NFT at the current Dutch auction price.
    ///         Overpayment is refunded. Royalty + commission are deducted from sale.
    /// @param auctionId  The Dutch auction to purchase from
    function buyDutch(uint256 auctionId) external payable nonReentrant whenNotPaused {
        DutchAuction storage a = dutchAuctions[auctionId];

        require(a.seller != address(0), "Auction does not exist");
        require(!a.sold, "Auction already sold");
        require(!a.cancelled, "Auction is cancelled");

        uint256 currentPrice = getCurrentPrice(auctionId);
        require(msg.value >= currentPrice, "Insufficient ETH sent");

        // CEI: update state BEFORE external calls
        a.sold = true;

        // Refund overpayment to buyer
        uint256 overpayment = msg.value - currentPrice;
        if (overpayment > 0) {
            payable(msg.sender).transfer(overpayment);
        }

        // Transfer NFT to buyer
        IERC721(a.nftContract).safeTransferFrom(address(this), msg.sender, a.tokenId);

        // Pay seller minus commission and royalty
        _deductFeesAndPay(a.nftContract, a.tokenId, a.seller, currentPrice);

        emit DutchAuctionSold(auctionId, msg.sender, currentPrice);
    }

    /// @notice Cancel an unsold Dutch auction. Only the seller can cancel.
    ///         The escrowed NFT is returned to the seller.
    /// @param auctionId  The Dutch auction to cancel
    function cancelDutchAuction(uint256 auctionId) external {
        DutchAuction storage a = dutchAuctions[auctionId];

        require(a.seller != address(0), "Auction does not exist");
        require(msg.sender == a.seller, "Not the seller");
        require(!a.sold, "Auction already sold");
        require(!a.cancelled, "Auction already cancelled");

        a.cancelled = true;

        // Return escrowed NFT to seller
        IERC721(a.nftContract).safeTransferFrom(address(this), a.seller, a.tokenId);

        emit DutchAuctionCancelled(auctionId);
    }

    // ──── Admin ────

    /// @notice Update commission rate (max 10%)
    function setCommissionRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Max 10%");
        commissionRate = newRate;
        emit CommissionRateUpdated(newRate);
    }

    /// @notice Pause the auction house
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the auction house
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw accumulated commission (ETH held by contract)
    function withdrawCommission() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No commission to withdraw");
        payable(owner()).transfer(balance);
    }

    // ──── IERC721Receiver ────

    /// @notice Accept NFT transfers via safeTransferFrom (required for NFT escrow)
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    // ──── Internal ────

    /// @notice Deduct commission and royalty from sale price, pay seller and royalty receiver.
    ///         Commission stays in the contract; owner withdraws via withdrawCommission().
    ///         Mirrors the identical function in Marketplace.sol (each contract keeps its own copy
    ///         per RESEARCH.md recommendation — no shared library dependency).
    /// @param nftContract  The NFT contract address (for ERC-2981 query)
    /// @param tokenId      The token ID (for royaltyInfo call)
    /// @param seller       The seller to pay proceeds to
    /// @param salePrice    The total sale amount to distribute
    function _deductFeesAndPay(
        address nftContract,
        uint256 tokenId,
        address payable seller,
        uint256 salePrice
    ) internal {
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

        // Guard against combined fees exceeding sale price
        require(royaltyAmount + commission <= salePrice, "Fees exceed sale price");

        uint256 sellerProceeds = salePrice - commission - royaltyAmount;

        // Pay royalty receiver if applicable
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            payable(royaltyReceiver).transfer(royaltyAmount);
        }

        // Pay seller (commission stays in contract)
        seller.transfer(sellerProceeds);
    }

    receive() external payable {}
}
