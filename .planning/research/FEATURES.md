# NFT Marketplace Features Research

**Research Date:** 2026-02-21
**Scope:** Feature analysis for milestone 2 — adding auctions, profiles, collections, royalties, offers, favorites, and discovery to an existing ERC721 fixed-price MVP on Sepolia.

---

## How to Read This Document

Features are organized into three tiers:

- **Table Stakes** — things users expect from any NFT marketplace. Absence means users leave or don't trust the platform.
- **Differentiators** — things that create a competitive or portfolio advantage. Users notice and remember them.
- **Anti-features** — things that waste scope, add complexity without proportionate value, or actively harm the experience for a portfolio project on Sepolia testnet.

Each feature section covers: what it actually is, how it works technically, complexity rating (Low / Medium / High / Very High), and dependencies on other features.

---

## What the MVP Already Has

Documented here to prevent re-inventing or duplicating:

| Feature | Where | Notes |
|---|---|---|
| ERC721 minting | `NFTContract.sol`, `Create.tsx` | Open mint, IPFS metadata via Pinata |
| Fixed-price listing / buying / unlisting | `Marketplace.sol`, `Marketplace.tsx` | 2.5% commission, single contract |
| MetaMask wallet connection | `useWallet.ts` | Auto-reconnect, chain detection |
| IPFS storage | `ipfs.ts` | Pinata API, image + metadata |
| Dashboard (owned NFTs) | `Dashboard.tsx` | Loops all tokens, O(n) RPC calls |
| NFT detail view | `NFTDetail.tsx` | Owner actions, buy/list/unlist |
| Search and sort | `Marketplace.tsx` | Client-side name filter + price sort |
| Dark glassmorphic UI | All pages | Ant Design 5, Tailwind 4, custom theme |

Known gaps in the MVP that must be fixed regardless of new features: dashboard stats hardcoded to zero, `window.location.reload()` after buy/unlist destroys wallet state, sequential metadata fetches in marketplace loop.

---

## Table Stakes

These are the features a user expects before they trust the platform enough to transact. Missing any of them makes the experience feel unfinished.

---

### 1. User Profiles

**What it is:** A public page showing a wallet address with an optional username, avatar, bio, owned NFTs, and transaction stats. Anyone can view a profile; the owner can edit their own.

**How it actually works:**

The wallet address is the identity. The challenge is that wallet addresses are not usernames — `0x1234...5678` is not memorable. Profile data (username, avatar, bio) is inherently off-chain because storing strings on-chain is expensive and mutable user data does not belong in immutable contract storage.

Standard pattern: store profile data in a backend database keyed by wallet address. On first load, check if a profile exists; if not, show default (truncated address, generic avatar via Ethereum blockie or similar). Allow the owner to submit a signed message (EIP-191 or EIP-712) to prove wallet ownership without a transaction, then save to the database.

For a portfolio project without a backend yet, a minimal version stores profile metadata in browser localStorage keyed to wallet address — sufficient for demo purposes but not multi-device or public. When the backend API is added (which is already planned), profiles move to the database.

Stats (NFTs owned, NFTs sold, total volume) require either an indexer or iterating contract events. The subgraph (planned) is the right answer for this; without it, volume stats stay zero as they do in the current MVP.

**Complexity:** Medium (frontend + backend + optional indexer for stats).

**Dependencies:** Backend API (for persistence), subgraph (for accurate stats). Can partially work with localStorage first.

**What makes it feel real:** Showing recent activity (last 5 sales, last 5 purchases) on the profile. Without this it is just a portfolio grid.

---

### 2. Creator Collections

**What it is:** A named group of NFTs that a creator mints together and presents as a coherent unit. Users browse collections as a whole, not just individual tokens.

**How it actually works:**

There are two implementation models:

**Model A: One contract per collection.** This is what OpenSea and Zora do. Each collection deploys its own ERC721 contract. The marketplace contract accepts any ERC721 contract address (the existing `Marketplace.sol` already does — it takes `nftContract` as a parameter). A `CollectionFactory` contract deploys new ERC721 instances on demand. Each deployed contract is the collection.

**Model B: Single contract with collection IDs.** The NFT contract stores a `collectionId` per token in a mapping. A collection is just a filtered view. This is simpler to implement but less idiomatic.

For this project, Model A (factory pattern) is architecturally cleaner and more impressive in a portfolio. The factory deploys minimal ERC721 contracts that implement ERC-2981 (royalties). The marketplace already handles any ERC721 contract.

On the frontend, a Collections page lists all deployed collections, each linking to a filtered view of their NFTs. The collection page shows the creator, description, floor price, total volume, and item grid.

Collection metadata (name, description, banner image, cover image) is stored off-chain. IPFS is fine for this since it is immutable once set; or the backend API stores it.

**Complexity:** High (new factory contract, new contract ABI, new frontend pages, metadata storage decision).

**Dependencies:** Backend API or IPFS for collection metadata. ERC-2981 royalties (should be baked into collection contracts). Subgraph helps for floor price and volume.

---

### 3. ERC-2981 Royalties

**What it is:** When an NFT is resold on the secondary market, the original creator automatically receives a percentage of the sale price. This is the on-chain royalty standard.

**How it actually works:**

ERC-2981 adds two functions to the NFT contract:
- `royaltyInfo(tokenId, salePrice)` returns `(receiver, royaltyAmount)` — the address to pay and how much.
- `supportsInterface(0x2a55205a)` returns true.

The marketplace contract calls `royaltyInfo` before distributing sale proceeds. It deducts the royalty amount from the seller's proceeds and transfers it to the royalty receiver.

OpenZeppelin provides `ERC2981.sol` which implements this. Adding it to the NFT contract is a one-line inheritance change plus setting the royalty rate on mint or per-collection.

In the marketplace, the `buyItem` function payment distribution becomes:
1. Calculate marketplace commission (2.5%).
2. Call `IERC2981(nftContract).supportsInterface(0x2a55205a)` to check support.
3. If supported, call `royaltyInfo(tokenId, price)` to get `(royaltyReceiver, royaltyAmount)`.
4. Distribute: `royaltyAmount` to creator, `commission` to marketplace, remainder to seller.

Edge cases: royaltyAmount + commission must not exceed 100%. Cap the combined total at 90% to protect sellers. The ERC-2981 standard allows royalties up to 100% (it is the marketplace's responsibility to enforce a sane limit).

**Complexity:** Medium (contract changes + royalty distribution logic in marketplace + UI to display royalty info).

**Dependencies:** NFT contract must implement ERC-2981. The marketplace buy function must be updated. Royalties make most sense when creator collections are deployed via the factory (each collection can set its own royalty rate).

**Why this is table stakes:** Any serious NFT portfolio project that skips royalties looks like it was built without understanding the space. It is a 20-line contract change with major conceptual weight.

---

### 4. NFT Detail Page Enhancements

**What it is:** The existing NFT detail page shows name, image, description, owner, and buy/list buttons. Table stakes additions: price history, attributes/traits display, provenance (transfer history), and a "make an offer" entry point.

**How it works:**

Attributes come from the NFT metadata JSON (already stored on IPFS). The `attributes` array in the existing `uploadMetadataToIPFS` function already accepts trait data — it just is not rendered on the detail page yet. Rendering it is a UI-only change.

Price and transfer history require event indexing. The `ItemSold` event in `Marketplace.sol` has `listingId, buyer, price, commission`. The `Transfer` event from ERC721 has `from, to, tokenId`. Without an indexer, the frontend must query these events from the chain using `queryFilter` — slow but doable for a demo. With the subgraph, it becomes a fast GraphQL query.

**Complexity:** Low for attributes (UI only), Medium for history (event querying or subgraph).

**Dependencies:** Subgraph for efficient history. Offer system for the offer button.

---

### 5. Real-Time Updates

**What it is:** When someone lists, sells, or unlist an NFT, other users' browsers update without a manual page refresh. Transaction confirmations show progress (submitted → mining → confirmed).

**How it works:**

ethers.js supports `contract.on('EventName', callback)` which subscribes to new contract events via WebSocket (or polling if only HTTP RPC is available). The existing MVP uses Alchemy for its RPC endpoint — Alchemy supports WebSocket connections via `wss://` URL.

For listing updates: subscribe to `ItemListed`, `ItemSold`, `ItemUnlisted` events. On each event, append to or remove from the local listings state without a full refetch.

For transaction feedback: after calling `marketplace.buyItem(...)` and getting the tx object, show a "Transaction submitted" notification, then call `tx.wait()` and update to "Confirmed" when the receipt arrives. The existing code does this with `message.loading/success` from Ant Design, but it does not show the transaction hash or link to Etherscan.

The existing `window.location.reload()` pattern in `NFTDetail.tsx` (flagged in CONCERNS.md) is the antithesis of real-time UX. Fixing this bug is part of delivering real-time updates.

**Complexity:** Medium (WebSocket subscriptions + state update logic + transaction progress UI).

**Dependencies:** Alchemy WebSocket RPC. Works before subgraph is added; subgraph adds historical query speed but real-time events come from the chain directly.

---

### 6. Improved Search and Discovery

**What it is:** The current marketplace has client-side name filter and three sort options. Table stakes for a real marketplace: filter by collection, filter by price range, filter by trait/attribute, and sort by recently sold.

**How it works:**

Client-side filtering works fine when there are fewer than 200 NFTs. For a portfolio demo on Sepolia this is sufficient. The key additions:

- Price range slider (min/max ETH) — filter on already-loaded data, pure UI.
- Collection filter — requires knowing which collection contract each token belongs to. With the factory pattern, the `nftContract` address in the listing struct identifies the collection.
- Trait filter — requires metadata to be indexed or fetched. Client-side is feasible if metadata is cached; subgraph makes it fast and correct at scale.
- "Recently sold" sort — requires event history, which means subgraph or event querying.

For the portfolio project: implement price range and collection filter client-side. "Recently sold" and trait filters can be backed by the subgraph when it is ready.

**Complexity:** Low for price/collection filters (client-side). Medium for trait/sold filters (needs event data or subgraph).

**Dependencies:** Creator collections (for collection filter to mean anything). Subgraph for sort-by-recently-sold.

---

## Differentiators

These move the project from "a homework assignment" to "a portfolio piece that demonstrates understanding of the space."

---

### 7. English Auctions

**What it is:** Ascending-bid auction with a deadline. Bidders compete by placing higher bids. When the timer expires, the highest bidder wins and the NFT is transferred to them. All losing bids are refunded.

**How it actually works on-chain:**

An auction contract (or auction module within Marketplace.sol) stores:
```
struct Auction {
    uint256 auctionId;
    address nftContract;
    uint256 tokenId;
    address payable seller;
    uint256 startPrice;       // minimum first bid
    uint256 reservePrice;     // optional: below this, seller can reject
    uint256 endTime;          // Unix timestamp
    address payable highestBidder;
    uint256 highestBid;
    bool settled;
}
```

Key functions:
- `createAuction(nftContract, tokenId, startPrice, reservePrice, duration)` — seller deposits NFT into the contract via `safeTransferFrom` (the auction contract becomes custodian).
- `placeBid(auctionId)` payable — must exceed `highestBid + minBidIncrement`. Previous highest bidder is refunded in the same transaction (or stored in a pull-withdrawal mapping to avoid gas issues).
- `settleAuction(auctionId)` — callable after `endTime`. Transfers NFT to winner, pays seller, takes commission. If no bids or below reserve, returns NFT to seller.
- `cancelAuction(auctionId)` — seller can cancel if no bids yet.

Critical security consideration: **pull-over-push for bid refunds.** If you push ETH back to the previous bidder inside `placeBid`, a malicious bidder contract can reject the transfer (via reverting fallback), blocking all future bids. Use a `pendingWithdrawals` mapping and a separate `withdraw()` function.

The frontend needs:
- An auction timer component that counts down in real time.
- A bid history panel (from contract events or subgraph).
- "You are the highest bidder" state.
- "Auction ended — settle" button for winner or seller.

Extension: auto-extend auction by N minutes if a bid comes in during the last N minutes (anti-sniping). Adds one storage slot and one if-check.

**Complexity:** High (new contract module, bidding security model, refund mechanics, timer UI, settlement flow).

**Dependencies:** ERC-2981 royalties should be paid on auction settlement. Event indexing for bid history. Real-time updates (WebSocket) for live bid display.

---

### 8. Dutch Auctions

**What it is:** Descending-price auction. The price starts high and drops continuously over time. The first buyer who accepts the current price wins. No bidding competition — it is a "buy now at an ever-lower price."

**How it actually works on-chain:**

Dutch auction price calculation is done in a view function (no storage for price, it is computed):
```solidity
function currentPrice(uint256 auctionId) public view returns (uint256) {
    DutchAuction storage a = dutchAuctions[auctionId];
    if (block.timestamp >= a.endTime) return a.floorPrice;
    uint256 elapsed = block.timestamp - a.startTime;
    uint256 duration = a.endTime - a.startTime;
    uint256 priceDrop = a.startPrice - a.floorPrice;
    return a.startPrice - (priceDrop * elapsed / duration);
}
```

The buyer calls `buyDutchAuction(auctionId)` with `msg.value >= currentPrice(auctionId)`. Contract verifies, transfers NFT, pays seller (current price at moment of purchase, not msg.value — refund the excess).

Dutch auctions are simpler than English auctions because there is no bidding competition, no pending refunds, and no settlement step. The contract state machine is: `Active → Sold` or `Active → Expired`.

The UI challenge is showing a live price countdown. Since price depends on `block.timestamp`, the frontend must recompute the current price locally using the same formula, updated on a timer, rather than making an RPC call every second.

**Complexity:** Medium (simpler than English auctions; main complexity is the price curve UI and the exact price at purchase time).

**Dependencies:** Same as English auctions: royalties, real-time updates. Dutch auctions can be built independently of English auctions.

---

### 9. Offer / Negotiation System

**What it is:** A buyer can make an offer on any NFT — listed or unlisted — at a price below the listing price (or any price for unlisted NFTs). The seller can accept, reject, or counter. If the seller accepts, the NFT transfers at the offer price.

**How it actually works:**

**On-chain version:** The buyer calls `makeOffer(nftContract, tokenId)` payable with the offer amount. The ETH is held in escrow in the contract. The seller calls `acceptOffer(offerId)` and the contract atomically transfers NFT to buyer and ETH to seller. Buyer can `cancelOffer(offerId)` before acceptance to reclaim ETH.

Multiple pending offers per NFT are supported. The seller sees all offers and chooses which to accept.

This requires no approval from the NFT owner at offer time (the buyer is the one locking funds). The NFT transfer only happens when the owner calls `acceptOffer`, which triggers `safeTransferFrom` from the current owner to the buyer.

For `acceptOffer` to work without prior approval, the owner must have approved the marketplace contract (or approve in the same transaction). A common pattern: show the accept flow as a two-step transaction: (1) approve, (2) accept.

**Off-chain version (alternative):** Offer data stored in the database. Signed with EIP-712 typed data. Seller calls `acceptSignedOffer(offerSignature, ...)` on-chain, which verifies the signature and executes the trade. This is how Seaport (OpenSea's protocol) works. Significantly more complex.

For this project: the simple on-chain escrow version is appropriate. It is clear, auditable, and demonstrates the pattern without requiring a complex signing flow.

**Complexity:** High for on-chain escrow (new contract state, escrow mechanics, multi-offer management). Medium if offers are just a UI concept backed by the existing fixed-price flow.

**Dependencies:** Backend API to display "pending offers" to sellers without requiring them to poll the chain. Real-time notifications. Subgraph for indexing offer events.

---

### 10. Favorites / Watchlist

**What it is:** Users can heart/save any NFT. The watchlist page shows saved NFTs. Optional: notify when a favorited NFT's price drops or it gets listed.

**How it works:**

Favorites are off-chain by nature (storing a like count on-chain costs gas per interaction and serves no trust purpose — favorites are a social signal, not a financial commitment).

Implementation: Store `{ walletAddress: { tokenId: [nftContractAddress, tokenId, timestamp] } }` in the backend database. The wallet address proves ownership via the authenticated session (signed message or session token from the backend API).

On the frontend: a heart icon on every NFT card. Clicking toggles favorite state, sends a `POST /favorites` or `DELETE /favorites` to the backend API. The watchlist page fetches the user's favorites list and renders the NFTs.

Price change notifications require a backend job that polls listings for favorited NFTs and sends notifications (email or in-app). For a portfolio demo, in-app notifications via polling are sufficient — a real-time push is out of scope.

Without a backend: favorites can be stored in localStorage keyed by wallet address. This works for demo purposes but is not multi-device and is not public (not shown to other users).

**Complexity:** Low (UI + localStorage first). Medium when backend API is added.

**Dependencies:** Backend API for persistence and cross-device access. Notification system is a further dependency.

---

### 11. Subgraph Indexing

**What it is:** An indexed, queryable record of all on-chain events. Instead of calling `queryFilter` on the RPC for every page load (slow, rate-limited), a subgraph stores events in a PostgreSQL-like store and exposes a GraphQL API.

**How it works:**

The Graph Protocol is the standard. A subgraph is defined by:
1. A `subgraph.yaml` manifest listing which contracts and events to index.
2. `schema.graphql` defining the data entities (NFT, Listing, Auction, Transfer, User).
3. AssemblyScript mapping handlers (`src/mapping.ts`) that transform each event into entity updates.

The subgraph is deployed to The Graph's hosted service or a self-hosted Graph Node. The frontend queries it via GraphQL instead of contract calls for read-heavy operations.

What the subgraph indexes for this project:
- `NFTMinted` → creates NFT entity with owner, tokenURI, timestamp.
- `ItemListed` → creates Listing entity.
- `ItemSold` → updates Listing, creates Sale entity, updates User volume stats.
- `ItemUnlisted` → marks Listing inactive.
- `BidPlaced` (auction) → creates Bid entity.
- `AuctionSettled` → updates Auction, creates Sale entity.
- `Transfer` (ERC721) → updates NFT owner.
- `RoyaltyPaid` → tracks royalty payments per creator.

Replacing the current `_activeListingIds` loop (which is O(n) RPC calls) with a single subgraph query is the biggest immediate win. The Dashboard's O(n) `ownerOf` loop is the second biggest win.

**Complexity:** High (new technology stack, AssemblyScript, Graph Node or hosted service, GraphQL schema design, mapping logic for every event).

**Dependencies:** All contracts must have events for the data the subgraph needs. The auction contracts and offer contracts must emit events. This is why emitting rich events from the start matters.

**Why it is a differentiator:** Most portfolio NFT projects read directly from the chain. An indexed subgraph is what production marketplaces use (OpenSea uses a proprietary indexer; Zora uses The Graph). Showing this demonstrates production-level thinking.

---

### 12. Backend API

**What it is:** A Node.js/Express server that handles:
- User profile CRUD (off-chain data not suitable for blockchain).
- Favorites storage.
- Offer tracking (if not fully on-chain).
- NFT metadata caching (avoid hammering Pinata on every page load).
- Search indexing (full-text search via database, not client-side string matching).
- Aggregated stats (trending NFTs, featured collections).

**How it works:**

The API is a standard Express + TypeScript server with a database (PostgreSQL or MongoDB). Authentication is wallet-based: the frontend sends a signed message (`eth_sign` or EIP-712) proving ownership of the wallet address. The API verifies the signature using `ethers.verifyMessage` and issues a session token (JWT or cookie).

Endpoints needed:
- `GET /users/:address` — profile data.
- `PUT /users/:address` — update profile (auth required).
- `GET /nfts/:contract/:tokenId` — cached metadata.
- `POST /favorites` / `DELETE /favorites` — toggle favorite.
- `GET /favorites/:address` — get user's watchlist.
- `GET /collections` — list all deployed collections.
- `GET /search?q=...` — full-text search.
- `GET /trending` — algorithmic trending based on recent sales volume.

**Complexity:** High (new service, database, authentication, deployment).

**Dependencies:** Requires a running server and database. For Sepolia demo, can be deployed on Railway, Render, or Fly.io for free. The subgraph can feed aggregated data into the backend (or the backend can query the subgraph directly).

---

## Anti-features

Things to deliberately not build. These waste scope, introduce complexity without proportionate learning value, or are wrong for a Sepolia testnet portfolio project.

---

### Anti-feature 1: Bulk Minting / Lazy Minting

**Why not:** Lazy minting (mint on purchase, not on creation) is a cost optimization for mainnet where gas matters. On Sepolia testnet with free ETH, there is no gas cost to optimize. Implementing lazy minting requires voucher-based signature flows (EIP-712 signed vouchers, counter-factual token IDs) — significant complexity for zero user benefit on testnet. CONCERNS.md lists "no bulk operations" as a missing feature but the effort-to-value ratio is very poor here.

Skip it. If someone asks about it in an interview, explain why it is mainnet-specific and how it works conceptually.

---

### Anti-feature 2: Token-Gated Content / Access Control NFTs

**Why not:** A feature where owning an NFT unlocks access to content (Discord channels, private pages) requires off-chain infrastructure (a backend that validates NFT ownership on demand, a content delivery system). It is a valid real-world use case but orthogonal to marketplace mechanics. For a marketplace portfolio project it is a distraction that does not demonstrate deeper understanding of the marketplace domain.

---

### Anti-feature 3: ERC-1155 Multi-Edition Support

**Why not:** ERC-1155 allows multiple copies of the same token ID (editions). Supporting it in the marketplace requires handling quantity in listings, partial fills, and a different ownership model. The existing marketplace contract and frontend are built around ERC-721 (1-of-1 tokens). Adding ERC-1155 would require significant contract refactoring, new listing structs, and new UI patterns. For a portfolio demo focused on marketplace mechanics, ERC-721 is sufficient. ERC-1155 can be mentioned as a known extension point.

---

### Anti-feature 4: In-App Chat / Messaging Between Users

**Why not:** Real-time chat requires WebSocket infrastructure, message persistence, user presence, and moderation considerations. It is a product category unto itself (see: XMPP, Matrix, Push Protocol). Out of scope per PROJECT.md. Does not demonstrate smart contract or Web3 skill. Adds no marketplace value for a Sepolia demo.

---

### Anti-feature 5: Mobile App or PWA

**Why not:** MetaMask's mobile browser has a different window.ethereum injection model. Building a proper mobile dApp requires either a separate mobile app or deep PWA/WalletConnect integration. The project is already responsive (Ant Design grid system). Proper mobile dApp support is a multi-week effort with no incremental learning value about NFT marketplace mechanics. Responsive web design covers mobile browsers adequately.

---

### Anti-feature 6: Bid Aggregation / Cross-Marketplace Arbitrage

**Why not:** Showing bids and listings from external marketplaces (OpenSea, Blur) requires their APIs (often proprietary, rate-limited, or subscription-required). Sepolia testnet NFTs have no meaningful liquidity on those platforms. This would be fake data, not real integration. Avoid.

---

### Anti-feature 7: DAO Governance for Marketplace Parameters

**Why not:** Implementing a governance token and DAO voting to change commission rates or whitelist collections is architecturally interesting but completely disproportionate to a portfolio project. The marketplace is already owned by a single deployer (Ownable). Governance is a post-product-market-fit concern. An interviewer seeing DAO governance in a student project might question judgment about scope and prioritization more than applaud the feature.

---

### Anti-feature 8: Gas Optimization Theater

**Why not:** Aggressive gas optimizations (bit-packing structs, assembly-level storage, custom SLOAD patterns) make contracts harder to read and review. On Sepolia with free ETH, users do not pay meaningful gas costs. The portfolio value of clean, auditable, well-commented Solidity code is higher than micro-optimized code that is harder to understand. Optimize where it matters (the O(n) `_activeListingIds` scan is a legitimate issue) but do not optimize for its own sake.

---

## Feature Dependency Map

```
ERC-2981 Royalties
  └── required by: English Auctions (settlement payout), Dutch Auctions (purchase payout),
                   Creator Collections (factory deploys royalty-enabled contracts)

Creator Collections (Factory)
  └── required by: Collection filter in Search & Discovery
  └── enables: per-collection royalty rates, collection profile pages

English Auctions
  └── requires: Real-Time Updates (WebSocket for live bids)
  └── enhanced by: Subgraph (bid history), Backend API (notifications)

Dutch Auctions
  └── requires: Real-Time Updates (live price display)
  └── independent of: English Auctions (can be built separately)

Offer System
  └── enhanced by: Backend API (notifications to sellers), Real-Time Updates
  └── requires: nothing (can be pure on-chain)

User Profiles
  └── requires: Backend API (for persistence beyond localStorage)
  └── enhanced by: Subgraph (for accurate volume/sales stats)

Favorites / Watchlist
  └── can start with: localStorage (no backend needed for demo)
  └── requires: Backend API (for persistence + notifications)

Subgraph
  └── enhances: Search & Discovery, User Profiles (stats), Auction Bid History,
               Offer History, Collection Analytics
  └── requires: All contract events to be well-defined before indexing

Backend API
  └── requires: Database deployment, authentication design
  └── unlocks: User Profiles (full), Favorites (multi-device), Notifications,
               Metadata caching, Full-text search
```

---

## Complexity Summary Table

| Feature | Complexity | Contract Changes | Backend Needed | Subgraph Needed |
|---|---|---|---|---|
| User Profiles | Medium | None | Yes (or localStorage) | For stats |
| Creator Collections | High | New factory contract | For metadata | For analytics |
| ERC-2981 Royalties | Medium | Extend NFT + Marketplace | No | No |
| English Auctions | High | New auction module | For notifications | For bid history |
| Dutch Auctions | Medium | New auction module | No | No |
| Offer System | High | New offer module | For notifications | For offer history |
| Favorites / Watchlist | Low–Medium | None | Recommended | No |
| Subgraph | High | None (events must exist) | No | Is the feature |
| Backend API | High | None | Is the feature | Recommended input |
| Real-Time Updates | Medium | None | No | No |
| Search & Discovery | Low–Medium | None | For full-text search | For sort-by-sold |
| NFT Detail Enhancements | Low–Medium | None | No | For history |

---

## Recommended Build Order

Given the dependency map and complexity ratings, a rational sequence:

**Phase 1 — Fix existing, add royalties and real-time (unblocks everything else)**
1. Fix the three MVP bugs (reload-on-buy, dashboard stats hardcoded, sequential metadata fetches).
2. Add ERC-2981 royalties to NFT contract and update marketplace payment distribution.
3. Add WebSocket event subscriptions for real-time listing updates and transaction progress feedback.

**Phase 2 — Core new features (independent of backend/subgraph)**
4. Dutch auctions (simpler, good intro to auction contracts).
5. English auctions (builds on auction patterns from Dutch).
6. Creator Collections factory contract + collection pages.

**Phase 3 — Off-chain layer (enables social and discovery features)**
7. Backend API with wallet auth + user profiles + favorites.
8. Subgraph indexing (indexes all events from phases 1–2).

**Phase 4 — Discovery and polish**
9. Offer system (on-chain escrow).
10. Enhanced search with collection/price/trait filters backed by subgraph.
11. Profile pages with real volume stats from subgraph.
12. NFT detail with price history chart from subgraph data.

---

*Research complete: 2026-02-21*
