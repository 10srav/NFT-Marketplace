// Contract ABIs and Addresses
// Update frontend/.env with deployed addresses from contracts/deployments/{network}.json

export const CONTRACTS = {
    NFT: {
        address: import.meta.env.VITE_NFT_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        abi: [
            // Minting (2-arg signature with royalty — updated in Phase 1)
            "function mintNFT(string memory _tokenURI, uint96 royaltyBps) public returns (uint256)",
            "function burn(uint256 tokenId) public",
            "function totalMinted() public view returns (uint256)",
            // ERC721 metadata
            "function tokenURI(uint256 tokenId) public view returns (string memory)",
            "function name() public view returns (string memory)",
            "function symbol() public view returns (string memory)",
            // ERC721 ownership and approvals
            "function ownerOf(uint256 tokenId) public view returns (address)",
            "function balanceOf(address owner) public view returns (uint256)",
            "function approve(address to, uint256 tokenId) public",
            "function getApproved(uint256 tokenId) public view returns (address)",
            "function setApprovalForAll(address operator, bool approved) public",
            "function isApprovedForAll(address owner, address operator) public view returns (bool)",
            "function transferFrom(address from, address to, uint256 tokenId) public",
            "function safeTransferFrom(address from, address to, uint256 tokenId) public",
            // ERC-2981 royalty
            "function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount)",
            "function supportsInterface(bytes4 interfaceId) public view returns (bool)",
            // Events
            "event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI)",
            "event NFTBurned(uint256 indexed tokenId)",
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
            "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
            "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
        ],
    },

    MARKETPLACE: {
        address: import.meta.env.VITE_MARKETPLACE_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        abi: [
            // Core listing functions
            "function listItem(address nftContract, uint256 tokenId, uint256 price) external returns (uint256)",
            "function buyItem(uint256 listingId) external payable",
            "function unlistItem(uint256 listingId) external",
            // Offer functions (added Phase 1 plan 05)
            "function makeOffer(address nftContract, uint256 tokenId, uint256 durationSeconds) external payable returns (uint256)",
            "function acceptOffer(uint256 offerId) external",
            "function rejectOffer(uint256 offerId) external",
            "function cancelOffer(uint256 offerId) external",
            "function getOffer(uint256 offerId) external view returns (uint256 offerId, address nftContract, uint256 tokenId, address buyer, uint256 amount, uint256 expiry, bool active)",
            // View functions
            "function getActiveListingIds() external view returns (uint256[])",
            "function totalListings() external view returns (uint256)",
            "function totalOffers() external view returns (uint256)",
            "function accumulatedCommission() external view returns (uint256)",
            // Storage mappings
            "function listings(uint256) public view returns (uint256 listingId, address nftContract, uint256 tokenId, address seller, uint256 price, bool active)",
            "function offers(uint256) public view returns (uint256 offerId, address nftContract, uint256 tokenId, address buyer, uint256 amount, uint256 expiry, bool active)",
            "function activeListingByToken(address nftContract, uint256 tokenId) public view returns (uint256)",
            // Config
            "function commissionRate() public view returns (uint256)",
            // Admin
            "function pause() external",
            "function unpause() external",
            "function setCommissionRate(uint256 newRate) external",
            "function withdrawCommission() external",
            // Events — ItemSold has 5 args including royalty (updated Phase 1 plan 05)
            "event ItemListed(uint256 indexed listingId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 price)",
            "event ItemSold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 commission, uint256 royalty)",
            "event ItemUnlisted(uint256 indexed listingId)",
            "event CommissionRateUpdated(uint256 newRate)",
            "event OfferMade(uint256 indexed offerId, address indexed nftContract, uint256 indexed tokenId, address buyer, uint256 amount, uint256 expiry)",
            "event OfferAccepted(uint256 indexed offerId, address indexed nftContract, uint256 indexed tokenId, address seller, address buyer, uint256 amount)",
            "event OfferRejected(uint256 indexed offerId)",
            "event OfferCancelled(uint256 indexed offerId)",
        ],
    },

    AUCTION_HOUSE: {
        address: import.meta.env.VITE_AUCTION_HOUSE_ADDRESS || "0x0000000000000000000000000000000000000000",
        abi: [
            // English auction functions
            "function createEnglishAuction(address nftContract, uint256 tokenId, uint256 reservePrice, uint256 duration) external returns (uint256)",
            "function placeBid(uint256 auctionId) external payable",
            "function withdrawBid(uint256 auctionId) external",
            "function settleAuction(uint256 auctionId) external",
            "function cancelEnglishAuction(uint256 auctionId) external",
            // Dutch auction functions
            "function createDutchAuction(address nftContract, uint256 tokenId, uint256 startPrice, uint256 endPrice, uint256 duration) external returns (uint256)",
            "function getCurrentPrice(uint256 auctionId) public view returns (uint256)",
            "function buyDutch(uint256 auctionId) external payable",
            "function cancelDutchAuction(uint256 auctionId) external",
            // Storage mappings
            "function englishAuctions(uint256) public view returns (address nftContract, uint256 tokenId, address seller, uint256 startTime, uint256 endTime, uint256 reservePrice, address highestBidder, uint256 highestBid, bool settled, bool cancelled)",
            "function dutchAuctions(uint256) public view returns (address nftContract, uint256 tokenId, address seller, uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 duration, bool sold, bool cancelled)",
            "function pendingReturns(uint256 auctionId, address bidder) public view returns (uint256)",
            // Config
            "function commissionRate() public view returns (uint256)",
            // Admin
            "function pause() external",
            "function unpause() external",
            "function setCommissionRate(uint256 newRate) external",
            "function withdrawCommission() external",
            // English auction events
            "event EnglishAuctionCreated(uint256 indexed auctionId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 reservePrice, uint256 endTime)",
            "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 newEndTime)",
            "event BidWithdrawn(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
            "event EnglishAuctionSettled(uint256 indexed auctionId, address winner, uint256 amount)",
            "event EnglishAuctionCancelled(uint256 indexed auctionId)",
            // Dutch auction events
            "event DutchAuctionCreated(uint256 indexed auctionId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 startPrice, uint256 endPrice, uint256 duration)",
            "event DutchAuctionSold(uint256 indexed auctionId, address indexed buyer, uint256 price)",
            "event DutchAuctionCancelled(uint256 indexed auctionId)",
            // Shared events
            "event CommissionRateUpdated(uint256 newRate)",
        ],
    },

    COLLECTION_FACTORY: {
        address: import.meta.env.VITE_COLLECTION_FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000",
        abi: [
            "function createCollection(string memory collectionName, string memory collectionSymbol) external returns (address cloneAddress)",
            "function getAllCollections() external view returns (address[])",
            "function getCollectionsByCreator(address creator) external view returns (address[])",
            "function totalCollections() external view returns (uint256)",
            "function collectionImplementation() public view returns (address)",
            // Events
            "event CollectionCreated(address indexed creator, address indexed collection, string name, string symbol)",
        ],
    },

    // COLLECTION has no fixed address — each clone is a separate deployment.
    // Use this ABI when interacting with a specific collection clone address.
    COLLECTION: {
        abi: [
            // Initialization (called once by factory — not for direct use)
            "function initialize(string memory collectionName, string memory collectionSymbol, address creator) external",
            // Minting (onlyOwner)
            "function mintNFT(string memory _tokenURI, uint96 royaltyBps) public returns (uint256)",
            "function totalMinted() public view returns (uint256)",
            // ERC721 metadata
            "function tokenURI(uint256 tokenId) public view returns (string memory)",
            "function name() public view returns (string memory)",
            "function symbol() public view returns (string memory)",
            // ERC721 ownership and approvals
            "function ownerOf(uint256 tokenId) public view returns (address)",
            "function balanceOf(address owner) public view returns (uint256)",
            "function approve(address to, uint256 tokenId) public",
            "function getApproved(uint256 tokenId) public view returns (address)",
            "function setApprovalForAll(address operator, bool approved) public",
            "function isApprovedForAll(address owner, address operator) public view returns (bool)",
            "function transferFrom(address from, address to, uint256 tokenId) public",
            "function safeTransferFrom(address from, address to, uint256 tokenId) public",
            // Ownable
            "function owner() public view returns (address)",
            // ERC-2981 royalty
            "function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount)",
            "function supportsInterface(bytes4 interfaceId) public view returns (bool)",
            // Events
            "event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI)",
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
            "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
            "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
        ],
    },
};

// Network config
export const SUPPORTED_CHAINS = {
    HARDHAT: { id: 31337, name: "Hardhat Local", rpc: "http://127.0.0.1:8545" },
    SEPOLIA: { id: 11155111, name: "Sepolia Testnet", rpc: import.meta.env.VITE_ALCHEMY_SEPOLIA_URL || "" },
};

export const PINATA_CONFIG = {
    apiKey: import.meta.env.VITE_PINATA_API_KEY || "",
    apiSecret: import.meta.env.VITE_PINATA_API_SECRET || "",
    gateway: import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
};
