# Roadmap: NFT Marketplace

## Overview

This roadmap extends a working ERC721 fixed-price marketplace MVP into a full-featured NFT platform. The work is ordered by strict dependency: stable smart contract ABIs must exist before indexing begins, the subgraph must be queryable before the backend REST layer is built, the backend and database must exist before WebSocket push can be layered on, and the frontend is wired to all upstream layers last — once each is stable. Five phases deliver the complete feature set without any throwaway work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Contract Foundation** - Deploy all new Solidity contracts (royalties, auctions, collections, offers) with full test coverage
- [ ] **Phase 2: Subgraph Indexing** - Index all contract events into a queryable GraphQL entity store via The Graph
- [ ] **Phase 3: Backend API** - Fastify + PostgreSQL service for profiles, favorites, metadata cache, and full-text search
- [ ] **Phase 4: Real-Time Updates** - WebSocket push server for live auction bids, listing changes, and transaction progress
- [ ] **Phase 5: Frontend Integration + Polish + Deployment** - Wire frontend to all upstream layers; build auction, collection, offer, and profile UIs; deploy to production

## Phase Details

### Phase 1: Contract Foundation
**Goal**: The full on-chain feature set is deployed to Sepolia with stable ABIs — royalties paid on every settlement path, both auction types working, creator collections deployable via factory, and offers escrowed in contract
**Depends on**: Nothing (brownfield — extends existing NFTContract.sol and Marketplace.sol)
**Requirements**: ROYL-01, ROYL-02, ROYL-03, ROYL-04, EAUC-01, EAUC-02, EAUC-03, EAUC-04, EAUC-05, EAUC-06, EAUC-07, DAUC-01, DAUC-02, DAUC-03, DAUC-04, DAUC-05, COLL-01, COLL-02, COLL-03, COLL-04, COLL-05, OFFR-01, OFFR-02, OFFR-03, OFFR-04, OFFR-05
**Success Criteria** (what must be TRUE):
  1. Seller can create an English auction, buyers can place bids and get refunded when outbid, and a winner receives the NFT on settlement with royalty and commission deducted from the proceeds
  2. Seller can create a Dutch auction with a start and end price; the current price decreases over time and the first buyer to pay wins immediately, with royalty and commission paid
  3. User can deploy a named collection via the factory, mint NFTs into it, and those NFTs appear on the marketplace and are purchasable like standalone NFTs
  4. Buyer can make an ETH offer on any NFT (escrowed), seller can accept or reject it, buyer can cancel a pending offer — and accepting an offer cancels any active fixed-price listing for that NFT
  5. Royalty is paid to the original creator on every secondary sale path (fixed-price buy, English auction settlement, Dutch auction sale, offer acceptance), and the combined royalty + commission never overflows safe limits
**Plans**: TBD

Plans:
- [ ] 01-01: NFTContract.sol — add ERC-2981 royalties (ERC721Royalty), redeploy, update deployments/sepolia.json and contracts.ts
- [ ] 01-02: AuctionHouse.sol — English auction (pull-payment, anti-sniping, NFT escrow, royalty in settlement), Hardhat tests
- [ ] 01-03: AuctionHouse.sol — Dutch auction (linear price decay view function, first-buyer wins, royalty in settlement), Hardhat tests
- [ ] 01-04: CollectionFactory.sol — EIP-1167 clone factory for per-creator ERC721 collections, marketplace compatibility, Hardhat tests
- [ ] 01-05: Marketplace.sol — offer system (escrowed ETH, accept/reject/cancel/expire, unlist on accept), Hardhat tests
- [ ] 01-06: Deploy all contracts to Sepolia, verify on Etherscan, update deployments/sepolia.json, fix MVP bugs (reload-on-buy, sequential metadata fetch)

### Phase 2: Subgraph Indexing
**Goal**: All on-chain events from all four contracts are indexed into a queryable GraphQL entity store on Subgraph Studio, and the frontend reads marketplace listings from the subgraph instead of direct RPC calls
**Depends on**: Phase 1 (stable contract ABIs and deployed addresses)
**Requirements**: INDX-01, INDX-02, INDX-03, INDX-04, INDX-05
**Success Criteria** (what must be TRUE):
  1. A GraphQL query to the subgraph returns all active listings, bids, auctions, offers, and collection NFTs — matching on-chain state — without any direct RPC calls to the node
  2. NFT minting and transfer events are indexed so the subgraph can report current ownership and provenance for any token
  3. Collection creation events from the factory are indexed so all collections and their NFTs are queryable
  4. The frontend marketplace grid loads via a single subgraph GraphQL query instead of O(N) sequential RPC calls
  5. Subgraph is deployed to Subgraph Studio on the Sepolia free tier and updates within ~5 blocks of on-chain events
**Plans**: TBD

Plans:
- [ ] 02-01: Scaffold subgraph repo — schema.graphql entities (Token, Listing, Auction, Bid, Offer, Collection, Account), subgraph.yaml data sources for all four contracts
- [ ] 02-02: AssemblyScript mapping handlers for Marketplace and NFTContract events (ItemListed, ItemSold, ItemUnlisted, Transfer, Minted)
- [ ] 02-03: AssemblyScript mapping handlers for AuctionHouse events (AuctionCreated, BidPlaced, AuctionSettled, AuctionCancelled)
- [ ] 02-04: Dynamic template pattern for CollectionFactory — index per-collection ERC721 events as collections are deployed
- [ ] 02-05: Deploy subgraph to Subgraph Studio; update frontend to query subgraph for marketplace listings (replace direct RPC reads)

### Phase 3: Backend API
**Goal**: A Fastify + PostgreSQL service is running on Railway, providing authenticated user profiles, favorites storage, NFT metadata caching, and full-text search across NFTs and collections
**Depends on**: Phase 2 (subgraph GraphQL schema must be stable before backend queries it)
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, PROF-01, PROF-02, PROF-03, PROF-04, FAVS-01, FAVS-02, FAVS-03, FAVS-04
**Success Criteria** (what must be TRUE):
  1. User can sign in with their MetaMask wallet (SIWE), set a username, avatar, and bio, and their profile persists across sessions and is visible to other users by wallet address
  2. User can favorite an NFT, view their favorites list on the dashboard, and the favorite count on NFT cards reflects the real count from the database
  3. A search query returns NFT and collection results via full-text search (names and descriptions) from the backend, with no timeout from IPFS sequential fetching
  4. NFT metadata is cached by the backend so repeated page loads do not hit the IPFS gateway every time
  5. All profile write operations (create/update profile, add/remove favorite) require a valid SIWE JWT — unauthenticated requests are rejected with 401
**Plans**: TBD

Plans:
- [ ] 03-01: Backend project scaffold — Fastify 5 + TypeScript, Prisma 6 + PostgreSQL 16, Railway deployment, health check endpoint
- [ ] 03-02: SIWE authentication — EIP-4361 sign-in flow, JWT issuance via @fastify/jwt, auth middleware for protected routes
- [ ] 03-03: User profiles — Prisma schema (Profile table), REST CRUD endpoints (/api/v1/profiles), SIWE-gated writes
- [ ] 03-04: Favorites — Prisma schema (Favorite table), REST endpoints (add/remove/list), favorite count aggregation for NFT cards
- [ ] 03-05: Metadata cache — IPFS metadata fetch + in-process LRU cache, /api/v1/metadata/:cid endpoint, retry + fallback logic
- [ ] 03-06: Full-text search — PostgreSQL tsvector on cached NFT names/descriptions/collections, /api/v1/search endpoint, background indexer on ItemListed/ItemSold events

### Phase 4: Real-Time Updates
**Goal**: The frontend receives live push notifications for new listings, bids, sales, and offer events via WebSocket, auction countdown timers update live, and transaction progress is displayed step-by-step — no more page reloads
**Depends on**: Phase 3 (backend database and REST routes must exist; WebSocket runs in same Fastify process)
**Requirements**: RT-01, RT-02, RT-03, RT-04
**Success Criteria** (what must be TRUE):
  1. When a new bid is placed on an English auction, all users viewing that auction page see the new highest bid and updated countdown without refreshing
  2. When an NFT is listed or sold, the marketplace grid updates within one block confirmation without a page reload
  3. When a user submits a transaction (buy, bid, mint), a progress modal shows the sequence: submitted → confirming → confirmed, with a link to Etherscan
  4. Auction countdown timers on NFT detail pages tick down in real time and correctly extend by 10 minutes when a last-minute bid triggers anti-sniping
**Plans**: TBD

Plans:
- [ ] 04-01: WebSocket server — @fastify/websocket integrated into existing Fastify process, room subscriptions (auction:{id}, token:{tokenId}, global:listings), connection lifecycle management
- [ ] 04-02: Server-side event listeners — ethers.js JsonRpcProvider listening to all contract events; broadcast lightweight notifications after 1-block confirmation; remove window.location.reload() from frontend
- [ ] 04-03: Frontend WebSocket client — global singleton in React context, useEffect subscriptions with cleanup, optimistic UI updates on notification receipt; transaction progress modal with step indicators

### Phase 5: Frontend Integration + Polish + Deployment
**Goal**: Every new feature has a complete, polished UI wired to the correct upstream layer (subgraph, backend API, or contract directly); search and discovery are fully functional; and the app is deployed to a public URL accessible to anyone
**Depends on**: Phase 4 (all upstream layers stable and deployed)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05
**Success Criteria** (what must be TRUE):
  1. User can search NFTs and collections by name/description, filter by price range, collection, and sale type, and sort by recently listed, price, ending soon, or most favorited — all without page reload
  2. A trending/featured section on the homepage shows NFTs with recent activity, driven by subgraph data
  3. Auction pages show live countdown timers, full bid history, current highest bidder, and a working bid form — all connected to real contract state
  4. Collection pages show all NFTs in a collection, creator info from profile, and are navigable from any NFT detail page
  5. The application is deployed to a public URL (Vercel frontend, Railway backend, Subgraph Studio, Etherscan-verified contracts), accessible to anyone with MetaMask and Sepolia ETH
**Plans**: TBD

Plans:
- [ ] 05-01: Auction UI — English and Dutch auction pages (bid form, countdown timer, bid history, settlement button), wired to contract + subgraph + WebSocket
- [ ] 05-02: Collection UI — collection creation form, collection detail page (NFT gallery, creator profile), collection browsing on marketplace
- [ ] 05-03: Offer UI — offer panel on NFT detail page (make/cancel offer as buyer, accept/reject as seller), wired to contract + backend
- [ ] 05-04: Profile UI — profile setup page (SIWE sign-in, username/avatar/bio form), public profile page (owned NFTs, created collections, activity stats)
- [ ] 05-05: Search and discovery — full-text search bar (backend API), price/collection/sale-type/status filters (subgraph), trending section (homepage, subgraph), sort controls
- [ ] 05-06: UX polish — skeleton loaders on all data-fetching pages, error states with retry, smooth page transitions and card hover animations, mobile-responsive layouts for all new pages
- [ ] 05-07: Production deployment — Vercel (frontend), Railway (backend + PostgreSQL), Subgraph Studio (subgraph), Etherscan verification, README with screenshots and architecture diagram

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Contract Foundation | 0/6 | Not started | - |
| 2. Subgraph Indexing | 0/5 | Not started | - |
| 3. Backend API | 0/6 | Not started | - |
| 4. Real-Time Updates | 0/3 | Not started | - |
| 5. Frontend Integration + Polish + Deployment | 0/7 | Not started | - |
