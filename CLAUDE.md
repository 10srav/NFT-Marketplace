# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFT Marketplace MVP with Solidity smart contracts (Hardhat) and a React/TypeScript frontend (Vite). Two separate npm projects live in `contracts/` and `frontend/`.

## Build & Development Commands

### Smart Contracts (`contracts/`)
```bash
npm run node              # Start local Hardhat network (must run first for local dev)
npm run compile           # Compile Solidity contracts
npm run test              # Run all Hardhat tests
npx hardhat test test/NFTContract.test.js  # Run a single test file
npm run deploy:local      # Deploy to local Hardhat network
npm run deploy:sepolia    # Deploy to Sepolia testnet
```

### Frontend (`frontend/`)
```bash
npm run dev               # Start Vite dev server on port 3000
npm run build             # TypeScript check + Vite production build
npm run preview           # Preview production build
```

### Full Local Dev Workflow
1. `cd contracts && npm run node` (keep running)
2. `cd contracts && npm run deploy:local` (note deployed addresses)
3. Update `frontend/.env` with contract addresses
4. `cd frontend && npm run dev`

## Architecture

### Smart Contracts (Solidity 0.8.20, OpenZeppelin v5)
- **NFTContract.sol** — ERC721 + ERC721URIStorage + Ownable. `mintNFT(tokenURI)` returns tokenId, `burn(tokenId)` for owner-only burn.
- **Marketplace.sol** — ReentrancyGuard + Pausable + Ownable. Handles listing/buying/unlisting with 2.5% commission (250 basis points, max 10%). Manages an `_activeListingIds` array for enumeration.

### Frontend (React 19, TypeScript, Vite 6)
- **UI**: Ant Design v5 (dark theme) + Tailwind CSS v4. Glassmorphic dark design with `#667eea`/`#764ba2` gradient accents.
- **Web3**: ethers.js v6 via two custom hooks:
  - `useWallet` — MetaMask connection, account/chain listeners, auto-reconnect
  - `useContracts` — Returns promise-based signer-attached contract instances
- **IPFS**: Pinata integration in `services/ipfs.ts` for image and metadata uploads
- **Routing**: React Router v7. Pages: Home, Marketplace, Create, Dashboard, NFTDetail (`/nft/:id`)
- **State**: Local `useState`/`useEffect` only — no global state library

### Contract Integration Pattern
ABIs are stored as human-readable strings in `config/contracts.ts` with default local Hardhat addresses. The `useContracts` hook returns async getters that attach a signer from the wallet provider. All contract calls follow: `const tx = await contract.method(args); await tx.wait();`

### Data Flow
- **Minting**: Upload image to IPFS → upload metadata JSON to IPFS → call `mintNFT(ipfs://metadataCID)`
- **Listing**: `nftContract.approve(marketplace, tokenId)` → `marketplace.listItem(nftAddr, tokenId, price)`
- **Buying**: `marketplace.buyItem(listingId, { value: price })` — contract handles commission split, NFT transfer, and overpayment refund

### Path Aliases
TypeScript and Vite both resolve `@/*` to `frontend/src/*`.

## Environment Variables

### `contracts/.env`
- `SEPOLIA_RPC_URL` — Alchemy Sepolia endpoint
- `DEPLOYER_PRIVATE_KEY` — Wallet private key for deployment

### `frontend/.env`
- `VITE_NFT_CONTRACT_ADDRESS`, `VITE_MARKETPLACE_ADDRESS` — Deployed contract addresses
- `VITE_PINATA_API_KEY`, `VITE_PINATA_SECRET_KEY`, `VITE_PINATA_GATEWAY` — Pinata IPFS credentials

## Key Conventions
- Solidity uses OpenZeppelin v5 patterns (inheriting Ownable with `msg.sender` in constructor)
- Frontend components use Ant Design's `message` API for user feedback (success/error toasts)
- Contract addresses have hardcoded local defaults as fallback when env vars are missing
- No linter scripts configured; ESLint config exists in frontend but no `lint` script in package.json
