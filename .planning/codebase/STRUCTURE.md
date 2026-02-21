# Codebase Structure

**Analysis Date:** 2026-02-21

## Directory Layout

```
NFT-MARKETPLACE/
├── contracts/                  # Hardhat Solidity project
│   ├── contracts/              # Source Solidity files
│   │   ├── NFTContract.sol     # ERC721 NFT contract
│   │   └── Marketplace.sol     # Marketplace contract
│   ├── scripts/                # Deployment and utility scripts
│   │   └── deploy.js           # Deploy script
│   ├── test/                   # Hardhat test files
│   │   ├── NFTContract.test.js
│   │   └── Marketplace.test.js
│   ├── artifacts/              # Generated ABI/bytecode (git-ignored)
│   ├── cache/                  # Hardhat cache (git-ignored)
│   ├── hardhat.config.js       # Hardhat configuration
│   ├── package.json            # Contract dependencies
│   └── .env                    # Environment (SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY)
├── frontend/                   # Vite + React + TypeScript project
│   ├── src/
│   │   ├── pages/              # Route-level page components
│   │   │   ├── Home.tsx
│   │   │   ├── Marketplace.tsx
│   │   │   ├── Create.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── NFTDetail.tsx
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Layout.tsx      # App layout wrapper
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── NFTCard.tsx
│   │   │   ├── MintForm.tsx
│   │   │   ├── ListingModal.tsx
│   │   │   └── TransactionHistory.tsx
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useWallet.ts    # MetaMask connection
│   │   │   └── useContracts.ts # Contract instance creation
│   │   ├── services/           # Business logic services
│   │   │   └── ipfs.ts         # Pinata IPFS integration
│   │   ├── config/             # Configuration constants
│   │   │   └── contracts.ts    # Contract ABIs and addresses
│   │   ├── assets/             # Static assets
│   │   ├── App.tsx             # App root with routing
│   │   ├── main.tsx            # React DOM mount
│   │   ├── index.css           # Global styles
│   │   └── vite-env.d.ts       # Vite type definitions
│   ├── public/                 # Static public files
│   ├── dist/                   # Built output (git-ignored)
│   ├── vite.config.ts          # Vite configuration
│   ├── tsconfig.json           # TypeScript configuration
│   ├── package.json            # Frontend dependencies
│   └── .env                    # Environment (VITE_* variables)
├── .planning/
│   └── codebase/               # This analysis directory
├── CLAUDE.md                   # Project overview for Claude
├── .gitignore
└── .git/
```

## Directory Purposes

**contracts/**
- Purpose: Smart contract source code and deployment tooling
- Contains: Solidity contracts, Hardhat config, test suite, deployment scripts
- Key files: `contracts/contracts/NFTContract.sol`, `contracts/contracts/Marketplace.sol`, `contracts/hardhat.config.js`
- Deployable independently; requires Node.js and npm

**frontend/**
- Purpose: React web application for interacting with contracts
- Contains: React components, pages, hooks, services, configuration
- Key files: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/vite.config.ts`
- Deployable independently; requires contract addresses in env

**contracts/contracts/**
- Purpose: Solidity contract implementations
- Contains: NFTContract.sol (ERC721 with URIStorage), Marketplace.sol (listing/trading logic)
- Key files: `contracts/contracts/NFTContract.sol`, `contracts/contracts/Marketplace.sol`

**contracts/scripts/**
- Purpose: Deployment and helper scripts
- Contains: deploy.js for contract instantiation and network deployment
- Key files: `contracts/scripts/deploy.js`

**contracts/test/**
- Purpose: Hardhat test suite for contract validation
- Contains: NFTContract.test.js, Marketplace.test.js
- Key files: `contracts/test/NFTContract.test.js`, `contracts/test/Marketplace.test.js`

**frontend/src/pages/**
- Purpose: Route-level page components; each file corresponds to a React Router route
- Contains: Five page components handling page-specific logic and component composition
- Key files: `frontend/src/pages/Home.tsx`, `frontend/src/pages/Marketplace.tsx`, `frontend/src/pages/Create.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/NFTDetail.tsx`

**frontend/src/components/**
- Purpose: Reusable UI components used across pages
- Contains: Presentational and container components
- Key files: `frontend/src/components/Layout.tsx` (app wrapper), `frontend/src/components/WalletConnect.tsx` (wallet button), `frontend/src/components/NFTCard.tsx` (NFT display card)

**frontend/src/hooks/**
- Purpose: Custom React hooks for Web3 functionality and contract interaction
- Contains: Two hooks: useWallet (MetaMask integration), useContracts (contract instance creation)
- Key files: `frontend/src/hooks/useWallet.ts`, `frontend/src/hooks/useContracts.ts`

**frontend/src/services/**
- Purpose: Service layer for external API integration
- Contains: IPFS upload and metadata management functions
- Key files: `frontend/src/services/ipfs.ts` (Pinata API wrapper)

**frontend/src/config/**
- Purpose: Configuration constants and ABI definitions
- Contains: Contract ABIs, addresses, network config, Pinata settings
- Key files: `frontend/src/config/contracts.ts`

## Key File Locations

**Entry Points:**
- `frontend/src/main.tsx`: React root mount point; renders App inside StrictMode
- `frontend/src/App.tsx`: ConfigProvider setup, BrowserRouter, Routes definition, Ant Design dark theme configuration
- `contracts/scripts/deploy.js`: Hardhat script entry point for contract deployment

**Configuration:**
- `frontend/src/config/contracts.ts`: Contract ABIs, addresses (fallback to Hardhat local), PINATA_CONFIG
- `contracts/hardhat.config.js`: Solidity version, network configs (hardhat, sepolia), optimizer settings
- `frontend/vite.config.ts`: Vite dev server (port 3000), @ path alias, build output
- `frontend/tsconfig.json`: TypeScript strict mode, @ path alias mapping

**Core Logic:**
- `contracts/contracts/NFTContract.sol`: `mintNFT(tokenURI)` returns tokenId, `burn(tokenId)` owner-only
- `contracts/contracts/Marketplace.sol`: `listItem()`, `buyItem()`, `unlistItem()`, commission calculation and withdrawal
- `frontend/src/hooks/useWallet.ts`: MetaMask connection, auto-reconnect, account/chain listeners
- `frontend/src/hooks/useContracts.ts`: Promise-based signer-attached contract instances
- `frontend/src/services/ipfs.ts`: `uploadImageToIPFS()`, `uploadMetadataToIPFS()`, `ipfsToHttp()`

**Testing:**
- `contracts/test/NFTContract.test.js`: Unit tests for NFT minting, burning, URI storage
- `contracts/test/Marketplace.test.js`: Integration tests for listing, buying, commission logic

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `Layout.tsx`, `NFTCard.tsx`)
- Non-component modules: camelCase (e.g., `useWallet.ts`, `contracts.ts`, `ipfs.ts`)
- Solidity contracts: PascalCase matching contract name (e.g., `NFTContract.sol`, `Marketplace.sol`)
- Test files: `*.test.js` suffix (e.g., `NFTContract.test.js`)

**Directories:**
- React feature directories: lowercase plural (e.g., `components/`, `pages/`, `hooks/`, `services/`)
- Solidity directories: lowercase (e.g., `contracts/`, `scripts/`, `test/`)

**TypeScript:**
- Component exports: Default export as named function matching filename (e.g., `export default function Layout() {...}`)
- Interfaces: PascalCase, prefixed context (e.g., `WalletState`, `NFTListing`)
- Functions: camelCase (e.g., `useWallet()`, `fetchListings()`, `handleBuy()`)
- Constants: UPPER_SNAKE_CASE for module-level constants (e.g., `PINATA_API`, `COMMISSION_DENOMINATOR`)

**Solidity:**
- Functions: camelCase, public/external undecorated, internal prefixed `_` (e.g., `mintNFT()`, `_removeActiveListing()`)
- State variables: camelCase, private prefixed `_` (e.g., `_nextTokenId`, `_activeListingIds`)
- Constants: UPPER_SNAKE_CASE (e.g., `COMMISSION_DENOMINATOR`)
- Structs: PascalCase (e.g., `Listing`)
- Events: PascalCase, past tense (e.g., `NFTMinted`, `ItemSold`)

## Where to Add New Code

**New Feature (e.g., Auction System):**
- Smart contract logic: `contracts/contracts/` — new file (e.g., `Auction.sol`) with deploy entry in `deploy.js`
- Frontend pages: `frontend/src/pages/Auction.tsx` for route-level container
- Frontend components: `frontend/src/components/AuctionForm.tsx`, `frontend/src/components/AuctionCard.tsx` as needed
- Tests: `contracts/test/Auction.test.js`
- Configuration: Update `frontend/src/config/contracts.ts` with new contract ABI and address

**New Component/Module (e.g., NFT Filter Component):**
- Presentational: `frontend/src/components/NFTFilter.tsx` if reusable across pages
- Hook (if stateful logic): `frontend/src/hooks/useNFTFilter.ts` for filtering state and methods
- Styling: Inline Ant Design theming or co-located CSS modules

**Utilities and Helpers:**
- Service layer: `frontend/src/services/` for external API wrappers (e.g., new `analytics.ts` for event tracking)
- Hook layer: `frontend/src/hooks/` for stateful logic abstractions (e.g., new `useLocalStorage.ts`)
- Config: `frontend/src/config/` for static constants (e.g., new `constants.ts` for API endpoints)
- Solidity: Library contracts in `contracts/contracts/lib/` for reusable logic (e.g., `PriceFeed.sol`)

## Special Directories

**contracts/artifacts/**
- Purpose: Generated ABI and bytecode by Hardhat compiler
- Generated: Yes (via `npm run compile`)
- Committed: No (git-ignored)
- Usage: Referenced by hardhat CLI; frontend does not use

**frontend/dist/**
- Purpose: Built production output from Vite
- Generated: Yes (via `npm run build`)
- Committed: No (git-ignored)
- Usage: Deployed to web hosting; contains optimized JS/CSS bundles

**contracts/cache/**
- Purpose: Hardhat compilation cache for faster rebuilds
- Generated: Yes (automatically by Hardhat)
- Committed: No (git-ignored)
- Usage: Internal optimization; can be safely deleted to clear cache

**frontend/.env & contracts/.env**
- Purpose: Environment variables (private keys, API keys, contract addresses)
- Generated: No (user-created)
- Committed: No (git-ignored)
- Usage: Loaded at runtime; examples in CLAUDE.md

---

*Structure analysis: 2026-02-21*
