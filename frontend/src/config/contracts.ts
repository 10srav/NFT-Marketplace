// Contract ABIs and Addresses
// Update these after deploying contracts

export const CONTRACTS = {
    NFT: {
        // Replace with deployed address
        address: import.meta.env.VITE_NFT_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        abi: [
            "function mintNFT(string memory _tokenURI) public returns (uint256)",
            "function burn(uint256 tokenId) public",
            "function totalMinted() public view returns (uint256)",
            "function tokenURI(uint256 tokenId) public view returns (string memory)",
            "function ownerOf(uint256 tokenId) public view returns (address)",
            "function approve(address to, uint256 tokenId) public",
            "function getApproved(uint256 tokenId) public view returns (address)",
            "function setApprovalForAll(address operator, bool approved) public",
            "function isApprovedForAll(address owner, address operator) public view returns (bool)",
            "function transferFrom(address from, address to, uint256 tokenId) public",
            "function safeTransferFrom(address from, address to, uint256 tokenId) public",
            "function balanceOf(address owner) public view returns (uint256)",
            "function name() public view returns (string memory)",
            "function symbol() public view returns (string memory)",
            "event NFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI)",
            "event NFTBurned(uint256 indexed tokenId)",
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        ],
    },
    MARKETPLACE: {
        // Replace with deployed address
        address: import.meta.env.VITE_MARKETPLACE_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        abi: [
            "function listItem(address nftContract, uint256 tokenId, uint256 price) external returns (uint256)",
            "function buyItem(uint256 listingId) external payable",
            "function unlistItem(uint256 listingId) external",
            "function getActiveListingIds() external view returns (uint256[])",
            "function totalListings() external view returns (uint256)",
            "function listings(uint256) public view returns (uint256 listingId, address nftContract, uint256 tokenId, address seller, uint256 price, bool active)",
            "function commissionRate() public view returns (uint256)",
            "function pause() external",
            "function unpause() external",
            "event ItemListed(uint256 indexed listingId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 price)",
            "event ItemSold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 commission)",
            "event ItemUnlisted(uint256 indexed listingId)",
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
