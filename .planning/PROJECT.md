# NFT Marketplace

## What This Is

A full-featured NFT marketplace on Ethereum Sepolia where users can mint, list, buy, auction, and collect NFTs. Currently a working MVP with fixed-price trading — evolving into a portfolio-ready, deployed application with user profiles, collections, auctions, offers, and a polished discovery experience backed by both on-chain data and an off-chain indexing/API layer.

## Core Value

Users can create, discover, and trade NFTs through a smooth, real-time marketplace experience that showcases the full Web3 development stack.

## Requirements

### Validated

- ✓ ERC721 minting with IPFS metadata storage (Pinata) — existing
- ✓ Fixed-price marketplace listings (list/buy/unlist) with 2.5% commission — existing
- ✓ MetaMask wallet connection with auto-reconnect and chain detection — existing
- ✓ Marketplace browsing with search and sort — existing
- ✓ NFT detail view with owner actions (list/unlist/buy) — existing
- ✓ Dashboard showing owned NFTs — existing
- ✓ Dark glassmorphic UI with Ant Design + Tailwind — existing
- ✓ Hardhat test suite for contracts (mint, burn, list, buy, unlist, commission, pause) — existing
- ✓ Local Hardhat and Sepolia deployment scripts — existing

### Active

- [ ] User profiles — username, avatar, bio, owned NFTs gallery, transaction history, stats
- [ ] Creator collections — named collections that creators mint NFTs into
- [ ] English auctions — ascending bids, highest bidder wins when timer expires
- [ ] Dutch auctions — descending price over time, first buyer wins
- [ ] Offer/negotiation system — buyers make offers below listing price, sellers accept/reject
- [ ] Creator royalties — percentage earned on secondary sales (ERC-2981 recommended)
- [ ] Favorites/watchlist — users save NFTs and get notified of price changes
- [ ] Subgraph indexer — index blockchain events for fast queries (The Graph or similar)
- [ ] Backend API — Node.js service for caching, search, user profiles, off-chain data
- [ ] Real-time updates — live notifications and instant listing updates via blockchain events
- [ ] Search & discovery — full-text search, filters, trending/featured NFTs
- [ ] Smooth UX — skeleton loaders, tx progress modals, optimistic updates, animations
- [ ] Production deployment — deployed to a public URL on Sepolia, accessible to anyone
- [ ] Portfolio presentation — README with screenshots, clean code, documentation

### Out of Scope

- Ethereum mainnet or L2 deployment — Sepolia testnet only, no real money
- Mobile app — web-first, responsive design covers mobile browsers
- Real-time chat between users — high complexity, not core to marketplace value
- Video NFTs — storage/bandwidth costs disproportionate to learning value
- Multi-chain support — single chain keeps architecture simple for portfolio scope

## Context

- Brownfield project: working MVP already exists with 2 Solidity contracts, React frontend, and Pinata IPFS integration
- Smart contracts use OpenZeppelin v5 (ERC721, ReentrancyGuard, Pausable, Ownable)
- Frontend is React 19 + TypeScript + Vite 6 + Ant Design 5 + Tailwind 4
- Web3 via ethers.js v6 with custom hooks (useWallet, useContracts)
- Contract ABIs stored as human-readable strings in frontend config
- Currently no backend or indexer — all reads go directly to chain (slow for complex queries)
- Codebase map available at `.planning/codebase/` with 7 architecture documents

## Constraints

- **Network**: Sepolia testnet only — no mainnet deployment or real funds
- **Storage**: IPFS via Pinata for all NFT media and metadata
- **Wallet**: MetaMask only (no WalletConnect or other wallet providers)
- **Solidity**: 0.8.20 with OpenZeppelin v5 — maintain compatibility
- **Frontend**: React 19 + Vite 6 + Ant Design 5 stack — no framework changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ERC-2981 for royalties | Industry standard, automatically readable by any marketplace | — Pending |
| Add backend API + subgraph | Need fast queries for search/discovery + off-chain profile data | — Pending |
| Both English and Dutch auctions | Demonstrates range of smart contract patterns for portfolio | — Pending |
| Creator collections over tag categories | More meaningful ownership model, closer to real marketplace UX | — Pending |
| Keep Sepolia testnet | No real money risk, free to experiment, simpler security model | — Pending |

---
*Last updated: 2026-02-21 after initialization*
