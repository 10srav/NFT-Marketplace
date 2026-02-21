# Project Research Summary

**Project:** NFT Marketplace — Milestone 2 (Full-Featured)
**Domain:** Web3 / NFT Marketplace (Sepolia testnet, portfolio-ready)
**Researched:** 2026-02-21
**Confidence:** HIGH

---

## Executive Summary

This project extends an existing ERC721 fixed-price marketplace MVP into a full-featured NFT platform with English/Dutch auctions, ERC-2981 royalties, an off-chain offer system, creator collections via a factory contract, user profiles, subgraph indexing, a backend API, WebSocket real-time updates, and advanced search and discovery. The existing stack (Solidity 0.8.20 + OpenZeppelin v5, React 19 + TypeScript + Vite 6, ethers.js v6, Ant Design 5, Pinata IPFS, Hardhat) is a solid foundation, and all new features are additive rather than requiring a rewrite. The recommended approach is to layer new components in strict dependency order: contracts first, then indexer, then backend API, then WebSocket server, then frontend integration — deviating from this order creates either integration failures or throwaway work.

The most important architectural decision is the separation of concerns across five distinct layers: on-chain contracts (source of truth for ownership and financial transactions), an indexer (The Graph subgraph for historical queryability), a backend API (Node.js + Fastify 5 + PostgreSQL 16 + Prisma 6 for off-chain data), a WebSocket layer (real-time event push), and the React frontend (consumer only, never source of truth). This layering eliminates the existing MVP's primary pain points — O(N) sequential RPC calls, no real-time updates, and no off-chain social data — without overcomplaining the stack. Critically, the backend must function as a read accelerator and off-chain data store only; on-chain state (whether a listing is purchasable, what the current auction price is) must always be verified against the contract before any financial action.

The principal risks are concentrated at the smart contract layer: reentrancy in auction bid refunds, NFT escrow-vs-approval ambiguity, royalty enforcement that must be added manually to every settlement path, and state divergence between the subgraph and chain reality. All of these have well-understood prevention patterns documented in the research and are avoidable with careful contract design and thorough Hardhat testing before deployment. The subgraph integration introduces a second cluster of risk around keeping index addresses synchronized with contract redeployments — the mitigation is a single-source-of-truth `deployments/sepolia.json` file read by both the frontend and `subgraph.yaml`.

---

## Key Findings

### Recommended Stack

The existing stack requires no fundamental changes — all additions are new packages and new services layered on top. The smart contract layer adds no new npm packages; OpenZeppelin v5 already ships `ERC721Royalty`, `EIP712`, `ECDSA`, and `ReentrancyGuard`. Custom `EnglishAuction.sol` and `DutchAuction.sol` contracts are the right call — no audited third-party auction library exists for OZ v5, and writing them demonstrates engineering skill.

For the off-chain layer: Fastify 5 (not Express) as the backend framework, PostgreSQL 16 + Prisma 6 ORM for the database, and The Graph Protocol (Subgraph Studio, Sepolia free tier) for indexing. Apollo Client v3 queries the subgraph from the frontend; React Query v5 handles REST API calls; Zustand 5 manages global client state. WebSockets via `@fastify/websocket` replace the need for Socket.IO. SIWE (EIP-4361) handles wallet-based authentication — no passwords. Redis is deliberately omitted in favor of an in-process LRU cache, keeping deployment simple without sacrificing portfolio scope.

**Core technologies:**
- **ERC721Royalty (OZ v5):** ERC-2981 royalties — already in the installed tree, zero new packages
- **Custom AuctionHouse.sol:** English + Dutch auctions — no viable third-party library; custom demonstrates skill
- **CollectionFactory.sol (EIP-1167 clones):** Creator collections — gas-efficient, each collection gets its own address for subgraph entity isolation
- **The Graph (Subgraph Studio):** Event indexing — industry standard, free Sepolia tier, GraphQL API
- **Fastify 5 + Node.js 22 LTS:** Backend API — built-in TypeScript, schema validation, faster than Express
- **PostgreSQL 16 + Prisma 6:** Off-chain data — relational model fits profiles/offers/favorites; full-text search via tsvector eliminates a separate search service
- **Apollo Client v3 + React Query v5:** Frontend data fetching — Apollo for GraphQL (subgraph), React Query for REST (backend API)
- **Zustand 5:** Global client state — zero boilerplate, React 19 compatible, replaces the need for Redux
- **SIWE (EIP-4361):** Authentication — wallet-native, no passwords, standard Web3 pattern
- **Railway:** Backend hosting — supports persistent WebSocket connections (Vercel does not)
- **Vitest + React Testing Library + MSW:** Frontend testing — native Vite integration, no Jest config

**What to avoid:**
- wagmi/viem — MetaMask-only constraint makes multi-wallet abstraction irrelevant; adds 100KB for features unused
- Socket.IO — protocol overhead unnecessary for this broadcast-only use case
- Redux Toolkit — 90% more boilerplate than Zustand for the same outcome at this project size
- MongoDB — poor fit for the relational user/offer/collection data shape
- Typesense/Elasticsearch — operational overhead unjustified at testnet demo scale; PostgreSQL FTS is sufficient
- Turborepo/Nx — configuration overhead not justified for a 4-package monorepo
- Seaport (OpenSea protocol) — far too complex; defeats the purpose of demonstrating custom auction logic
- Lazy minting — gas optimization irrelevant on Sepolia testnet; complex EIP-712 voucher flow for zero user benefit

See `STACK.md` for complete package inventories per workspace.

---

### Expected Features

All research files agree on a four-phase feature delivery model ordered by dependencies. The dependency graph is clear and non-negotiable: royalties must precede auctions (settlement must pay royalties); contracts must precede the subgraph (which indexes their events); the subgraph must precede the backend (which queries it); the backend must precede the WebSocket server (which uses its DB); everything must precede full frontend integration.

**Must have (table stakes) — missing these makes the platform feel unfinished:**
- ERC-2981 royalties — a 20-line contract change with major conceptual weight; skipping this signals not understanding the space
- Real-time updates — removing `window.location.reload()` and replacing with WebSocket-driven state is the most impactful UX improvement
- User profiles — off-chain, keyed by wallet address, authenticated via SIWE; even localStorage is acceptable for the demo but backend persistence is the target
- Improved search and discovery — price range filter and collection filter are table stakes; trait filter and sort-by-sold require the subgraph
- NFT detail page enhancements — attributes display (UI only), price/transfer history (requires subgraph)

**Should have (differentiators — move from homework to portfolio piece):**
- English auctions — high complexity but the defining feature of a real marketplace; demonstrates understanding of pull-payment security model
- Dutch auctions — medium complexity, builds on auction patterns, clearly demonstrates price curve mechanics
- Creator collections (factory pattern) — architecturally impressive, demonstrates EIP-1167 clones, enables per-collection royalty rates
- Offer / negotiation system — demonstrates EIP-712 off-chain signing and cross-contract state management
- Subgraph indexing — what production marketplaces actually use; shows production-level thinking vs. naive chain polling
- Favorites / watchlist — low complexity social feature, enabled by backend API

**Defer (out of scope, confirmed anti-features):**
- Lazy minting / bulk minting — gas optimization irrelevant on testnet; EIP-712 voucher complexity for zero user benefit
- ERC-1155 multi-edition support — requires significant contract and UI refactoring; ERC-721 is sufficient for portfolio
- Token-gated content / access control — orthogonal to marketplace mechanics; distraction
- In-app chat / messaging — separate product category; no marketplace value at this scope
- DAO governance — disproportionate for a student project; may signal poor scope judgment to interviewers
- Cross-marketplace bid aggregation — no meaningful Sepolia liquidity on external platforms; would be fake data

See `FEATURES.md` for detailed dependency maps and complexity ratings.

---

### Architecture Approach

The target architecture is a five-layer system with strict boundary enforcement. Each layer has a single source of authority and communicates through defined interfaces only. The most critical rule: the blockchain is the authority for all financial state — the backend is a read accelerator and off-chain data store, never a decision-maker for whether a purchase can succeed. Violating this rule (P-14) causes sold listings to appear purchasable.

**Major components:**
1. **Smart Contract Layer** (Sepolia) — NFTContract (ERC721 + ERC2981), Marketplace (fixed-price + acceptOffer), AuctionHouse (English + Dutch), CollectionFactory (EIP-1167 clones). Single responsibility per contract; they communicate only via ERC-standard interfaces and events. No proxy patterns needed — plan for full redeployment when contracts change.
2. **Indexer Layer** (The Graph Subgraph Studio) — Listens to all four contract event streams; builds queryable GraphQL entity store (Token, Listing, Auction, Bid, Offer, Collection, Account). Provides ~2-5 block lag on updates; does not handle off-chain data or real-time push.
3. **Backend API Layer** (Node.js/Fastify on Railway) — REST API backed by PostgreSQL. Two data sources: subgraph (on-chain state queries) and its own DB tables (profiles, favorites, offer signatures, metadata cache). Authoritative for all off-chain data. Does NOT submit transactions.
4. **WebSocket Layer** (socket.io within same Fastify process) — Room-based push: `auction:{id}`, `token:{tokenId}`, `account:{address}`, `global:listings`. Receives events from server-side ethers.js listeners and broadcasts lightweight notifications. Frontend re-fetches full entities from REST after receiving notifications.
5. **Frontend Layer** (React 19 + Vite on Vercel) — Consumer of all above layers. Writes go directly to the chain via MetaMask; reads come from the backend API and subgraph. No longer polls the chain for marketplace state.

**Key interfaces that must stay stable once established:**
- AuctionHouse ABI event signatures (producer: contracts; consumers: frontend, backend, subgraph)
- Subgraph GraphQL schema (producer: subgraph; consumer: backend API)
- REST API contract `/api/v1/...` (producer: backend; consumer: frontend `api.ts`)
- WebSocket event names (producer: backend; consumer: frontend `ws.ts`)
- EIP-712 domain separator (must match exactly between Marketplace.sol, backend verification, and frontend signing)

See `ARCHITECTURE.md` for data flow diagrams and the complete 23-step build sequence.

---

### Critical Pitfalls

The research identified 27 pitfalls across all phases. The following 7 are HIGH severity and must be addressed before the relevant phase begins:

1. **Auction bid reentrancy (P-04)** — Never push ETH back to the previous bidder inside `bid()`. Use the pull-payment pattern: `mapping(address => uint256) pendingWithdrawals` + separate `withdrawBid()` function. OpenZeppelin's `PullPayment` contract implements this. Violation allows a malicious bidder contract to block all future bids.

2. **NFT escrow model for auctions (P-05)** — For time-delayed auctions, transfer the NFT into the auction contract at `createAuction()` time (escrow), not at settlement. The approval-at-listing-time model used in the existing fixed-price Marketplace is fragile for auctions — the seller can revoke approval between bid placement and settlement. Bidders deserve certainty the NFT is locked.

3. **ERC-2981 not enforced by default (P-07)** — ERC-2981 is an *information* standard only. Every settlement path — `buyItem()`, `settleAuction()`, and `acceptOffer()` — must explicitly call `royaltyInfo()` and distribute the royalty amount. Forgetting auction settlement is the most common omission. Write a test: mint with 10% royalty, sell, assert creator received exactly 10%.

4. **Non-upgradeable contract migration (P-21)** — The existing Marketplace.sol is not upgradeable. Adding royalties requires redeployment. Plan for this explicitly: deploy all new contracts in a single script, maintain `deployments/sepolia.json` as the single source of truth for addresses, update `contracts.ts`, and update `subgraph.yaml` data sources with new addresses and `startBlock`.

5. **Subgraph stale after redeployment (P-10)** — Every contract redeployment must be followed immediately by updating `subgraph.yaml` address and `startBlock`, then redeploying the subgraph. Automate this with a combined deploy script. A subgraph pointing to the old contract address returns empty data while appearing to function correctly — a nearly invisible debugging trap.

6. **Backend cache becomes source of truth (P-14)** — The backend must never be the authority for whether a listing is purchasable or an auction is winnable. Only call the contract's view function before initiating any financial transaction. Apply 30-second TTLs to all listing/auction state caches. The frontend must invalidate its local cache after any successful transaction.

7. **Accepted offer leaves stale listing (P-27)** — If an NFT is listed at 1 ETH and a buyer's 0.8 ETH offer is accepted via the offer contract, the marketplace listing is never cancelled unless `acceptOffer()` explicitly unlist it. The marketplace page will show the NFT as purchasable after it is already sold. Test explicitly: list, make offer, accept offer, verify listing is inactive.

See `PITFALLS.md` for all 27 pitfalls with warning signs, prevention strategies, and phase assignments.

---

## Implications for Roadmap

All three research files (FEATURES.md, ARCHITECTURE.md, PITFALLS.md) independently converge on the same phase structure and ordering. This is strong signal that the dependency graph is real and the order matters.

### Phase 1: Contract Foundation + MVP Bug Fixes

**Rationale:** Everything else — the subgraph, the backend, the frontend hooks — depends on stable contract ABIs and deployed addresses. Fixing the three existing MVP bugs (reload-on-buy, dashboard stats hardcoded, sequential metadata fetches) in this phase prevents them from blocking WebSocket integration later. All royalty, auction, and offer contracts must be deployed before the subgraph can index their events.

**Delivers:** Stable, feature-complete smart contract layer. No more breaking ABI changes after this phase.

**Addresses:** ERC-2981 royalties (table stakes), auction contracts (differentiators), collection factory (differentiator), offer acceptance in Marketplace (partial offer system).

**Avoids:** P-04 (pull-payment for bids), P-05 (NFT escrow in auctions), P-07 (royalties enforced in ALL settlement paths), P-09 (royalty + commission cap), P-21 (plan redeployment of Marketplace), P-22 (ERC-2981 interface guard for old NFTs), P-25 (use EnumerableSet not O(n) array in auctions).

**Prerequisite fixes:** Remove all `window.location.reload()` calls (P-24) and fix the sequential metadata fetch with `Promise.allSettled()` (P-23) before auction UI development begins.

---

### Phase 2: Subgraph Indexing

**Rationale:** The backend's primary read path delegates to the subgraph. Building the backend before the subgraph forces temporary direct-RPC reads that must later be replaced — throwaway work. The subgraph schema defines the entity shapes that the backend's GraphQL client consumes, making it a hard upstream dependency.

**Delivers:** A queryable GraphQL entity store for all on-chain events. Marketplace grid load drops from O(N) RPC calls to a single GraphQL query.

**Addresses:** Search & discovery (sort-by-recently-sold, trait filters), user profile stats, auction bid history, collection analytics — all powered by subgraph queries.

**Uses:** `@graphprotocol/graph-cli` (~0.91.x), `@graphprotocol/graph-ts` (~0.35.x), The Graph Subgraph Studio (Sepolia free tier).

**Avoids:** P-10 (automated subgraph address update on every redeployment), P-11 (all four contracts as explicit data sources in `subgraph.yaml`), P-12 (symmetric event handler pairs: ItemListed/ItemSold, AuctionCreated/AuctionSettled), P-13 (prefer separate contracts over modified ones to avoid ABI mismatch).

---

### Phase 3: Backend API

**Rationale:** The backend is the integration hub for all off-chain data and the prerequisite for the WebSocket server (which needs the database and the subgraph client to already exist). REST routes that delegate to the subgraph must be stable before the frontend switches its data fetching from direct RPC calls.

**Delivers:** Persistent user profiles, favorites, offer signature storage, NFT metadata cache, full-text search, paginated discovery API. Resolves the existing O(N) IPFS sequential fetch problem permanently.

**Uses:** Fastify 5, Node.js 22 LTS, PostgreSQL 16 + Prisma 6, SIWE (EIP-4361), `@fastify/jwt`, `@fastify/swagger`, `lru-cache`, Railway deployment.

**Avoids:** P-14 (backend is read accelerator only, never financial authority), P-15 (retry + fallback for IPFS cache population — never cache failures), P-18 (SIWE authentication required for all profile write operations), P-19 (background indexer for full-text search; never query subgraph for text search — it does not support it).

---

### Phase 4: WebSocket Real-Time Updates

**Rationale:** WebSocket runs within the same Fastify process as the REST API but requires the REST routes and the server-side ethers.js event listeners to exist first. This is also the phase where the existing `window.location.reload()` pattern must be fully eliminated — the two changes are directly interdependent.

**Delivers:** Live auction bid display, live marketplace listing updates, real-time offer notifications, transaction progress feedback (submitted → mining → confirmed).

**Uses:** `@fastify/websocket` (~11.x), server-side ethers.js `JsonRpcProvider` + Alchemy WebSocket URL, browser native `WebSocket` API (no client library needed).

**Avoids:** P-16 (wait 1 block confirmation before broadcasting events — mark UI as "pending" not "confirmed"), P-17 (global singleton WebSocket connection in React context; cleanup functions in every `useEffect` that subscribes), P-24 (complete removal of `window.location.reload()` as prerequisite).

---

### Phase 5: Frontend Integration + Discovery + Polish

**Rationale:** The frontend is the consumer of all four upstream layers. Connecting before the backend and subgraph are stable leads to stubs that must be removed. This is also the phase where the auction, collection, offer, and profile UIs are built.

**Delivers:** Complete user-facing feature set. Auction UI (countdown timers, bid history, settlement), collection pages, offer panel, profile pages, enhanced search with price/collection/trait filters.

**Uses:** Apollo Client v3 (subgraph queries), React Query v5 (REST API calls), Zustand 5 (global wallet/profile/favorites state), `react-hook-form` + `zod` (forms), `date-fns` v4 (countdown arithmetic), Vitest + RTL + MSW (testing).

**Avoids:** P-20 (search index must update on ItemSold/ItemUnlisted events; add `status` field to search documents), P-27 (offer acceptance must cancel active listings; test the cross-contract state explicitly).

---

### Phase Ordering Rationale

- **Contracts before everything:** The subgraph's `subgraph.yaml`, backend's ABIs, and frontend's contract instances all depend on stable deployed addresses. One contract redeployment invalidates all downstream configuration; do it once.
- **Subgraph before backend:** The backend's primary read path for on-chain state is GraphQL queries to the subgraph. Building REST routes before the subgraph exists forces temporary direct-RPC reads that create throwaway code.
- **Backend before WebSocket:** The WebSocket server uses the backend's database and event listener infrastructure. Both must exist before room-based push can work.
- **Everything before frontend integration:** The frontend is a pure consumer. Wiring hooks to unstable upstream APIs creates stubs that must be unwired and rewired — the most common source of wasted time in full-stack Web3 projects.
- **Bug fixes before new features:** The `window.location.reload()` pattern (P-24) and O(N) sequential fetch (P-23) are directly incompatible with the WebSocket and backend layers respectively. Fix them in Phase 1 to avoid contradictory behavior later.

---

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (Subgraph):** AssemblyScript mapping handlers are niche; The Graph's documentation is the primary source. Verify `@graphprotocol/graph-cli` and `@graphprotocol/graph-ts` current versions with `npm info` before pinning. The dynamic template pattern for factory-deployed collection contracts needs careful schema design.
- **Phase 4 (WebSocket):** The interaction between chain reorganizations and WebSocket event broadcasting (P-16) needs explicit test design — write the test scenario before implementing the listener.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Contracts):** ERC-2981, English/Dutch auction patterns, EIP-712 offer signatures, and EIP-1167 clones are all well-documented in OpenZeppelin and Ethereum Improvement Proposals. The pull-payment pattern is textbook.
- **Phase 3 (Backend API):** Fastify 5, Prisma 6, SIWE, and PostgreSQL full-text search are all well-documented with extensive examples. Standard REST API patterns apply.
- **Phase 5 (Frontend):** Apollo Client, React Query, Zustand, and react-hook-form are mature libraries with excellent documentation. The auction countdown timer is a custom 20-line hook with no library needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All major decisions backed by official docs and OZ v5 being already installed. Only gap: graph-cli/graph-ts exact minor versions need `npm info` verification. Fastify 5 and Prisma 6 minor versions also need confirmation. |
| Features | HIGH | Dependency map is internally consistent across all three other research documents. Feature tiers are well-reasoned with clear "why not" rationale for anti-features. |
| Architecture | HIGH | Five-layer boundary model matches production NFT marketplace patterns (The Graph + backend + contracts). Data flow diagrams are consistent with the stack decisions. |
| Pitfalls | HIGH | 27 pitfalls identified with specific prevention strategies. All HIGH-severity pitfalls have established solutions (OZ PullPayment, ERC165 interface checks, pull-payment pattern). |

**Overall confidence:** HIGH

### Gaps to Address

- **graph-cli / graph-ts versions:** Research estimates `~0.91.x` / `~0.35.x`. Verify with `npm info @graphprotocol/graph-cli version` and `npm info @graphprotocol/graph-ts version` before Phase 2 begins. Stale versions can break `graph codegen`.
- **Fastify 5 minor version:** Estimated `~5.2.x`. Verify with `npm info fastify version`. Fastify plugin version compatibility (`@fastify/websocket`, `@fastify/jwt`) is tightly coupled to the Fastify major version — all must be v5-compatible.
- **Prisma 6 minor version:** Estimated `~6.3.x`. Verify with `npm info prisma version`. Prisma 6 introduced the Rust query engine; verify Railway's Node.js runtime supports the binary target.
- **Subgraph template pattern for factory contracts:** The collection factory deploys individual ERC721 clone contracts per collection. The subgraph's dynamic `templates` feature (vs. static `dataSources`) must be designed correctly before Phase 2 begins — this cannot be easily retrofitted.
- **Existing contract backward compatibility:** NFTs minted on the old `NFTContract.sol` (without ERC-2981) will remain in user wallets after the contract is redeployed. The ERC165 interface guard (P-22) handles royalty calls gracefully, but the Dashboard's `ownerOf` enumeration must handle both old and new contract addresses. This needs an explicit decision in Phase 1 planning.

---

## Sources

### Primary (HIGH confidence)
- OpenZeppelin v5 contracts repository — ERC721Royalty, ERC2981, EIP712, ECDSA, ReentrancyGuard, EIP-1167 clones
- The Graph Protocol documentation — Subgraph Studio, AssemblyScript mappings, dynamic templates, Sepolia support
- EIP-2981 (ERC-2981) specification — royalty standard interface and enforcement model
- EIP-4361 (SIWE) specification + `siwe` npm package — wallet authentication pattern
- EIP-712 specification — typed structured data signing for off-chain offers
- Fastify v5 documentation — framework, plugins, TypeScript support
- Prisma v6 documentation — ORM, migration system, Rust query engine
- Apollo Client v3 documentation — React hooks, normalized cache, React 19 compatibility

### Secondary (MEDIUM confidence)
- @tanstack/react-query v5 documentation — data fetching patterns, devtools
- Zustand v5 documentation — store design, React 19 concurrent features compatibility
- Railway documentation — WebSocket support, PostgreSQL managed instances, free tier availability
- date-fns v4 documentation — tree-shaking, `formatDistanceToNow` for countdowns

### Tertiary (requires verification)
- graph-cli ~0.91.x / graph-ts ~0.35.x version estimates — based on 2025 release trajectory; verify before use
- Fastify ~5.2.x / @fastify/websocket ~11.x version estimates — verify before pinning
- Prisma ~6.3.x version estimate — verify Railway binary target support before pinning

---

*Research completed: 2026-02-21*
*Ready for roadmap: yes*
