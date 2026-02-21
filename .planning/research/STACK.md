# Stack Research: Full-Featured NFT Marketplace (Milestone 2+)

**Research Date:** 2026-02-21
**Scope:** Additional components only — existing stack (Solidity 0.8.20 + OZ v5, React 19 + TS + Vite 6, ethers.js v6, Ant Design 5 + Tailwind 4, Pinata IPFS, Hardhat 2.22) is assumed and not repeated.
**Target:** Sepolia testnet, portfolio-ready deployed demo.

---

## Features Being Added

| Feature | Complexity | Stack Dimension |
|---------|------------|-----------------|
| English + Dutch auctions | High — new contracts | Smart contracts, frontend |
| ERC-2981 royalties | Low — OZ already in tree | Smart contracts |
| Offer / negotiation system | Medium — off-chain signatures | Smart contracts, backend |
| User profiles | Medium — off-chain data | Backend API, database |
| Creator collections | Medium — contract + UI | Smart contracts, frontend |
| Subgraph indexing | High — new service | The Graph |
| Backend API | High — new service | Node.js, database |
| Real-time updates | Medium — event bridge | WebSockets / SSE |
| Search & discovery | Medium — query layer | Database full-text / Typesense |
| Favorites / watchlist | Low — off-chain data | Backend API |

---

## 1. Smart Contract Layer (additions)

### 1.1 ERC-2981 Royalties

**Decision: Use `@openzeppelin/contracts` `ERC2981` + `ERC721Royalty` — already in the installed dependency tree.**

The file `contracts/node_modules/@openzeppelin/contracts/token/common/ERC2981.sol` is present. No new package needed. NFTContract.sol must be updated to inherit `ERC721Royalty` (which itself inherits `ERC2981`) and `Marketplace.sol` must call `royaltyInfo()` before distributing proceeds.

```solidity
// NFTContract.sol addition
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";

contract NFTContract is ERC721, ERC721URIStorage, ERC721Royalty, Ownable {
    function mintNFT(string memory _tokenURI, address receiver, uint96 feeNumerator)
        public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        _setTokenRoyalty(tokenId, receiver, feeNumerator); // feeNumerator / 10000
        emit NFTMinted(msg.sender, tokenId, _tokenURI);
        return tokenId;
    }
}
```

**Confidence: HIGH.** ERC-2981 is the de-facto industry standard. OpenZeppelin v5 ships it.

---

### 1.2 Auction Contracts

**Decision: Write custom `EnglishAuction.sol` and `DutchAuction.sol`. Do NOT use third-party auction libraries.**

Rationale: No widely-maintained, audited Solidity auction library exists for OZ v5. Seaport (OpenSea's protocol) is far too complex for a portfolio project. Writing custom contracts is appropriate, demonstrates skill, and keeps the codebase understandable.

**English Auction pattern:**

```solidity
// Key state per auction
struct Auction {
    address nftContract;
    uint256 tokenId;
    address payable seller;
    uint256 startPrice;
    uint256 reservePrice;    // 0 = no reserve
    uint256 endTime;         // unix timestamp
    address payable highBidder;
    uint256 highBid;
    bool settled;
}
```

Key mechanics: bids must exceed current high by minimum increment (e.g. 5%); losing bidder funds held in contract and withdrawable after settlement; seller can cancel only before first bid; `ReentrancyGuard` mandatory for bid + settle functions.

**Dutch Auction pattern:**

```solidity
struct DutchAuction {
    address nftContract;
    uint256 tokenId;
    address payable seller;
    uint256 startPrice;
    uint256 endPrice;       // floor price
    uint256 startTime;
    uint256 duration;       // seconds until endPrice reached
    bool settled;
}

function currentPrice(uint256 auctionId) public view returns (uint256) {
    DutchAuction storage a = dutchAuctions[auctionId];
    uint256 elapsed = block.timestamp - a.startTime;
    if (elapsed >= a.duration) return a.endPrice;
    uint256 priceDrop = (a.startPrice - a.endPrice) * elapsed / a.duration;
    return a.startPrice - priceDrop;
}
```

**Confidence: HIGH** for the pattern. Custom implementation is the right choice here.

**No additional npm packages required** — OpenZeppelin already provides `ReentrancyGuard`, `Pausable`, `IERC721`.

---

### 1.3 Off-Chain Offer System (EIP-712 Signatures)

**Decision: Typed structured data signatures (EIP-712) for offers. Minimal on-chain footprint.**

Buyers sign an offer off-chain (price, tokenId, expiry, nonce). The seller submits the signed offer on-chain to execute. This avoids storing offers on-chain (gas waste) while keeping acceptance trustless.

New contract `OfferManager.sol`:
- Stores only accepted nonces (to prevent replay)
- Verifies EIP-712 signature on `acceptOffer()`
- Calls `royaltyInfo()`, distributes proceeds to seller, royalty recipient, and marketplace
- Requires buyer's ETH deposited with `depositOffer()` or uses ERC20 (ETH for simplicity on Sepolia)

**OZ additions needed:**

```solidity
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
```

Both are in the installed OZ v5 tree already.

**Confidence: HIGH.** EIP-712 offer pattern is used by OpenSea, LooksRare, and others. Ethers.js v6 has `signTypedData()` support built in.

---

## 2. Subgraph Indexing Layer

### 2.1 The Graph Protocol

**Decision: The Graph hosted service (Subgraph Studio) for Sepolia. This is the correct choice for a portfolio project on Sepolia.**

**Why The Graph, not alternatives:**
- **Alchemy Subgraphs** — requires Alchemy paid tier; locks into one provider
- **Moralis** — generous free tier but proprietary; abstracts away understanding of indexing
- **Custom event listener + DB** — feasible (see Backend section) but loses the benefits of GraphQL and community tooling
- **Ponder** (newer framework) — v0.x still maturing, less documentation, not worth risk for portfolio

The Graph Subgraph Studio supports Sepolia (network name: `sepolia`) on the free hosted tier.

**Packages to add — Subgraph workspace (separate directory `subgraph/`):**

| Package | Version | Role |
|---------|---------|------|
| `@graphprotocol/graph-cli` | `^0.91.0` | CLI for building and deploying subgraphs |
| `@graphprotocol/graph-ts` | `^0.35.1` | AssemblyScript types for mapping code |

**Rationale for versions:** graph-cli 0.91.x is the latest stable series as of early 2026; graph-ts 0.35.x matches. These are devDependencies of the subgraph workspace only.

**Confidence: MEDIUM-HIGH.** Versions derived from known 2025 release trajectory — verify with `npm info @graphprotocol/graph-cli version` before pinning.

**Subgraph structure:**

```yaml
# subgraph/subgraph.yaml
specVersion: 1.0.0
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: Marketplace
    network: sepolia
    source:
      address: "0x..."
      abi: Marketplace
      startBlock: 7000000
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities: [Listing, Sale, Auction, Bid, Offer, User, NFT]
      eventHandlers:
        - event: ItemListed(indexed uint256,indexed address,indexed uint256,address,uint256)
          handler: handleItemListed
        - event: ItemSold(indexed uint256,indexed address,uint256,uint256)
          handler: handleItemSold
```

**GraphQL schema entities:**

```graphql
type NFT @entity {
  id: ID!                      # nftContract-tokenId
  tokenId: BigInt!
  contract: Bytes!
  owner: User!
  creator: User!
  tokenURI: String!
  royaltyBps: Int
  collection: Collection
  listings: [Listing!]! @derivedFrom(field: "nft")
  auctions: [Auction!]! @derivedFrom(field: "nft")
  offers: [Offer!]! @derivedFrom(field: "nft")
  favorites: [Favorite!]! @derivedFrom(field: "nft")
}

type Listing @entity {
  id: ID!
  nft: NFT!
  seller: User!
  price: BigInt!
  active: Boolean!
  createdAt: BigInt!
  soldAt: BigInt
  buyer: User
}

type Auction @entity {
  id: ID!
  kind: String!               # "english" | "dutch"
  nft: NFT!
  seller: User!
  startPrice: BigInt!
  endPrice: BigInt            # dutch only
  reservePrice: BigInt        # english only
  endTime: BigInt!
  highBid: BigInt
  highBidder: User
  settled: Boolean!
  bids: [Bid!]! @derivedFrom(field: "auction")
}

type User @entity {
  id: ID!                     # address
  ownedNFTs: [NFT!]! @derivedFrom(field: "owner")
  listings: [Listing!]! @derivedFrom(field: "seller")
  bids: [Bid!]! @derivedFrom(field: "bidder")
}
```

**Frontend query client:**

| Package | Version | Role |
|---------|---------|------|
| `@apollo/client` | `^3.11.0` | GraphQL client with caching and React hooks |
| `graphql` | `^16.9.0` | Peer dependency for Apollo |

**Why Apollo Client over urql or raw fetch:**
- `useQuery` / `useSuspenseQuery` hooks integrate cleanly with React 19
- Built-in normalized cache prevents redundant fetches
- Apollo DevTools for Chrome aids debugging
- urql is lighter but Apollo has better documentation and wider portfolio recognition

**Confidence: HIGH.** Apollo Client v3 with React 19 is well-tested as of 2025.

---

## 3. Backend API Layer

### 3.1 Runtime & Framework

**Decision: Node.js 22 LTS + Fastify 5**

**Why Fastify 5, not Express 5:**
- Fastify 5 was released October 2024; it is the current major version
- Built-in TypeScript support via `@types/node` and full `.d.ts` types
- Schema-based validation with JSON Schema / Zod integration (eliminates a middleware layer)
- 2-3x faster than Express in benchmarks (matters less at portfolio scale but demonstrates awareness)
- Plugin system is cleaner than Express middleware stacking
- `fastify-plugin` and `@fastify/cors`, `@fastify/jwt` are well-maintained first-party plugins

**Why not:**
- Express 5 — stable but no built-in TypeScript types, slower ecosystem modernization
- Hono — excellent but less familiar to most reviewers
- NestJS — too much boilerplate and opinion overhead for a portfolio project

**Packages:**

| Package | Version | Role |
|---------|---------|------|
| `fastify` | `^5.2.0` | HTTP server framework |
| `@fastify/cors` | `^10.0.0` | CORS headers for frontend origin |
| `@fastify/jwt` | `^9.0.0` | JWT middleware (if auth needed) |
| `@fastify/rate-limit` | `^10.0.0` | Rate limiting to prevent abuse |
| `@fastify/swagger` | `^9.0.0` | Auto-generate OpenAPI docs from schema |
| `@fastify/swagger-ui` | `^5.0.0` | Serve Swagger UI at `/docs` |
| `zod` | `^3.23.0` | Runtime validation for request bodies |

**Confidence: HIGH** for Fastify 5. **MEDIUM** for exact minor versions — verify with `npm info fastify version`.

---

### 3.2 Database

**Decision: PostgreSQL 16 + Prisma 6 ORM**

**Why PostgreSQL:**
- Relational model fits: Users → Profiles, NFTs → Collections, Offers → NFTs
- Full-text search (`tsvector` / `tsquery`) eliminates the need for a separate search service for a portfolio project at this scale
- `JSONB` columns for flexible NFT metadata attributes
- Free tier on Railway, Render, or Supabase — easy to deploy for demo

**Why Prisma 6, not alternatives:**
- Prisma 6 released late 2024; first version with Prisma Postgres (managed DB integration) and significantly faster query engine (Rust-based)
- Type-safe queries generated from schema — eliminates runtime type casting
- Migration system (`prisma migrate`) produces reviewable SQL diffs
- Alternative: **Drizzle ORM** — excellent TypeScript types and smaller runtime, but Prisma has broader community recognition for portfolio review

**Why not MongoDB:**
- Profile and offer data are relational; document model adds complexity without benefit
- MongoDB free tier (Atlas M0) is tempting but PostgreSQL is better match for the data shape

**Packages:**

| Package | Version | Role |
|---------|---------|------|
| `prisma` | `^6.3.0` | ORM + migration CLI (devDependency) |
| `@prisma/client` | `^6.3.0` | Generated type-safe DB client |

**Prisma schema excerpt:**

```prisma
model User {
  id          String   @id  // Ethereum address, lowercase
  username    String?  @unique
  bio         String?
  avatarCid   String?       // IPFS CID of avatar image
  bannerCid   String?
  createdAt   DateTime @default(now())
  favorites   Favorite[]
  offers      Offer[]
}

model Offer {
  id           String   @id @default(cuid())
  nftContract  String
  tokenId      BigInt
  buyer        String          // Ethereum address
  price        BigInt          // wei
  signature    String          // EIP-712 hex signature
  expiresAt    DateTime
  status       OfferStatus     @default(PENDING)
  createdAt    DateTime        @default(now())
  user         User     @relation(fields: [buyer], references: [id])
}

enum OfferStatus { PENDING ACCEPTED REJECTED EXPIRED }

model Favorite {
  id          String   @id @default(cuid())
  userAddress String
  nftContract String
  tokenId     BigInt
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userAddress], references: [id])
  @@unique([userAddress, nftContract, tokenId])
}
```

**Confidence: HIGH** for PostgreSQL + Prisma. **MEDIUM** for Prisma 6.3.x specifically — verify.

---

### 3.3 Caching Layer

**Decision: Skip Redis for MVP milestone. Use in-memory LRU cache in the API process.**

**Rationale:** Redis adds operational complexity (another service to deploy). For a portfolio demo on Sepolia with low traffic:
- NFT metadata: cache resolved IPFS responses in memory with `lru-cache` (already a transitive dep in most Node projects)
- Subgraph responses: Apollo Client's normalized cache on the frontend handles this
- Session state: JWTs are stateless; no session store needed

**If the project scales past demo scope:** add `ioredis ^5.3.0` as a drop-in cache layer. The service layer should be written with a cache interface so Redis can be swapped in without touching business logic.

**Package (optional, no new service):**

| Package | Version | Role |
|---------|---------|------|
| `lru-cache` | `^11.0.0` | In-process LRU for metadata caching |

**Confidence: HIGH** for this decision at portfolio scope.

---

### 3.4 Authentication

**Decision: Wallet-signature based auth (SIWE — Sign-In with Ethereum). No passwords.**

Users prove identity by signing a message with their wallet. The backend issues a short-lived JWT. This is the correct pattern for Web3 apps and demonstrates understanding of decentralized identity.

**Packages:**

| Package | Version | Role |
|---------|---------|------|
| `siwe` | `^2.3.0` | Parse and verify SIWE messages |
| `@fastify/jwt` | `^9.0.0` | Issue and verify JWTs after SIWE verification |

**Flow:**
1. Frontend calls `GET /api/nonce?address=0x...` → backend returns random nonce stored temporarily
2. Frontend calls `ethers.signer.signMessage(siweMessage)` where message includes nonce, domain, chain ID
3. Frontend calls `POST /api/auth/verify` with message + signature
4. Backend verifies via `siwe.verify()`, issues JWT
5. JWT included in `Authorization: Bearer <token>` header on subsequent API calls

**Confidence: HIGH.** SIWE is an EIP (EIP-4361) with a stable npm package. Widely used pattern.

---

### 3.5 Blockchain Event Listener (Backend)

**Decision: Ethers.js v6 event listener in the backend for real-time indexing complement to the subgraph.**

The subgraph is the source of truth for historical data. The backend needs a lightweight listener to update the DB on new events (e.g., to invalidate an Offer when an NFT is sold).

```typescript
// backend/src/services/eventListener.ts
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_SEPOLIA_URL);
const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);

marketplace.on('ItemSold', async (listingId, buyer, price, commission, event) => {
  await prisma.offer.updateMany({
    where: { tokenId: ..., status: 'PENDING' },
    data: { status: 'EXPIRED' }
  });
  // emit WebSocket notification
});
```

**No additional package required** — ethers.js v6 is already in the existing stack and can run in Node.js.

**Confidence: HIGH.**

---

## 4. Real-Time Updates

### 4.1 Transport

**Decision: WebSockets via the `ws` library, managed through Fastify.**

**Why WebSockets over SSE:**
- SSE is unidirectional (server→client only). WebSockets support bidirectional — needed for future features (e.g., chat, counters) even if not immediately required
- SSE has limitations with some proxies and load balancers
- WebSocket client API is built into modern browsers

**Why `ws` over Socket.IO:**
- Socket.IO is a significant additional dependency that adds its own protocol layer on top of WebSockets
- For this use case (broadcast events to connected clients), raw `ws` or Fastify's `@fastify/websocket` is sufficient
- Socket.IO's rooms and namespaces add complexity not needed here

**Packages:**

| Package | Version | Role |
|---------|---------|------|
| `@fastify/websocket` | `^11.0.0` | WebSocket support in Fastify |

**Frontend:** The browser's built-in `WebSocket` API is sufficient. No additional npm package needed. Wrap in a custom `useWebSocket` React hook that subscribes to events by type.

**Event types to broadcast:**

```typescript
type MarketplaceEvent =
  | { type: 'LISTING_CREATED'; listingId: string; price: string; nftId: string }
  | { type: 'LISTING_SOLD'; listingId: string; buyer: string }
  | { type: 'AUCTION_BID'; auctionId: string; bidder: string; amount: string }
  | { type: 'AUCTION_ENDED'; auctionId: string; winner: string }
  | { type: 'OFFER_RECEIVED'; nftId: string; offerer: string; price: string };
```

**Confidence: HIGH** for WebSockets. **HIGH** for the `@fastify/websocket` choice.

---

## 5. Search & Discovery

### 5.1 Search Strategy

**Decision: PostgreSQL full-text search for MVP. Do not add Elasticsearch or Typesense.**

**Rationale:**
- Typesense and Meilisearch are excellent but add another service to deploy, maintain, and keep in sync
- At Sepolia testnet scale (hundreds of NFTs, not millions), PostgreSQL `tsvector` / `to_tsquery` is more than sufficient
- Portfolio demo benefits from simplicity — the stack is already large
- PostgreSQL GIN indexes on `tsvector` columns provide sub-millisecond full-text search for realistic demo data volumes

**PostgreSQL search implementation:**

```sql
-- Add to NFT-like metadata cache table
ALTER TABLE "CachedNFT" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX ON "CachedNFT" USING GIN(search_vector);

-- Query
SELECT * FROM "CachedNFT"
WHERE search_vector @@ plainto_tsquery('english', $1)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC;
```

**What the backend caches:** NFT metadata from IPFS (name, description, attributes) is fetched once and stored in a `CachedNFT` table in Postgres. This solves the performance bottleneck identified in `CONCERNS.md` (sequential IPFS fetches) and enables full-text search.

**If this project grows beyond portfolio scope:** Typesense `^27.0` or Meilisearch `^1.11` would be the next step. Both have straightforward integration paths.

**Confidence: HIGH** for PostgreSQL FTS at this scale.

---

### 5.2 Filtering & Discovery API Endpoints

Discovery features (trending, recently listed, price range filter, collection filter) are implemented as parameterized Fastify routes querying the Prisma-backed DB:

```
GET /api/nfts?search=dragon&minPrice=0.01&maxPrice=1&collection=0x...&sort=price_asc&page=1
GET /api/nfts/trending         # by sale volume in last 7 days
GET /api/nfts/featured         # curated list (admin-set flag in DB)
GET /api/collections           # list collections with NFT counts
GET /api/users/:address        # public profile + owned/listed NFTs
```

---

## 6. Frontend Additions

### 6.1 Form Handling

**Decision: Add `react-hook-form` + `zod` for the new forms (profile edit, bid submission, offer creation).**

The existing MintForm uses manual state management (`useState` per field). This works for simple forms but does not scale. New forms have more fields and cross-field validation.

| Package | Version | Role |
|---------|---------|------|
| `react-hook-form` | `^7.54.0` | Performant form state management |
| `zod` | `^3.23.0` | Schema validation (shared with backend) |
| `@hookform/resolvers` | `^3.9.0` | Connects zod schemas to react-hook-form |

**Why react-hook-form over Formik:**
- react-hook-form uses uncontrolled inputs — significantly less re-renders
- Formik is older, less idiomatic with React 19 patterns
- Zod schemas can be shared between frontend and backend (monorepo import or copy)

**Confidence: HIGH.**

---

### 6.2 Date/Time Handling

**Decision: `date-fns` v4 for auction countdowns and expiry display.**

| Package | Version | Role |
|---------|---------|------|
| `date-fns` | `^4.1.0` | Date formatting and countdown arithmetic |

**Why date-fns over dayjs or Luxon:**
- Tree-shakeable — only import functions you use
- No prototype mutation (unlike moment.js)
- Excellent TypeScript types
- `formatDistanceToNow()` is perfect for "ends in 2h 34m" displays

**Confidence: HIGH.**

---

### 6.3 Countdown Timers

**Decision: No library. Implement a `useCountdown` custom hook with `setInterval`.**

Auction countdowns need second-level precision. A custom hook is 20 lines and avoids adding a dependency for a single use case.

```typescript
function useCountdown(endTime: number): { hours: number; minutes: number; seconds: number; ended: boolean } {
  const [remaining, setRemaining] = useState(endTime - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(endTime - Date.now()), 1000);
    return () => clearInterval(id);
  }, [endTime]);
  const ended = remaining <= 0;
  return {
    hours: Math.floor(remaining / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1000),
    ended,
  };
}
```

**Confidence: HIGH.**

---

### 6.4 State Management

**Decision: Add `zustand` for global client state. Do not add Redux.**

Current state management is component-local (`useState` / `useEffect`). As profiles, favorites, and auction state span multiple components, a shared store becomes necessary.

| Package | Version | Role |
|---------|---------|------|
| `zustand` | `^5.0.0` | Global client state (wallet, user profile, favorites cache) |

**Why Zustand 5 over Redux Toolkit:**
- Zustand 5 was released October 2024 — fully supports React 19 concurrent features
- Zero boilerplate — no actions, reducers, or dispatch
- Works alongside React Query / Apollo without conflict
- Redux adds concepts (slices, thunks, selectors) that are overhead at this project size

**What goes in the store:**
- `walletSlice` — current account, chain ID, connection status (migrated from `useWallet` hook state)
- `profileSlice` — authenticated user's profile data
- `favoritesSlice` — locally cached favorite NFT IDs for instant UI feedback

**What does NOT go in the store:**
- Server data (listings, auctions, NFT metadata) — stays in Apollo cache / React Query

**Confidence: HIGH.**

---

### 6.5 Data Fetching (Server State)

**Decision: `@tanstack/react-query` v5 for REST API calls. Apollo Client (already decided) for subgraph queries.**

| Package | Version | Role |
|---------|---------|------|
| `@tanstack/react-query` | `^5.62.0` | Data fetching, caching, background refetch for REST API |

**Why two data fetching libraries:**
- Apollo handles GraphQL (subgraph) — its normalized cache is GraphQL-aware and very efficient
- React Query handles REST (backend API for profiles, offers, favorites) — it is not GraphQL-specific
- Mixing concerns into Apollo for REST is awkward; React Query is the best-in-class for REST

**Why not SWR:**
- React Query v5 has better DevTools, more granular cache control, and pagination utilities
- SWR is simpler but React Query's investment pays off as the API surface grows

**Confidence: HIGH.**

---

### 6.6 Wallet / Web3 (No Change)

**Decision: Retain direct ethers.js v6 + custom `useWallet` hook. Do NOT add wagmi or viem.**

**Rationale:** The constraint from `PROJECT.md` is MetaMask only, no WalletConnect. wagmi's primary value is multi-wallet support and chain management. Since neither is needed:
- wagmi adds ~100KB to the bundle for features not used
- The existing `useWallet` hook adequately handles MetaMask connect/disconnect/chain-change
- Refactoring to wagmi is a meaningful engineering decision that would need to be justified to a reviewer — the answer here is: not justified given MetaMask-only constraint

**Confidence: HIGH.**

---

## 7. Deployment & Infrastructure

### 7.1 Backend Hosting

**Decision: Railway for backend API + PostgreSQL.**

**Why Railway over Render/Heroku/Vercel:**
- Supports always-on services (needed for WebSocket server — Vercel serverless does not support persistent WebSocket connections)
- Managed PostgreSQL instance in the same project
- Free trial tier is sufficient for a portfolio demo
- Simple GitHub-connected deployments
- Railway's PostgreSQL supports connection pooling via PgBouncer

**Why not Vercel for backend:**
- Vercel functions are stateless/ephemeral — incompatible with WebSocket connections and the event listener service
- Edge Functions have no Node.js stdlib access (needed for ethers.js provider)

**Confidence: HIGH** for Railway.

---

### 7.2 Frontend Hosting

**Decision: Vercel for React frontend.**

Existing build output to `frontend/dist/` deploys cleanly to Vercel with zero config. Static SPA. Connect GitHub repository, set environment variables, done.

**No new packages.** Vercel CLI (`vercel`) can be added as a devDependency if CI/CD automation is desired.

**Confidence: HIGH.**

---

### 7.3 Subgraph Hosting

**Decision: The Graph Subgraph Studio (free hosted service).**

Sepolia is supported. Deploy with `graph deploy --studio <subgraph-name>`. The query endpoint is a public HTTPS URL that Apollo Client queries directly from the frontend — no backend proxy needed.

**Confidence: HIGH.**

---

### 7.4 Contract Verification

**Decision: Add Etherscan API to Hardhat for contract verification on Sepolia.**

This is required for a portfolio-ready deployment — verified contracts on Sepolia Etherscan show the source code and allow interaction directly from the block explorer.

| Package | Version | Role |
|---------|---------|------|
| `@nomicfoundation/hardhat-verify` | `^2.0.0` | Verify contracts on Etherscan (included in hardhat-toolbox v5) |

`hardhat-toolbox` v5 already includes `hardhat-verify`. Add `ETHERSCAN_API_KEY` to `contracts/.env` and `etherscan` config to `hardhat.config.js`.

**Confidence: HIGH.** Already included in the installed toolchain.

---

## 8. Testing Additions

### 8.1 Contract Tests (Additions)

**No new packages required.** Hardhat Toolbox already provides Chai + Hardhat's testing helpers.

New test files needed:
- `contracts/test/EnglishAuction.test.js` — bid placement, outbid, settlement, cancel
- `contracts/test/DutchAuction.test.js` — price calculation at intervals, purchase
- `contracts/test/OfferManager.test.js` — EIP-712 signature verification, replay protection
- `contracts/test/Royalties.test.js` — `royaltyInfo()` return values, distribution in Marketplace

Use Hardhat's time manipulation for auction tests:
```javascript
await network.provider.send("evm_increaseTime", [3600]); // advance 1 hour
await network.provider.send("evm_mine");
```

**Confidence: HIGH.**

---

### 8.2 Frontend Tests

**Decision: Vitest + React Testing Library + MSW (Mock Service Worker).**

| Package | Version | Role |
|---------|---------|------|
| `vitest` | `^2.1.0` | Test runner (native Vite integration) |
| `@testing-library/react` | `^16.1.0` | Component testing utilities |
| `@testing-library/user-event` | `^14.5.0` | Simulates real user interactions |
| `msw` | `^2.6.0` | Mock backend API calls in tests |
| `@vitest/ui` | `^2.1.0` | Visual test runner UI |
| `jsdom` | `^25.0.0` | DOM environment for Vitest |

**Why Vitest over Jest:**
- Vitest uses the same Vite config — zero additional configuration
- Native ESM support — no transform gymnastics
- Compatible with `@testing-library/react` out of the box

**Why MSW:**
- Intercepts real `fetch` calls at the network layer — tests exercise the actual data fetching code
- Works in Node (tests) and browser (development stubs)

**Confidence: HIGH.**

---

### 8.3 API Tests

**Decision: Vitest for the backend API as well (or Jest — either works for pure Node.js).**

Use `fastify.inject()` for route testing without a real HTTP server. Prisma provides a test database setup with `prisma migrate reset`.

No additional packages beyond what the frontend testing stack already adds.

**Confidence: HIGH.**

---

## 9. Developer Experience

### 9.1 Monorepo Structure

**Decision: npm workspaces (no Turborepo or Nx).**

The project will grow to 3–4 packages: `contracts`, `frontend`, `backend`, `subgraph`. npm workspaces (built into npm 7+) handle shared node_modules hoisting without adding a build orchestration tool.

Add to root `package.json`:
```json
{
  "workspaces": ["contracts", "frontend", "backend", "subgraph"]
}
```

**Why not Turborepo:** Turborepo is valuable at >5 packages or with complex build pipelines. The overhead of learning its configuration is not justified for a 4-package portfolio project.

**Confidence: HIGH.**

---

### 9.2 Code Quality

**Decision: Retain existing ESLint. Add `prettier` for consistent formatting across all packages.**

| Package | Version | Role |
|---------|---------|------|
| `prettier` | `^3.4.0` | Code formatter (root-level, applied to all packages) |
| `eslint-config-prettier` | `^9.1.0` | Disable ESLint rules that conflict with Prettier |

**Confidence: HIGH.**

---

## 10. What NOT to Use (and Why)

| Technology | Why Not |
|------------|---------|
| **wagmi / viem** | MetaMask-only constraint makes wagmi's multi-wallet value proposition irrelevant; ethers.js v6 already in tree |
| **Redux Toolkit** | Over-engineered for this project size; Zustand 5 achieves the same goals with 90% less boilerplate |
| **Socket.IO** | Adds protocol overhead and a large dependency for basic WebSocket broadcasting; `@fastify/websocket` is sufficient |
| **Moralis / Alchemy NFT API** | Proprietary APIs that mask the indexing layer; using The Graph demonstrates deeper Web3 understanding |
| **MongoDB / Atlas** | Document model is a poor fit for the relational user/offer/collection data structure |
| **Elasticsearch** | Massive operational overhead; PostgreSQL FTS is sufficient at demo scale |
| **Typesense / Meilisearch** | Good choice at production scale but adds another service to deploy and keep in sync; overkill here |
| **Turborepo / Nx** | Adds configuration complexity without meaningful benefit at 4-package scale |
| **NestJS** | Framework opinion overhead; Fastify with explicit structure is more readable for portfolio reviewers |
| **Seaport (OpenSea protocol)** | Extremely complex, designed for production scale; defeats the purpose of demonstrating custom auction logic |
| **Solmate** | An alternative to OpenZeppelin but OpenZeppelin v5 is already installed and the team familiar with it |
| **Hardhat Ignition** | Deployment framework (added in recent Hardhat versions); existing deploy scripts are simpler and already working |
| **Next.js** | SSR is unnecessary for a blockchain-connected SPA; the Vite + React 19 constraint is set; migrating would be high risk |
| **Remix (framework)** | Same as Next.js — framework change is out of scope |

---

## 11. Complete Additional Package Inventory

### Contracts (`contracts/package.json`) — additions

```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-verify": "^2.0.0"
  }
}
```
Note: `hardhat-verify` is included in `@nomicfoundation/hardhat-toolbox` v5 already. Just add `ETHERSCAN_API_KEY` config.

### Frontend (`frontend/package.json`) — additions

```json
{
  "dependencies": {
    "@apollo/client": "^3.11.0",
    "@tanstack/react-query": "^5.62.0",
    "@hookform/resolvers": "^3.9.0",
    "date-fns": "^4.1.0",
    "graphql": "^16.9.0",
    "react-hook-form": "^7.54.0",
    "zustand": "^5.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@vitest/ui": "^2.1.0",
    "jsdom": "^25.0.0",
    "msw": "^2.6.0",
    "vitest": "^2.1.0"
  }
}
```

### Backend (`backend/package.json`) — new package

```json
{
  "name": "nft-marketplace-backend",
  "dependencies": {
    "@fastify/cors": "^10.0.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@prisma/client": "^6.3.0",
    "ethers": "^6.13.0",
    "fastify": "^5.2.0",
    "lru-cache": "^11.0.0",
    "siwe": "^2.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "prisma": "^6.3.0",
    "typescript": "~5.7.0",
    "vitest": "^2.1.0",
    "prettier": "^3.4.0"
  }
}
```

### Subgraph (`subgraph/package.json`) — new package

```json
{
  "name": "nft-marketplace-subgraph",
  "devDependencies": {
    "@graphprotocol/graph-cli": "^0.91.0",
    "@graphprotocol/graph-ts": "^0.35.1"
  }
}
```

### Root (`package.json`) — new file

```json
{
  "name": "nft-marketplace",
  "private": true,
  "workspaces": ["contracts", "frontend", "backend", "subgraph"],
  "devDependencies": {
    "prettier": "^3.4.0",
    "eslint-config-prettier": "^9.1.0"
  }
}
```

---

## 12. Confidence Summary

| Decision | Confidence | Risk |
|----------|-----------|------|
| ERC-2981 via OZ ERC721Royalty | HIGH | None — already in installed tree |
| Custom auction contracts (no lib) | HIGH | Implementation complexity, needs thorough testing |
| EIP-712 offer signatures | HIGH | Signing UX can be confusing; needs clear UI |
| The Graph Protocol (Subgraph Studio) | MEDIUM-HIGH | graph-cli/graph-ts versions need verification; Sepolia free tier availability confirmed in 2025 |
| Apollo Client v3 | HIGH | Well-tested with React 19 |
| Fastify 5 backend | HIGH | Stable release; excellent TS support |
| PostgreSQL 16 + Prisma 6 | HIGH | Prisma 6 minor version needs verification |
| Railway hosting | HIGH | Confirmed WebSocket support; free trial covers demo |
| Zustand 5 | HIGH | Released Oct 2024; React 19 compatible |
| React Query v5 | HIGH | Stable, excellent TS types |
| WebSockets via @fastify/websocket | HIGH | No third-party protocol layer needed |
| Vitest + RTL + MSW | HIGH | Standard 2025 Vite testing stack |
| PostgreSQL FTS (no Typesense) | HIGH | Correct call at demo scale; easy to upgrade |
| npm workspaces (no Turborepo) | HIGH | Sufficient for 4-package monorepo |
| SIWE authentication | HIGH | EIP-4361 standard, stable `siwe` package |

---

## 13. Version Verification Checklist

The following versions should be confirmed with `npm info <package> version` before pinning in `package.json`. Versions above are based on knowledge through August 2025 and the known 2024/2025 release trajectory.

- [ ] `@graphprotocol/graph-cli` — expect ~0.91.x
- [ ] `@graphprotocol/graph-ts` — expect ~0.35.x
- [ ] `fastify` — expect ~5.2.x
- [ ] `@fastify/websocket` — expect ~11.x
- [ ] `@fastify/jwt` — expect ~9.x
- [ ] `@prisma/client` — expect ~6.3.x
- [ ] `zustand` — expect ~5.0.x
- [ ] `@tanstack/react-query` — expect ~5.62.x
- [ ] `siwe` — expect ~2.3.x
- [ ] `date-fns` — expect ~4.1.x
- [ ] `msw` — expect ~2.6.x
- [ ] `vitest` — expect ~2.1.x

---

*Research completed: 2026-02-21. Based on direct codebase analysis of existing MVP and knowledge of ecosystem state through 2025.*
