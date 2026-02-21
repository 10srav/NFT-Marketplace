# Requirements: NFT Marketplace

**Defined:** 2026-02-21
**Core Value:** Users can create, discover, and trade NFTs through a smooth, real-time marketplace experience

## v1 Requirements

### Smart Contracts — Royalties

- [ ] **ROYL-01**: Creator can set royalty percentage (up to 10%) when minting an NFT
- [ ] **ROYL-02**: Marketplace automatically pays royalty to creator on every secondary sale
- [ ] **ROYL-03**: Royalty info follows ERC-2981 standard and is readable by any marketplace
- [ ] **ROYL-04**: Combined royalty + commission never exceeds a safe cap

### Smart Contracts — English Auctions

- [ ] **EAUC-01**: Seller can create a timed English auction with minimum bid and duration
- [ ] **EAUC-02**: Buyers can place bids that must exceed current highest bid
- [ ] **EAUC-03**: Previous bidders are automatically refunded when outbid (pull-over-push pattern)
- [ ] **EAUC-04**: Anti-sniping: bids in last 10 minutes extend the auction timer
- [ ] **EAUC-05**: Anyone can settle an expired auction, transferring NFT to winner and ETH to seller
- [ ] **EAUC-06**: Seller can cancel auction if no bids have been placed
- [ ] **EAUC-07**: Marketplace commission deducted from auction settlement

### Smart Contracts — Dutch Auctions

- [ ] **DAUC-01**: Seller can create a Dutch auction with start price, end price, and duration
- [ ] **DAUC-02**: Price decreases linearly over time (computed via view function, no storage writes)
- [ ] **DAUC-03**: First buyer to pay current price wins the NFT immediately
- [ ] **DAUC-04**: Seller can cancel an unsold Dutch auction
- [ ] **DAUC-05**: Marketplace commission deducted from Dutch auction sale

### Smart Contracts — Creator Collections

- [ ] **COLL-01**: User can create a named collection with description and image
- [ ] **COLL-02**: Collection deploys a new ERC721 contract via factory (EIP-1167 minimal proxy)
- [ ] **COLL-03**: Creator can mint NFTs into their collection
- [ ] **COLL-04**: Collection NFTs are tradeable on the marketplace like standalone NFTs
- [ ] **COLL-05**: Users can browse all NFTs within a collection

### Smart Contracts — Offers

- [ ] **OFFR-01**: Buyer can make an ETH offer on any NFT (escrowed in contract)
- [ ] **OFFR-02**: Seller can accept an offer, triggering NFT transfer and ETH release
- [ ] **OFFR-03**: Seller can reject an offer, refunding the buyer
- [ ] **OFFR-04**: Buyer can cancel their own pending offer and get refunded
- [ ] **OFFR-05**: Offer expires after a seller-configurable or default timeout

### User Profiles

- [ ] **PROF-01**: User can set a username, avatar, and bio linked to their wallet address
- [ ] **PROF-02**: User profile page shows owned NFTs, created collections, and activity stats
- [ ] **PROF-03**: User can view any other user's profile by wallet address
- [ ] **PROF-04**: Profile data persists in backend database (authenticated via SIWE)

### Favorites & Watchlist

- [ ] **FAVS-01**: User can favorite/unfavorite any NFT
- [ ] **FAVS-02**: User can view their favorites list on dashboard
- [ ] **FAVS-03**: NFT cards show favorite count
- [ ] **FAVS-04**: Favorites persist across sessions (backend storage)

### Subgraph Indexing

- [ ] **INDX-01**: Subgraph indexes all marketplace events (listings, sales, auctions, bids, offers)
- [ ] **INDX-02**: Subgraph indexes NFT minting and transfer events
- [ ] **INDX-03**: Subgraph indexes collection creation events
- [ ] **INDX-04**: Frontend reads marketplace data from subgraph instead of direct RPC calls
- [ ] **INDX-05**: Subgraph deployed to Subgraph Studio (free Sepolia hosting)

### Backend API

- [ ] **BACK-01**: Fastify API with PostgreSQL database for off-chain data
- [ ] **BACK-02**: SIWE (Sign-In with Ethereum) wallet authentication issuing JWTs
- [ ] **BACK-03**: REST endpoints for user profiles (CRUD)
- [ ] **BACK-04**: REST endpoints for favorites (add/remove/list)
- [ ] **BACK-05**: Metadata caching endpoint to reduce IPFS gateway load
- [ ] **BACK-06**: Full-text search endpoint across NFTs and collections

### Real-Time Updates

- [ ] **RT-01**: WebSocket server pushes new listing/sale/bid events to connected clients
- [ ] **RT-02**: Frontend updates marketplace grid in real-time without page reload
- [ ] **RT-03**: Transaction progress feedback (submitted → confirming → confirmed with link)
- [ ] **RT-04**: Auction countdown timer updates live on NFT detail page

### Search & Discovery

- [ ] **DISC-01**: Full-text search across NFT names, descriptions, and collection names
- [ ] **DISC-02**: Filter by: price range, collection, sale type (fixed/auction), status
- [ ] **DISC-03**: Sort by: recently listed, price, ending soon (auctions), most favorited
- [ ] **DISC-04**: Trending/featured section on homepage based on recent activity

### UX Polish

- [ ] **UX-01**: Skeleton loaders on all data-fetching pages
- [ ] **UX-02**: Transaction progress modal with step indicators
- [ ] **UX-03**: Optimistic UI updates after successful transactions
- [ ] **UX-04**: Smooth page transitions and card hover animations
- [ ] **UX-05**: Error states with retry actions (not just error messages)
- [ ] **UX-06**: Mobile-responsive layouts for all new pages

### Deployment & Portfolio

- [ ] **DEPL-01**: Frontend deployed to Vercel with custom domain or subdomain
- [ ] **DEPL-02**: Backend deployed to Railway with PostgreSQL
- [ ] **DEPL-03**: Subgraph deployed to Subgraph Studio
- [ ] **DEPL-04**: All contracts deployed to Sepolia with verified source on Etherscan
- [ ] **DEPL-05**: README with project description, screenshots, architecture diagram, and setup instructions

## v2 Requirements

### Advanced Trading

- **ATRD-01**: Bundle sales (sell multiple NFTs as a package)
- **ATRD-02**: Floor price tracking per collection
- **ATRD-03**: Price history charts per NFT

### Social Features

- **SOCL-01**: Follow/unfollow other users
- **SOCL-02**: Activity feed of followed users' actions
- **SOCL-03**: In-app notifications for offers, outbids, sales

### Advanced Collections

- **ACOL-01**: Collection floor price and volume stats
- **ACOL-02**: Trait-based rarity scores for collection NFTs
- **ACOL-03**: Collection verification/badge system

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ethereum mainnet / L2 deployment | Sepolia testnet only — no real funds risk |
| Mobile native app | Web-first, responsive design covers mobile |
| Multi-chain support | Single chain keeps architecture simple |
| Video/audio NFTs | Storage/bandwidth disproportionate to value |
| Lazy minting | Gasless minting adds complexity without Sepolia benefit (gas is free) |
| ERC-1155 multi-edition | ERC-721 is sufficient for marketplace scope |
| DAO governance | Over-engineered for portfolio project |
| Cross-marketplace aggregation | Requires external API integrations beyond scope |
| In-app chat | High complexity, not core to marketplace value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROYL-01 | Phase 1 | Pending |
| ROYL-02 | Phase 1 | Pending |
| ROYL-03 | Phase 1 | Pending |
| ROYL-04 | Phase 1 | Pending |
| EAUC-01 | Phase 1 | Pending |
| EAUC-02 | Phase 1 | Pending |
| EAUC-03 | Phase 1 | Pending |
| EAUC-04 | Phase 1 | Pending |
| EAUC-05 | Phase 1 | Pending |
| EAUC-06 | Phase 1 | Pending |
| EAUC-07 | Phase 1 | Pending |
| DAUC-01 | Phase 1 | Pending |
| DAUC-02 | Phase 1 | Pending |
| DAUC-03 | Phase 1 | Pending |
| DAUC-04 | Phase 1 | Pending |
| DAUC-05 | Phase 1 | Pending |
| COLL-01 | Phase 1 | Pending |
| COLL-02 | Phase 1 | Pending |
| COLL-03 | Phase 1 | Pending |
| COLL-04 | Phase 1 | Pending |
| COLL-05 | Phase 1 | Pending |
| OFFR-01 | Phase 1 | Pending |
| OFFR-02 | Phase 1 | Pending |
| OFFR-03 | Phase 1 | Pending |
| OFFR-04 | Phase 1 | Pending |
| OFFR-05 | Phase 1 | Pending |
| INDX-01 | Phase 2 | Pending |
| INDX-02 | Phase 2 | Pending |
| INDX-03 | Phase 2 | Pending |
| INDX-04 | Phase 2 | Pending |
| INDX-05 | Phase 2 | Pending |
| BACK-01 | Phase 3 | Pending |
| BACK-02 | Phase 3 | Pending |
| BACK-03 | Phase 3 | Pending |
| BACK-04 | Phase 3 | Pending |
| BACK-05 | Phase 3 | Pending |
| BACK-06 | Phase 3 | Pending |
| PROF-01 | Phase 3 | Pending |
| PROF-02 | Phase 3 | Pending |
| PROF-03 | Phase 3 | Pending |
| PROF-04 | Phase 3 | Pending |
| FAVS-01 | Phase 3 | Pending |
| FAVS-02 | Phase 3 | Pending |
| FAVS-03 | Phase 3 | Pending |
| FAVS-04 | Phase 3 | Pending |
| RT-01 | Phase 4 | Pending |
| RT-02 | Phase 4 | Pending |
| RT-03 | Phase 4 | Pending |
| RT-04 | Phase 4 | Pending |
| DISC-01 | Phase 5 | Pending |
| DISC-02 | Phase 5 | Pending |
| DISC-03 | Phase 5 | Pending |
| DISC-04 | Phase 5 | Pending |
| UX-01 | Phase 5 | Pending |
| UX-02 | Phase 5 | Pending |
| UX-03 | Phase 5 | Pending |
| UX-04 | Phase 5 | Pending |
| UX-05 | Phase 5 | Pending |
| UX-06 | Phase 5 | Pending |
| DEPL-01 | Phase 5 | Pending |
| DEPL-02 | Phase 5 | Pending |
| DEPL-03 | Phase 5 | Pending |
| DEPL-04 | Phase 5 | Pending |
| DEPL-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 64 total
- Mapped to phases: 64
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
