# Architecture Research — Full-Featured NFT Marketplace

**Research Date:** 2026-02-21
**Scope:** How full-featured NFT marketplace systems integrate auctions, indexing, backend APIs,
and real-time updates with existing on-chain contracts.
**Applies to:** Subsequent milestone on top of existing MVP (2 Solidity contracts, React 19 +
ethers.js v6 frontend, Pinata IPFS, Hardhat, Sepolia testnet).

---

## 1. Current State (Baseline)

The existing MVP is a two-layer system:

```
[Browser / MetaMask]
        |
        | ethers.js direct RPC calls
        v
[Ethereum Sepolia]
  NFTContract.sol   (ERC721 + URIStorage)
  Marketplace.sol   (fixed-price listings)
        |
        | IPFS URIs stored in tokenURI
        v
[Pinata / IPFS]
  image files + metadata JSON
```

All reads go directly to the chain. The frontend walks `getActiveListingIds()` one-by-one and
fetches IPFS metadata for each token individually. There is no backend, no event index, and no
real-time mechanism beyond MetaMask's `accountsChanged`/`chainChanged` events.

**Pain points this milestone must address:**
- N+1 RPC calls to display the marketplace grid (one call per active listing)
- No way to query "all NFTs in a collection" or "all bids by address" without expensive chain scans
- Auction and offer state is time-sensitive — users need live updates, not stale snapshots
- User profile data (username, bio, avatar) has no on-chain home and no off-chain home yet
- Royalty payments are untracked; no standard interface is exposed on the existing NFTContract

---

## 2. Target Architecture — Component Map

The full-featured system has five distinct component groups. Each group has hard boundaries;
communication between groups happens through defined interfaces only.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER LAYER                                                           │
│                                                                          │
│  React 19 + Vite 6 + Ant Design 5                                        │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  Pages /   │  │  ethers.js  │  │  REST client  │  │  WS client    │  │
│  │  Components│  │  hooks      │  │  (axios/fetch) │  │  (socket.io) │  │
│  └────────────┘  └─────────────┘  └───────────────┘  └───────────────┘  │
│         │               │                 │                  │           │
└─────────┼───────────────┼─────────────────┼──────────────────┼───────────┘
          │               │                 │                  │
          │ tx send       │ event           │ REST             │ WebSocket
          │ / read        │ listeners       │ queries          │ push
          ▼               ▼                 ▼                  ▼
┌──────────────────┐  ┌──────────────────────────────────────────────────┐
│  BLOCKCHAIN      │  │  BACKEND LAYER (Node.js / Express)               │
│  LAYER           │  │                                                  │
│                  │  │  ┌─────────────┐   ┌──────────────────────────┐ │
│  Sepolia Testnet │  │  │ REST API    │   │  WebSocket Server        │ │
│                  │  │  │ /nfts       │   │  (socket.io)             │ │
│  ┌────────────┐  │  │  │ /listings   │   │  Rooms: auction:{id}     │ │
│  │NFTContract │  │  │  │ /auctions   │   │  Events: bid_placed,     │ │
│  │(ERC721 +   │  │  │  │ /offers     │   │  auction_ended,          │ │
│  │ ERC2981)   │  │  │  │ /profiles   │   │  listing_updated,        │ │
│  │            │◄─┼──┼──┤ /search     │   │  offer_received          │ │
│  └────────────┘  │  │  └─────────────┘   └──────────────────────────┘ │
│                  │  │         │                        │               │
│  ┌────────────┐  │  │  ┌─────▼────────────────────────▼─────────────┐ │
│  │Marketplace │  │  │  │  PostgreSQL (primary DB)                    │ │
│  │(fixed-     │  │  │  │  - profiles, favorites, offer metadata      │ │
│  │ price)     │  │  │  │  - cache of indexed chain state             │ │
│  └────────────┘  │  │  └─────────────────────────────────────────────┘ │
│                  │  └──────────────────────────────────────────────────┘
│  ┌────────────┐  │
│  │ Collection │  │  ┌──────────────────────────────────────────────────┐
│  │ Factory    │  │  │  INDEXER LAYER (The Graph / subgraph)            │
│  │(EIP-1167   │  │  │                                                  │
│  │ Clones)    │  │  │  Listens to:                                     │
│  └────────────┘  │  │  - NFTContract: NFTMinted, Transfer              │
│                  │  │  - Marketplace: ItemListed, ItemSold, ItemUnlisted│
│  ┌────────────┐  │  │  - AuctionHouse: AuctionCreated, BidPlaced,      │
│  │ Auction-   │◄─┼──┼──  AuctionSettled                               │
│  │ House      │  │  │  - CollectionFactory: CollectionDeployed         │
│  │(English +  │  │  │                                                  │
│  │ Dutch)     │  │  │  Exposes GraphQL endpoint                        │
│  └────────────┘  │  │  Queried by: Backend API + React (fallback)      │
│                  │  └──────────────────────────────────────────────────┘
│  ┌────────────┐  │
│  │ Offer      │  │  ┌──────────────────────────────────────────────────┐
│  │ Registry   │  │  │  STORAGE LAYER                                   │
│  │(off-chain  │  │  │  Pinata / IPFS                                   │
│  │ sig verify)│  │  │  - NFT images (uploaded at mint time)            │
│  └────────────┘  │  │  - Token metadata JSON (name, desc, attributes)  │
└──────────────────┘  │  - Collection cover images                       │
                       └──────────────────────────────────────────────────┘
```

---

## 3. Component Boundaries

### 3.1 Smart Contract Layer

Four contracts, each with a single responsibility. They share no mutable state — they communicate
only through ERC-standard interfaces and events.

**NFTContract (upgrade from existing)**
- Add ERC-2981 royalty support (`ERC721Royalty` from OZ v5) by inheriting `ERC721Royalty`
- Add `setDefaultRoyalty(recipient, feeBasisPoints)` (owner-only) and per-token override
- The existing `mintNFT` signature remains unchanged; `_setTokenRoyalty` called inside
- Boundary: Owns tokenId → owner mapping, metadata URIs, royalty info. Does NOT know about
  auctions, listings, or collections. All other contracts call its standard ERC721 interface.

**CollectionFactory**
- Deploys minimal-proxy clones (EIP-1167) of a CollectionNFT implementation contract
- Each clone is its own ERC721 contract with its own address, name, symbol, and owner (creator)
- The factory emits `CollectionDeployed(address collection, address creator, string name)`
- Boundary: Manages deployment of collection instances. Does NOT store NFT data or control trading.
  Frontend calls `factory.createCollection(name, symbol, royaltyBps)` → gets back collection address.

**AuctionHouse**
- Supports English auction (ascending bids, reserve price, configurable duration) and Dutch auction
  (start price, end price, linear decay over duration, first buyer wins)
- Holds the NFT in escrow (transferFrom seller → AuctionHouse) for the auction duration
- English auction: tracks `highestBidder`, `highestBid`, refunds previous bidder on new bid
- Dutch auction: no bids stored; buyer calls `buy()`, price computed at call time
- Events: `AuctionCreated`, `BidPlaced`, `AuctionSettled`, `AuctionCancelled`
- Pays ERC-2981 royalty on settlement before sending proceeds to seller
- Boundary: Knows about ERC721 (via IERC721) and ERC-2981 (via IERC2981). Does NOT know about
  Marketplace or OfferRegistry. Marketplace and AuctionHouse are parallel trading mechanisms.

**OfferRegistry (optional on-chain component)**
- For the offer/negotiation system, there are two architectural options:
  - **On-chain**: OfferRegistry stores offers, requires ETH escrow, fully trustless but gas-heavy
  - **Off-chain signatures**: Buyer signs EIP-712 typed data (offer amount, tokenId, deadline);
    backend stores the signature; seller submits it on-chain to accept
- Recommended approach for a portfolio project: **off-chain signatures**. The Marketplace contract
  gains an `acceptOffer(offer, signature)` function that verifies the EIP-712 sig and executes the
  transfer. This avoids locking ETH for every offer.
- Boundary: Marketplace handles offer acceptance on-chain. Backend stores unaccepted offer
  signatures. The OfferRegistry is the backend's `offers` table plus Marketplace's `acceptOffer`.

### 3.2 Indexer Layer (The Graph Subgraph)

The subgraph listens to emitted events and builds a queryable GraphQL entity store. It does NOT
make RPC calls to read contract state — it only processes event logs.

**Entities to index:**
- `Token { id, tokenId, contract, owner, tokenURI, royaltyBps, mintedAt, collection }`
- `Listing { id, listingId, token, seller, price, active, createdAt, soldAt, buyer }`
- `Auction { id, auctionId, type, token, seller, startPrice, endPrice, reservePrice, highestBidder,
  highestBid, endsAt, settled, winner, finalPrice }`
- `Bid { id, auction, bidder, amount, timestamp }`
- `Offer { id, token, offerer, amount, deadline, accepted, acceptedAt }`
- `Collection { id, address, name, symbol, creator, createdAt }`
- `Account { id, address, totalSales, totalPurchases }`

**What the subgraph provides:** Fast GraphQL queries for the marketplace grid, user portfolio,
collection pages, auction bid history, and activity feeds — without hitting the chain for every
page load.

**What the subgraph does NOT provide:** Real-time push (it polls with ~2-5 block delay), user
profile metadata, offer signatures, or any off-chain data. The backend fills these gaps.

### 3.3 Backend API Layer (Node.js / Express)

A stateless REST API backed by PostgreSQL. It has two data sources:
1. The subgraph (GraphQL queries for on-chain state)
2. Its own PostgreSQL tables (off-chain data: profiles, favorites, offer signatures)

**Endpoints:**
```
GET  /api/nfts?collection=&owner=&sort=&page=        → delegates to subgraph
GET  /api/nfts/:tokenId                               → subgraph + IPFS metadata cache
GET  /api/listings?active=true&sort=price_asc         → subgraph
GET  /api/auctions?status=active&type=english         → subgraph
GET  /api/auctions/:auctionId/bids                    → subgraph
POST /api/auctions/:auctionId/bids                    → record bid, emit WS event
GET  /api/offers/:tokenId                             → DB (offer sigs for token)
POST /api/offers                                      → store EIP-712 offer sig
DELETE /api/offers/:offerId                           → cancel (only offerer can)
GET  /api/profiles/:address                           → DB
PUT  /api/profiles/:address                           → DB (auth via EIP-712 sig)
GET  /api/profiles/:address/nfts                      → subgraph filtered by owner
POST /api/search?q=                                   → PostgreSQL full-text on cached metadata
GET  /api/collections                                 → subgraph
GET  /api/collections/:address                        → subgraph + DB cover image
```

**Authentication:** No JWT. Profile updates require the request body to contain an EIP-712
signature over the update payload. The backend verifies `ecrecover(hash, sig) == address`.
This is the same pattern MetaMask uses for "Sign-In With Ethereum" (SIWE / EIP-4361).

**Caching layer:** The backend caches IPFS metadata (name, description, image CID) in PostgreSQL
to avoid hitting Pinata on every NFT grid load. Cache is populated lazily on first request and
refreshed if the tokenURI changes (detected via subgraph Transfer events).

**Boundary:** The backend is the single source of truth for off-chain data (profiles, offer sigs,
favorites, metadata cache). It is the authority for real-time event dispatch. It does NOT submit
transactions to the chain — all write transactions are sent by the frontend directly through
MetaMask.

### 3.4 WebSocket Layer

The WebSocket server runs within the same Node.js process as the REST API (socket.io attached to
the Express HTTP server). It is the real-time push mechanism.

**Room strategy:**
```
auction:{auctionId}    → subscribers see every BidPlaced, AuctionSettled for that auction
token:{tokenId}        → subscribers see listing updates, offer notifications for that token
account:{address}      → subscribers see incoming offers, sale completions for that wallet
global:listings        → subscribers see all new ItemListed events for marketplace grid refresh
```

**Event sources:** The backend subscribes to contract events using a server-side ethers.js
`JsonRpcProvider` + `contract.on(eventName, handler)`. When a relevant event arrives:
1. Backend updates its PostgreSQL cache
2. Backend publishes to the appropriate socket.io room

This means the frontend does NOT need its own ethers.js event listeners for marketplace state.
It subscribes to the WebSocket and receives processed, structured updates instead.

**Boundary:** The WebSocket layer pushes state-change notifications. It does NOT send full entity
payloads — it sends lightweight events like `{ type: 'bid_placed', auctionId, bidder, amount, timestamp }`.
The frontend re-fetches the entity from the REST API when it needs updated data (or uses the
event payload directly for the auction countdown UI).

### 3.5 Frontend Layer (additions to existing React app)

The existing React app gains new hooks and services:

**New hooks:**
- `useAuctions(filters)` — queries `/api/auctions`, subscribes to `global:listings` WS room
- `useAuction(auctionId)` — queries `/api/auctions/:id`, subscribes to `auction:{id}` WS room,
  exposes live `currentPrice` (for Dutch: computed locally from start/end/elapsed), `bids[]`
- `useOffers(tokenId)` — queries `/api/offers/:tokenId`, subscribes to `token:{tokenId}` WS room
- `useProfile(address)` — queries `/api/profiles/:address`
- `useCollection(address)` — queries subgraph via `/api/collections/:address`

**New services:**
- `api.ts` — typed wrapper around fetch/axios for all REST API calls
- `ws.ts` — singleton socket.io client, `subscribe(room)` / `unsubscribe(room)` / `on(event, handler)`

**Existing hooks that change:**
- `useContracts` — gains `auctionHouseContract`, `collectionFactoryContract`
- The marketplace page switches from direct RPC polling to WebSocket-driven refresh

---

## 4. Data Flow

### 4.1 Auction Bid Flow (English Auction)

```
User (browser)
  │
  │  1. placeBid(auctionId, { value: amount })
  ▼
AuctionHouse.sol  ←── ethers.js direct tx via MetaMask
  │
  │  2. BidPlaced event emitted on-chain
  ▼
Backend Node.js (ethers.js listener on server)
  │
  │  3. Event received, DB updated (auction.highestBid, auction.highestBidder)
  │
  ├──► 4. socket.io emit to room auction:{auctionId}
  │         payload: { type: 'bid_placed', bidder, amount, timestamp }
  │
  └──► 5. Update subgraph catches event within ~2 blocks (async, background)
             Subgraph entity Bid created, Auction.highestBid updated

Browser (other users watching the auction)
  │
  │  6. WS message received in useAuction() hook
  │
  ▼
  Bid history updated, price display updated — no page reload required
```

### 4.2 NFT Minting into a Collection Flow

```
User (browser)
  │
  │  1. Upload image → Pinata → imageCID
  │  2. Upload metadata JSON → Pinata → metadataCID
  │  3. collectionContract.mintNFT("ipfs://" + metadataCID)
  ▼
CollectionNFT.sol (clone instance)
  │
  │  4. NFTMinted event emitted
  │     (collectionContract address in event)
  ▼
Subgraph
  │
  │  5. Token entity created with collection = collectionContract.address
  ▼
Backend API (next REST request)
  │
  │  6. GET /api/collections/:address returns updated token list
  ▼
Frontend collection page renders new NFT
```

### 4.3 Offer Flow (Off-Chain Signatures)

```
Buyer (browser)
  │
  │  1. User enters offer amount for tokenId
  │  2. Frontend builds EIP-712 typed data:
  │     { tokenId, offerer, amount, deadline, nonce }
  │  3. wallet.signTypedData(domain, types, value) → signature
  │  4. POST /api/offers { tokenId, offerer, amount, deadline, nonce, signature }
  ▼
Backend API
  │
  │  5. Verifies ecrecover(hash, sig) == offerer
  │  6. Stores in offers table
  │  7. socket.io emit to room token:{tokenId}
  │        payload: { type: 'offer_received', offerer, amount, deadline }
  ▼
Seller (browser, subscribed to token:{tokenId} room)
  │
  │  8. WS notification: "New offer for X ETH"
  │  9. Seller clicks Accept
  │  10. Frontend calls GET /api/offers/:tokenId → gets sig
  │  11. Frontend calls marketplace.acceptOffer(offerStruct, signature)
  ▼
Marketplace.sol
  │
  │  12. verifyOffer: ecrecover(hash, sig) == offerer, deadline not passed
  │  13. transferFrom(seller, offerer, tokenId)
  │  14. Pay royalty via ERC-2981
  │  15. Pay seller proceeds
  │  16. ItemSold (or OfferAccepted) event emitted
  ▼
Backend (event listener) → DB updated → WS emit to account:{seller} + account:{buyer}
```

### 4.4 Marketplace Grid Load Flow (Post-Indexer)

**Before (current MVP):** Frontend calls `getActiveListingIds()` → loops N times over
`marketplace.listings(id)` → calls `nft.tokenURI(tokenId)` → fetches IPFS metadata for each.
This is O(N) RPC calls + O(N) IPFS fetches, all sequential, all in the browser.

**After (with backend + subgraph):**

```
Browser
  │
  │  GET /api/listings?active=true&sort=price_asc&page=1&limit=20
  ▼
Backend API
  │
  │  GraphQL query to subgraph:
  │  { listings(where:{active:true}, orderBy:price, first:20) {
  │      listingId price seller
  │      token { tokenId tokenURI name image }
  │  }}
  ▼
Subgraph (pre-indexed entity store)
  │
  │  Returns paginated result with metadata already cached in entity
  ▼
Backend API
  │
  │  Enriches with cached IPFS metadata from PostgreSQL if subgraph
  │  entity doesn't have it yet (cold-start only)
  │
  │  Returns JSON array of listings with full metadata
  ▼
Browser renders grid immediately — 1 HTTP request total
```

### 4.5 Real-Time Listing Updates

```
Any user buys an NFT (ItemSold event fires on-chain)
  │
Backend ethers.js listener
  │
  ├──► Update DB: listing.active = false, listing.buyer = ..., listing.soldAt = ...
  └──► socket.io emit to room global:listings
            payload: { type: 'listing_sold', listingId }

All browsers with marketplace page open
  │
  │  WS message received in useAuctions() hook
  │  Hook removes listingId from local state immediately (optimistic)
  │  OR re-fetches /api/listings in background and merges
  ▼
Listing disappears from grid without page reload
```

---

## 5. Suggested Build Order

The components have hard dependencies. Building out-of-order causes either integration failures or
throwaway work. The correct order is:

### Phase 1 — Contract Foundation (must be first; everything else builds on these ABIs)

**Why first:** The subgraph schema, backend event listeners, and frontend hooks all depend on the
contract ABI and deployed addresses. Changing contracts after the indexer is live requires a
subgraph re-index.

1. **Add ERC-2981 to NFTContract** — inherit `ERC721Royalty`, add `setDefaultRoyalty`. Redeploy.
   This is a breaking ABI change; do it before any other component depends on the NFT contract ABI.

2. **Deploy AuctionHouse** — English auction first (Dutch is simpler, add after English works).
   Test: create auction, place bids, settle. Verify royalty payment on settlement.

3. **Deploy CollectionFactory** — implement EIP-1167 clone factory, CollectionNFT implementation.
   Test: create collection, mint into collection, verify tokenId scoping.

4. **Add `acceptOffer` to Marketplace** — add EIP-712 typed data domain, `acceptOffer(offer, sig)`
   function. This extends the existing contract; no data migration needed.

### Phase 2 — Subgraph (must come before backend; backend queries the subgraph)

**Why second:** The backend's read path delegates to the subgraph for all chain state. Building
the backend before the subgraph forces temporary direct-RPC reads that must later be replaced.

5. **Write subgraph manifest** — `subgraph.yaml` defines all four contracts as data sources.
   Define entities in `schema.graphql` (Token, Listing, Auction, Bid, Collection, Account).

6. **Write mapping handlers** — AssemblyScript handlers for each event type. Start with the
   existing Marketplace events (ItemListed, ItemSold, ItemUnlisted) since those events already
   exist in the MVP contracts. Add NFTMinted, AuctionCreated, BidPlaced, CollectionDeployed.

7. **Deploy to The Graph Studio (Sepolia subgraph)** — or run a local Graph Node for development.
   Verify queries return correct data for existing listings.

### Phase 3 — Backend API (must come before WebSocket and updated frontend hooks)

**Why third:** The frontend REST client and WebSocket client both connect to the backend. The
backend must be running and stable before wiring up the React hooks.

8. **Scaffold Node.js/Express server** — `backend/` directory, TypeScript, PostgreSQL via `pg` or
   Prisma, dotenv config. Define DB schema: `profiles`, `offers`, `metadata_cache`, `favorites`.

9. **Implement subgraph client** — thin wrapper around `graphql-request` that the API route
   handlers use to query the subgraph. Add response caching (in-memory LRU, 30-second TTL).

10. **Implement REST routes** — start with read-only routes: `/api/listings`, `/api/nfts`,
    `/api/auctions`, `/api/collections`. These only need the subgraph client, no DB writes.

11. **Implement profile routes** — `/api/profiles/:address` GET/PUT with EIP-712 auth verification.
    Requires `ethers.js` on the server for `verifyTypedData`.

12. **Implement offer routes** — POST/GET/DELETE `/api/offers`. Requires EIP-712 sig verification
    and the Marketplace contract's domain separator to match.

### Phase 4 — WebSocket Server (can be added to backend after Phase 3 routes are working)

**Why fourth:** The WS server needs the REST routes to exist first (it piggybacks on the same
server process). It also needs to subscribe to on-chain events, which requires the Phase 1
contract ABIs.

13. **Add socket.io to Express server** — attach to the same HTTP server. Define room naming
    conventions. Test connection from browser.

14. **Add ethers.js server-side event listeners** — `JsonRpcProvider` (Alchemy WebSocket URL),
    subscribe to all four contracts' events. Each handler: update DB → emit to socket.io room.

15. **Wire auction bid events** — `BidPlaced` → update `auctions` cache in DB →
    emit `bid_placed` to `auction:{auctionId}` room. Test with two browser sessions.

### Phase 5 — Frontend Integration (last; depends on everything above being stable)

**Why last:** The frontend is the consumer of all other layers. Connecting before the backend and
subgraph are stable leads to mocking/stubbing that must be removed later.

16. **Add `api.ts` service** — typed fetch wrapper for all backend REST calls. Replaces the direct
    contract reads in `Marketplace.tsx` and `NFTDetail.tsx` for listing data.

17. **Add `ws.ts` service** — singleton socket.io-client. `subscribe(room)`, `on(event, cb)`.
    React hooks call subscribe on mount, unsubscribe on unmount.

18. **Refactor `useContracts`** — add `auctionHouseContract`, `collectionFactoryContract`.
    Keep `nftContract` and `marketplaceContract` for write operations (buy, list, mint).

19. **Build `useAuction(id)` hook** — REST fetch for initial state, WS subscription for live bids.
    Implement Dutch auction local price computation (no chain call needed: start + (end-start) *
    elapsed / duration).

20. **Build auction UI** — AuctionCard component, AuctionDetail page, BidModal, countdown timer.

21. **Build collection UI** — CollectionPage, CreateCollectionModal, collection-scoped mint flow.

22. **Build offer UI** — MakeOfferModal (signs EIP-712 data), OffersPanel on NFTDetail page,
    Accept/Reject actions for token owner.

23. **Build profile UI** — ProfilePage, EditProfileModal (signs EIP-712 update payload).

---

## 6. Key Interface Contracts Between Layers

These are the boundaries that must remain stable once established. Changes to them require
coordinated updates across multiple layers.

| Interface | Producer | Consumer(s) | Critical Fields |
|-----------|----------|-------------|-----------------|
| AuctionHouse ABI | Contracts (Phase 1) | Frontend hooks, Backend listener, Subgraph | `AuctionCreated`, `BidPlaced`, `AuctionSettled` event signatures |
| Subgraph GraphQL schema | Subgraph (Phase 2) | Backend API | Entity field names; breaking changes require subgraph redeployment |
| REST API contract | Backend (Phase 3) | Frontend `api.ts` | Route paths, response shapes; versioning via `/api/v1/` prefix recommended |
| WebSocket event names | Backend WS (Phase 4) | Frontend `ws.ts` | `bid_placed`, `listing_sold`, `offer_received`, `auction_ended` — must be stable |
| EIP-712 domain separator | Marketplace.sol (Phase 1) | Backend offer verification, Frontend signing | Domain name/version must match exactly between contract, backend, and frontend |

---

## 7. What Stays the Same

The existing MVP components require only targeted extensions — not replacement.

| Existing Component | Change Required |
|--------------------|----------------|
| `NFTContract.sol` | Add `ERC721Royalty` inheritance + `setDefaultRoyalty`. Existing `mintNFT` unchanged. |
| `Marketplace.sol` | Add `acceptOffer(offer, sig)` function + EIP-712 domain. Existing `listItem`/`buyItem`/`unlistItem` unchanged. |
| `useWallet.ts` | No change needed |
| `useContracts.ts` | Add two new contract instances (AuctionHouse, CollectionFactory) |
| `ipfs.ts` | No change needed |
| `contracts.ts` | Add new contract addresses + ABIs; existing entries unchanged |
| `Marketplace.tsx` page | Switch data fetching from direct RPC to `api.ts` REST calls; add WS subscription |
| `NFTDetail.tsx` page | Add offers panel; listing data from `api.ts` instead of direct chain loop |

---

## 8. Technology Choices for New Components

| Component | Recommended Choice | Rationale |
|-----------|-------------------|-----------|
| Subgraph | The Graph (Hosted Service / Studio, Sepolia) | Industry standard; AssemblyScript handlers; Sepolia supported; free tier covers portfolio scale |
| Backend runtime | Node.js 20 LTS + Express + TypeScript | Consistent with existing frontend TS; team already knows ethers.js |
| Database | PostgreSQL (Railway or Supabase free tier) | Structured off-chain data; full-text search for NFT metadata cache; JSONB for flexible attributes |
| WebSocket | socket.io (server + client) | Rooms model matches the per-auction/per-token subscription pattern exactly; auto-reconnect |
| On-chain event listener | ethers.js `JsonRpcProvider` + Alchemy WebSocket URL | Existing Alchemy account; WebSocket RPC avoids polling; filters per contract address |
| Collection implementation | EIP-1167 minimal proxy clones | Gas-efficient (deploy cost ~10x cheaper than full contract); each collection gets its own address for subgraph entity isolation |
| Offer authentication | EIP-712 typed data + `ecrecover` | No JWT/session to manage; wallet-native; matches existing MetaMask signing flow |
| Auction royalty enforcement | ERC-2981 `royaltyInfo(tokenId, salePrice)` | Standard interface; AuctionHouse reads it on settlement without knowing royalty implementation details |

---

## 9. Build Order Summary (Dependency Graph)

```
Phase 1: Contracts
  NFTContract (+ ERC2981)
  AuctionHouse
  CollectionFactory
  Marketplace (+ acceptOffer)
         │
         ▼
Phase 2: Subgraph
  schema.graphql
  subgraph.yaml
  mapping handlers
         │
         ▼
Phase 3: Backend REST API
  DB schema
  subgraph client
  read routes (/listings, /nfts, /auctions, /collections)
  write routes (/profiles, /offers)
         │
         ▼
Phase 4: WebSocket Server
  socket.io attached to Express
  on-chain event listeners
  room dispatch logic
         │
         ▼
Phase 5: Frontend Integration
  api.ts + ws.ts services
  useAuction, useOffers, useProfile hooks
  Auction UI
  Collection UI
  Offer UI
  Profile UI
```

No phase can be meaningfully tested end-to-end until its upstream dependencies (earlier phases)
are running. Each phase boundary is a natural milestone checkpoint.

---

*Research completed: 2026-02-21*
