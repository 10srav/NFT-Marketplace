# Architecture

**Analysis Date:** 2026-02-21

## Pattern Overview

**Overall:** Distributed full-stack Web3 application with blockchain-backed NFT operations

**Key Characteristics:**
- Layered separation between smart contracts (Solidity) and frontend (React/TypeScript)
- Event-driven contract interactions through MetaMask
- State management purely through React hooks (`useState`/`useEffect`) with no global store
- IPFS integration for decentralized storage
- Hardhat local development network supports isolated testing

## Layers

**Smart Contract Layer:**
- Purpose: Immutable on-chain business logic for NFT minting, marketplace listing, and trading
- Location: `contracts/contracts/`
- Contains: Two Solidity contracts (NFTContract.sol, Marketplace.sol)
- Depends on: OpenZeppelin v5 contracts (ERC721, ReentrancyGuard, Pausable, Ownable)
- Used by: Frontend through ethers.js contract instances

**Frontend UI Layer:**
- Purpose: React components for user interaction with contracts
- Location: `frontend/src/components/`
- Contains: Reusable UI components (NFTCard, MintForm, WalletConnect, Layout)
- Depends on: Ant Design v5, React 19, ethers.js v6
- Used by: Page components and layout structure

**Frontend Page Layer:**
- Purpose: Route-level page containers that compose components and manage page-specific logic
- Location: `frontend/src/pages/`
- Contains: Home, Marketplace, Create, Dashboard, NFTDetail
- Depends on: Components, hooks, services
- Used by: React Router v7 routing system in App.tsx

**Web3 Integration Layer:**
- Purpose: Abstraction for blockchain interaction and contract instances
- Location: `frontend/src/hooks/` and `frontend/src/config/`
- Contains: `useWallet` (MetaMask connection), `useContracts` (contract instance creation), `contracts.ts` (ABIs and addresses)
- Depends on: ethers.js v6, window.ethereum
- Used by: Pages and components for contract calls

**Storage Layer:**
- Purpose: IPFS file upload and retrieval via Pinata API
- Location: `frontend/src/services/ipfs.ts`
- Contains: `uploadImageToIPFS`, `uploadMetadataToIPFS`, `ipfsToHttp` functions
- Depends on: axios, Pinata API
- Used by: MintForm component and Marketplace for metadata resolution

## Data Flow

**NFT Minting Flow:**

1. User selects image in MintForm (`frontend/src/pages/Create.tsx`)
2. Image uploaded to IPFS via `uploadImageToIPFS()` → returns imageCID
3. Metadata JSON (name, description, image, attributes) created and uploaded to IPFS via `uploadMetadataToIPFS()` → returns metadataCID
4. `useContracts` hook retrieves signer-attached NFTContract instance
5. Call `nftContract.mintNFT("ipfs://" + metadataCID)` → returns tokenId
6. Transaction awaited via `tx.wait()`, user notified via Ant Design message API
7. Dashboard refreshes to show newly minted NFT

**NFT Listing Flow:**

1. User selects NFT from Dashboard and sets price in ListingModal
2. Frontend calls `nftContract.approve(MARKETPLACE_ADDRESS, tokenId)` for transfer approval
3. Once approved, calls `marketplace.listItem(nftAddress, tokenId, priceInWei)`
4. Marketplace contract stores Listing struct, adds listingId to `_activeListingIds` array
5. `ItemListed` event emitted; frontend updates UI
6. Listing becomes visible in Marketplace page

**NFT Purchase Flow:**

1. User clicks Buy on NFTCard in Marketplace page
2. Frontend calls `marketplace.buyItem(listingId, { value: listing.price })`
3. Contract verifies: listing active, payment sufficient, buyer ≠ seller
4. Marketplace deactivates listing, calculates commission (2.5% default)
5. NFT transferred to buyer via `safeTransferFrom(seller, buyer, tokenId)`
6. Seller receives proceeds, buyer receives overpayment refund (if any)
7. `ItemSold` event emitted; frontend refetches listings and shows success toast

**State Management:**

- Frontend maintains no global state (Redux/Zustand)
- Component-level state via `useState` for local UI (loading, search filters, modals)
- Contract calls are promise-based; no state caching between calls
- On-chain state persisted in contract storage; frontend re-fetches on user actions

## Key Abstractions

**Contract (Solidity) Abstraction:**
- Purpose: Hide contract deployment details and ABI complexity
- Examples: `frontend/src/config/contracts.ts` defines CONTRACTS.NFT and CONTRACTS.MARKETPLACE with ABIs
- Pattern: Human-readable ABI strings + ethers.js Contract factory for runtime instantiation

**Wallet Connection Abstraction:**
- Purpose: Encapsulate MetaMask interaction logic
- Examples: `frontend/src/hooks/useWallet.ts`
- Pattern: React hook returning connection state and methods (connectWallet, disconnectWallet), auto-reconnect on mount

**Contract Instance Abstraction:**
- Purpose: Lazy-load contract instances with signer attached
- Examples: `frontend/src/hooks/useContracts.ts`
- Pattern: useMemo returns promise-based contract instances that resolve signer asynchronously

**IPFS Abstraction:**
- Purpose: Simplify multipart form data and JSON uploads to Pinata
- Examples: `frontend/src/services/ipfs.ts` exports uploadImageToIPFS, uploadMetadataToIPFS, ipfsToHttp
- Pattern: Async functions abstracting axios POST to Pinata endpoints; automatic header injection for credentials

## Entry Points

**Smart Contracts:**
- `contracts/contracts/NFTContract.sol`: Deployed as standalone, called via `approve()` and `transferFrom()` by Marketplace
- `contracts/contracts/Marketplace.sol`: Primary interaction point for listing/buying; holds commission funds

**Frontend:**
- `frontend/src/main.tsx`: React root mount to DOM at `#root`
- `frontend/src/App.tsx`: BrowserRouter wrapper, ConfigProvider (Ant Design dark theme), Routes definition
- `frontend/src/components/Layout.tsx`: Outlet wrapper with sticky header, navigation menu, footer

**Contract Deployment:**
- `contracts/scripts/deploy.js`: Hardhat script to instantiate and deploy both contracts; prints addresses to stdout

## Error Handling

**Strategy:** Try-catch blocks with fallback messaging

**Patterns:**
- Contract calls wrapped in try-catch; error.reason or error.message shown to user via `message.error()`
- IPFS uploads fail gracefully with console.error; user sees "Upload failed" toast
- MetaMask disconnection detected via `accountsChanged` listener; wallet state reset
- Missing contract addresses default to hardcoded local Hardhat addresses if env vars missing
- Insufficient payment or invalid listings rejected at contract level with require statements

## Cross-Cutting Concerns

**Logging:**
- Client-side: `console.error()` in catch blocks, `console.log()` in contract deploy scripts
- No centralized logging service; errors surfaced to user via Ant Design message toasts

**Validation:**
- Contract-level: Solidity require statements (price > 0, sender == owner, listing.active, msg.value >= price)
- Frontend-level: Form validation in MintForm (non-empty name/description, file selected); TypeScript strict mode

**Authentication:**
- MetaMask EIP-1193 provider connection; `eth_requestAccounts` prompts user
- No traditional JWT/session; wallet address is identity
- Contract functions restricted via Solidity modifiers (onlyOwner for admin, custom ownership checks for listing)

---

*Architecture analysis: 2026-02-21*
