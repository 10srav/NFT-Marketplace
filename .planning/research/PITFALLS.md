# NFT Marketplace — Pitfalls Research

**Scope:** Adding English/Dutch auctions, ERC-2981 royalties, offer system, user profiles,
creator collections, favorites, subgraph indexing, backend API, WebSocket real-time updates,
and search to an existing ERC721 + fixed-price marketplace MVP on Sepolia.

**Format per pitfall:** What goes wrong → Warning signs → Prevention strategy → Phase

---

## Section 1: Auction Mechanics

### P-01 — Block Timestamp as Auction Clock

**What goes wrong:** English and Dutch auction contracts use `block.timestamp` for deadline
enforcement. Miners (validators on PoS) can shift `block.timestamp` up to roughly 12 seconds
in either direction. For Dutch auctions with a price curve computed as
`startPrice - (elapsed / duration) * (startPrice - endPrice)`, even a 30-second drift
compounded across a 24-hour auction changes the effective price noticeably. More critically,
a last-second English auction bid can appear valid on-chain even though the user's UI showed
the timer as expired.

**Warning signs:**
- Frontend timer and contract-reported `block.timestamp` diverge by more than a few seconds
- Users complain they placed a bid "in time" but the tx reverted
- Dutch auction price shown in UI differs from what the contract charges on purchase

**Prevention strategy:**
- Accept the ±12 second variance as the design constraint; build a grace buffer into the UI
  (show countdown stopping 15 seconds before true deadline, label it clearly)
- In the auction contract, enforce `block.timestamp < auctionEndTime` with no tighter precision
- Never derive price display from the frontend clock alone; always call the contract's view
  function (e.g., `getCurrentPrice()`) and display that authoritative value
- For English auctions, include a time-extension mechanic (last bid within N seconds extends
  the auction by N seconds) to prevent sniping, which also reduces the timestamp-window problem

**Phase:** Smart contract design (before writing auction contracts)

---

### P-02 — Dutch Auction Price Precision and Integer Division

**What goes wrong:** Solidity integer division truncates. A Dutch auction price curve
`startPrice - ((block.timestamp - startTime) * priceRange / duration)` loses wei-level
precision. At typical ranges (e.g., 1 ETH → 0.1 ETH over 24 hours), the price drops in
discrete steps rather than a smooth curve, creating predictable "jump moments" that bots
can exploit. If `duration` is small or `priceRange` is large in wei, the drops are large
and visible.

**Warning signs:**
- Dutch auction price steps are larger than expected (e.g., 0.01 ETH jumps instead of gradual)
- Bots cluster transactions at each step-change block
- Unit tests using exact intermediate prices fail unexpectedly

**Prevention strategy:**
- Multiply numerator by a precision factor (e.g., 1e18) before dividing, then divide the result
  back: `startPrice - ((elapsed * priceRange * 1e18 / duration) / 1e18)` — though Solidity
  arithmetic still truncates, this brings precision to 1 wei rather than large steps
- In the specific context of this project (Sepolia testnet, portfolio scope), use reasonable
  price ranges (0.1 ETH to 0.001 ETH) that keep discrete steps imperceptibly small
- Add a `getCurrentPrice()` view function in the contract and always call it from the frontend
  instead of replicating the formula in TypeScript

**Phase:** Smart contract design (before writing auction contracts)

---

### P-03 — Auction Settlement Requires a Transaction, Not Just Time Passing

**What goes wrong:** A common assumption is that an auction "ends" when the timer expires.
On-chain, nothing happens automatically. The NFT stays locked in the auction contract until
someone calls `settleAuction()` (or equivalent). If neither the seller nor the highest bidder
calls it, the NFT and ETH remain locked indefinitely. This is especially bad if the contract
holds the NFT in escrow: the NFT is neither tradeable nor returnable.

**Warning signs:**
- Auction UI shows "Ended" but no settlement button is visible, or settlement tx is never prompted
- ETH bids stuck in contract because `settleAuction()` was never called
- Users think they won but never received the NFT

**Prevention strategy:**
- For English auctions: make `settleAuction()` callable by either the seller or the highest
  bidder after the deadline — incentivize the winner to call it (they want their NFT)
- Add a time-lock safeguard: if auction is not settled within X days after end, allow the
  seller to reclaim the NFT and all bidders to withdraw their ETH independently
- In the frontend, show a prominent "Claim Your NFT" CTA to the winner immediately when
  `block.timestamp >= auctionEndTime && highestBidder == userAddress`
- Implement a pull-payment pattern for losing bidders so they can withdraw ETH at any time,
  not just at settlement

**Phase:** Smart contract design + frontend auction detail page

---

### P-04 — Outbid ETH Not Immediately Returned (Reentrancy Risk)

**What goes wrong:** A naive English auction design sends ETH back to the previous highest bidder
inside the `bid()` function (`previousBidder.transfer(previousBid)`). This is vulnerable to
reentrancy if the previous bidder is a contract. Even with OpenZeppelin's `ReentrancyGuard`,
using `.transfer()` inside the bid loop is considered an anti-pattern and can cause gas
griefing (the refunded contract reverts, causing the entire bid transaction to fail).

**Warning signs:**
- Bidding reverts when the previous bidder was a contract address
- Gas usage of `bid()` scales with the number of bids
- Re-entrancy guard is present but `transfer()` is used in the same function as state changes

**Prevention strategy:**
- Use the pull-payment (withdrawal) pattern: store each bidder's refundable amount in a
  `mapping(address => uint256) public pendingWithdrawals` and emit a `BidOutbid` event
- Provide a separate `withdrawBid()` function for losing bidders to pull their ETH
- Only execute the push to the previous bidder if using `call{value}("")`, and only after
  all state changes are complete (Checks-Effects-Interactions)
- Reference: OpenZeppelin's `PullPayment` contract already implements this pattern

**Phase:** Smart contract design (before writing auction contracts)

---

### P-05 — NFT Escrow Approval vs. Transfer Model

**What goes wrong:** Two common auction designs exist: (A) seller approves the auction contract
and the contract transfers on settlement, or (B) seller transfers the NFT to the auction contract
at auction creation. Design A is fragile: the seller can revoke approval or transfer the NFT
between listing and settlement, leaving bidders with a winning bid on a token the contract can
no longer transfer. This project's existing Marketplace already has this approval-fragility for
fixed-price listings (the seller can transfer the NFT out after listing).

**Warning signs:**
- Seller transfers NFT between auction creation and settlement → winner bid reverts at settlement
- `getApproved()` returns zero address during settlement but bid was accepted at listing time
- Test: list, transfer NFT out, attempt to settle → should fail but settlement may succeed
  if you haven't added the approval check at settlement time

**Prevention strategy:**
- For auctions specifically, use escrow-transfer (design B): transfer the NFT into the
  auction contract at `createAuction()` time, not at settlement
- This eliminates the approval-revocation window and gives bidders certainty the NFT is locked
- The existing `Marketplace.sol` fixed-price approach (approval at list time) is acceptable for
  instant sales but not for time-delayed auctions
- Add an integration test that explicitly revokes approval between listing and settlement

**Phase:** Smart contract design; also relevant when auditing existing listing contract

---

### P-06 — Dutch Auction and the Simultaneous-Buy Race Condition

**What goes wrong:** A Dutch auction has one winner — the first buyer at the current price. If
two users simultaneously submit `buyDutchAuction()` transactions in the same block, only one
can succeed; the other loses gas. However, the real risk is front-running: MEV bots watch the
mempool, see a pending buy at the current price, and submit a higher-gas transaction to steal
the purchase. On Sepolia testnet this is low risk, but the contract must still handle the
"second buyer in same block" case correctly (the second tx should revert cleanly, not drain ETH).

**Warning signs:**
- Both buyers receive a success toast but only one receives the NFT
- ETH is deducted from both wallets but NFT was only transferred once
- `auction.sold` or `auction.active` flag is not set atomically before transfer

**Prevention strategy:**
- Set the auction to inactive as the very first state change in the purchase function
  (Checks-Effects-Interactions: mark sold before any transfer)
- Add `require(!auction.sold, "Already sold")` as the first check
- Refund excess ETH via pull-payment if buyer sent more than `getCurrentPrice()`
- On Sepolia testnet, Sepolia validators do not run MEV bots, so this is primarily a
  correctness concern, not a live attack vector — but write the code correctly anyway

**Phase:** Smart contract design; test with two concurrent buy transactions in Hardhat

---

## Section 2: ERC-2981 Royalties

### P-07 — Royalties Are Not Automatically Enforced On-Chain

**What goes wrong:** ERC-2981 is an *information* standard: `royaltyInfo(tokenId, salePrice)`
returns `(receiver, royaltyAmount)`. It does not enforce collection. Every marketplace that
processes a sale must choose to call `royaltyInfo()` and distribute the royalty. If the
`Marketplace.sol` `buyItem()` function is not updated to call `royaltyInfo()`, royalties will
never be paid even if the NFT contract fully implements ERC-2981. This is the source of real-
world royalty bypass on OpenSea competitors.

**Warning signs:**
- `NFTContract.sol` implements `ERC2981` but `Marketplace.sol` `buyItem()` has no royalty
  distribution logic
- Sales complete and only the marketplace commission (2.5%) is deducted — royalty receiver
  gets nothing
- `supportsInterface(0x2a55205a)` returns true on the NFT contract but is never checked
  in marketplace

**Prevention strategy:**
- In `Marketplace.sol` `buyItem()`, after commission calculation, call
  `IERC2981(listing.nftContract).royaltyInfo(listing.tokenId, listing.price)` if the
  contract supports the interface (check with `ERC165Checker.supportsInterface()`)
- Deduct the royalty from seller proceeds: `sellerProceeds = price - commission - royaltyAmount`
- Cap royalty + commission to prevent exceeding sale price (e.g., require total deductions < 90%)
- Add the same royalty logic to auction settlement (`settleAuction()`) — it is easy to add
  royalties to `buyItem()` and forget auction settlement
- Write a test: mint with 10% royalty → sell → assert royalty receiver got exactly 10% of price

**Phase:** Royalty phase; also audit auction settlement during that same phase

---

### P-08 — Royalty Receiver Is Set at Mint Time and May Become Stale

**What goes wrong:** OpenZeppelin's `ERC2981` stores royalty info per token or per contract.
If the creator's wallet is compromised or they change wallets, the royalty receiver address
becomes incorrect. More commonly in the project context: if the `NFTContract.sol` constructor
sets a default royalty to `msg.sender` (the deployer address), all NFTs in that contract
share the same royalty receiver — the deployer, not the individual creators who mint later.

**Warning signs:**
- All royalties flow to the contract deployer regardless of who minted the NFT
- `_setDefaultRoyalty()` is called in the constructor with `msg.sender` and never updated
- Creators who mint NFTs cannot update their own royalty receiver

**Prevention strategy:**
- Use per-token royalty setting: call `_setTokenRoyalty(tokenId, creator, royaltyBps)` inside
  `mintNFT()` using `msg.sender` as the creator, so each token's royalty is tied to its minter
- If collections are supported, allow collection owners to update the royalty receiver for their
  tokens (gated by access control, not open to anyone)
- Do not call `_setDefaultRoyalty()` in the constructor with a single owner address unless
  the contract is exclusively for one creator

**Phase:** Royalty phase (NFTContract.sol modification)

---

### P-09 — Royalty Percentage Exceeds Sale Price Edge Case

**What goes wrong:** Royalty + marketplace commission can exceed the sale price for cheap NFTs.
Example: 0.001 ETH sale, 2.5% commission (25000 wei), 10% royalty (100000 wei) = fine.
But if commission + royalty were set to 95% + 10% by a misconfigured contract, the seller
would receive negative proceeds — the contract would revert or underflow.

**Warning signs:**
- Commission rate set to high value + royalty returns a combined rate > 100%
- `sellerProceeds` calculation uses unsigned integer subtraction and could underflow
- No `require(royaltyAmount + commission <= listing.price)` guard exists

**Prevention strategy:**
- Cap total deductions: `require(commission + royaltyAmount <= listing.price, "Deductions exceed price")`
- Keep marketplace commission low (existing 2.5% is correct) and cap royalties at a reasonable
  maximum (10% is industry standard; check the returned value and cap it even if the contract
  reports a higher rate)
- Write explicit test: set royalty to 99%, attempt sale → should either revert or proceed with
  a capped royalty, never with underflow

**Phase:** Royalty phase; unit test in Marketplace test suite

---

## Section 3: Subgraph Indexing

### P-10 — Subgraph Deployment Lag Behind Contract Redeployment

**What goes wrong:** During development, contracts are redeployed frequently (new auction
contracts, updated marketplace). Each redeployment changes the contract address. The subgraph's
`subgraph.yaml` must be updated with the new address and `startBlock` for every redeployment.
A stale subgraph continues indexing the old contract address, returning outdated or empty data
while the frontend talks to the new contract. This creates a maddening debugging situation where
on-chain state is correct but the API returns nothing.

**Warning signs:**
- Subgraph GraphQL queries return empty arrays for entities that clearly exist on-chain
- The subgraph `startBlock` is lower than the new contract's deployment block, so it
  re-indexes from genesis without finding the new contract's events
- `graph codegen` or `graph build` succeeds but the deployed subgraph returns stale data

**Prevention strategy:**
- Create a deployment script (e.g., `scripts/deploy-and-update-subgraph.sh`) that:
  1. Runs `hardhat deploy`
  2. Captures the new contract address
  3. Updates `subgraph.yaml` addresses and startBlock automatically
  4. Runs `graph deploy`
- Store the deployed contract address in `deployments/{network}.json` (standard Hardhat
  deploy plugin pattern) so both the frontend `.env` and `subgraph.yaml` read from one source
- Set `startBlock` to the contract deployment block number, not 0 — indexing from 0 wastes
  hours and the hosted service has rate limits

**Phase:** Subgraph phase (first subgraph setup); also as a checklist item on every contract
redeployment

---

### P-11 — Subgraph Misses Events from Non-Indexed Contracts

**What goes wrong:** The subgraph indexes a specific list of contracts in `subgraph.yaml`.
When new auction contracts or collection contracts are deployed, they must be explicitly added
to the data sources. A common pattern is forgetting to add the auction contract's events
(`AuctionCreated`, `BidPlaced`, `AuctionSettled`) to the subgraph, then wondering why auction
history is not queryable.

**Warning signs:**
- Auction events appear on Etherscan but are missing from subgraph GraphQL responses
- `graph node` logs show no handlers triggered for the auction contract address
- `subgraph.yaml` has one `dataSources` entry pointing only to the original Marketplace address

**Prevention strategy:**
- Treat `subgraph.yaml` as a contract — every new deployed contract must have a corresponding
  data source entry before the subgraph is deployed
- For factory patterns (if collections have individual contracts per creator), use
  `templates` in subgraph.yaml rather than static `dataSources`, and emit a
  `CollectionCreated` event from a factory to dynamically register each child contract
- In the project's simpler scope (no factory needed), list all contracts explicitly:
  NFTContract, Marketplace, AuctionContract as separate dataSources

**Phase:** Subgraph phase; revisit when adding auction and collection contracts

---

### P-12 — Derived State in Subgraph Drifts from On-Chain Reality

**What goes wrong:** Subgraph handlers compute derived state (e.g., "active listings", "highest
bid", "auction is open") by processing events sequentially. If an event handler has a logic bug
— for example, marking a listing as active on `ItemListed` but failing to mark it inactive on
`ItemSold` — the subgraph's view of "active listings" diverges from on-chain truth. This is
insidious because there is no automated reconciliation; the subgraph will confidently return
wrong data.

**Warning signs:**
- Frontend shows listings as available after they were sold (subgraph says active, chain says not)
- "Active auction" count in dashboard doesn't decrease after settlement
- Comparing `Marketplace.getActiveListingIds()` (chain truth) with subgraph query results
  returns different sets

**Prevention strategy:**
- In every event handler, ensure paired state changes are both handled:
  `ItemListed` → set `listing.active = true`
  `ItemSold` → set `listing.active = false`
  `ItemUnlisted` → set `listing.active = false`
- Add a periodic reconciliation check during development: write a script that queries both
  the contract and the subgraph for active listings and compares them (run after each
  significant action in development)
- Use AssemblyScript's strict typing in handlers — it prevents some categories of null dereference
  that would silently produce wrong state

**Phase:** Subgraph phase; run reconciliation as part of QA before each milestone

---

### P-13 — Subgraph Does Not Handle Contract Upgrades

**What goes wrong:** If `Marketplace.sol` is upgraded (e.g., to add auction functionality by
modifying the existing contract rather than deploying a separate one), the subgraph must be
updated simultaneously. Events emitted before the upgrade used the old ABI; events after use
the new ABI. If the event signatures change (new parameters added to `ItemListed`), the
subgraph's old mapping handler will silently fail to decode new events.

**Warning signs:**
- Subgraph indexing stalls at the block where the new contract was deployed
- `graph node` logs show ABI decode errors or missing event handlers
- Some events are processed, others are not — mixing old and new ABI decodings

**Prevention strategy:**
- Prefer deploying new separate contracts (AuctionContract.sol, OfferContract.sol) rather than
  modifying the existing Marketplace.sol — this is cleaner for both the subgraph and for audit
- If the existing contract must be modified, deploy a new instance and update the subgraph's
  data source address + startBlock, treating it as a new contract rather than an upgrade
- Document the deployment block where the ABI change occurred and, if needed, use subgraph
  "graft" feature to resume indexing from that block with the new ABI

**Phase:** Subgraph phase; architecture decision point (separate contracts vs. modified existing)

---

## Section 4: Backend API and Off-Chain Services

### P-14 — Backend Becomes the Source of Truth Instead of the Chain

**What goes wrong:** The backend API (Node.js caching layer) is meant to accelerate queries,
not replace on-chain data. A common drift: the backend caches "listing active = true" and
never invalidates it when a user buys via a direct contract call (bypassing the API). The
UI trusts the backend cache and shows the NFT as still listed. This is especially bad for
"buy" actions — showing an NFT as purchasable when it is already sold damages user trust.

**Warning signs:**
- User buys NFT via Etherscan or another interface → backend cache shows it still active
- Backend's listing count diverges from on-chain `getActiveListingIds()` result
- No TTL (time-to-live) on cached listing state; cache only invalidated on write paths through
  the backend's own API

**Prevention strategy:**
- Never use the backend as the authority for whether a listing is purchasable; always call the
  contract's view function before initiating a purchase transaction
- Use the backend only for non-critical display data (metadata caches, search indexes, user
  profiles), never for "can this purchase succeed?" decisions
- Apply aggressive TTLs: active listing cache = 30 seconds maximum
- The frontend should invalidate its local cache after any successful transaction and refetch
  from the subgraph or contract directly
- Pattern: backend is a "read accelerator", chain is the authority

**Phase:** Backend API phase (establish this as the architectural rule before writing any
backend caching)

---

### P-15 — IPFS Metadata Fetch in the Backend Creates Dependency on Pinata

**What goes wrong:** If the backend pre-fetches and caches IPFS metadata (to fix the existing
MVP's sequential fetch problem), it becomes dependent on IPFS gateway availability. If Pinata
goes down during cache population, the backend caches empty metadata. Subsequent requests then
return empty names and images until the cache expires — worse than the original on-demand fetch
because the TTL means bad data persists.

**Warning signs:**
- NFT names appear as `NFT #0`, `NFT #1` across the marketplace after a Pinata outage
- Cache hit rate is high but metadata is empty
- No retry logic in the background worker that fetches IPFS metadata

**Prevention strategy:**
- Use a background queue with retry and exponential backoff for IPFS metadata fetching (e.g.,
  Bull/BullMQ for Node.js)
- Do not cache metadata fetch failures — only cache successful responses
- Fall back to Cloudflare IPFS gateway (`https://cloudflare-ipfs.com/ipfs/`) if Pinata gateway
  times out; try multiple gateways in sequence
- If a cache miss occurs (metadata not yet fetched), serve the on-demand response to the client
  while the background job populates the cache — do not block the response on IPFS availability
- This is especially important given the existing project's known fragility at
  `frontend/src/services/ipfs.ts` (single gateway, no retry)

**Phase:** Backend API phase (IPFS caching worker setup)

---

### P-16 — WebSocket / Real-Time Updates and Chain Reorganizations

**What goes wrong:** Real-time updates via WebSocket typically work by listening to contract
events (`provider.on("ItemSold", ...)`) and broadcasting to connected clients. On testnets,
chain reorganizations (reorgs) happen more frequently than on mainnet. A sale event may be
emitted, broadcast to all clients (who update their UIs), and then the block is reorged — the
sale never happened. The UI shows "sold" but the listing is actually still active.

**Warning signs:**
- Users see "sold" notification then the NFT reappears as available shortly after
- WebSocket event emitted from a block that is later replaced
- The event listener does not wait for block confirmations before broadcasting

**Prevention strategy:**
- Wait for at least 1 confirmation before emitting WebSocket updates to clients, not 0
  (`tx.wait(1)` instead of `tx.wait()` or `tx.wait(0)`)
- Mark real-time updates as "pending" in the UI until 1 confirmation, not "confirmed"
- For critical state changes (sale completed, auction settled), the UI should verify via a
  direct contract call after receiving the WebSocket event rather than trusting the event alone
- Sepolia testnet: reorgs are infrequent but possible; 1-block confirmation is sufficient

**Phase:** Real-time updates phase

---

### P-17 — WebSocket Connections Not Cleaned Up on Page Navigation

**What goes wrong:** The backend WebSocket server broadcasts events to all connected clients.
The frontend subscribes on mount and must unsubscribe on unmount. In React, if the WebSocket
connection is opened in a `useEffect` without a cleanup function, navigating between pages
creates accumulating listeners. After visiting the Marketplace page five times, there are five
WebSocket listeners — each sale event triggers five UI updates, causing flicker, duplicate
toasts, and possible state corruption.

**Warning signs:**
- Multiple identical "NFT Sold" toasts appear for a single transaction
- React DevTools shows increasing useEffect execution counts on each navigation
- Memory usage grows over time as listeners accumulate

**Prevention strategy:**
- In every `useEffect` that opens a WebSocket connection or subscribes to a provider event,
  return a cleanup function: `return () => socket.off("ItemSold", handler)`
- Use a single global WebSocket connection managed in a React context or Zustand store, not
  per-component connections
- This is also the fix for the existing bug in `useWallet.ts` (lines 94-105) where
  `ethereum` event listeners are not cleaned up — establish the pattern early

**Phase:** Real-time updates phase; also fix the existing listener leak in useWallet.ts
during the same phase

---

### P-18 — User Profile Data and Wallet Address Binding

**What goes wrong:** User profiles (username, avatar, bio) are stored off-chain in the backend
database, keyed by wallet address. Two failure modes: (1) A user connects a different wallet
and finds they have no profile — expected, but they assume the profile should follow their
account. (2) A user's wallet is compromised; the attacker connects and overwrites profile data
with their own information, or the legitimate user has no way to migrate their profile to a
new wallet.

**Warning signs:**
- Users can update their profile without any signature verification — just by sending a
  POST request with an `address` parameter (no SIWE or signed message)
- No profile migration path exists; changing wallets means losing profile
- Profile update endpoint accepts `address` from the request body instead of deriving it from
  a signed message

**Prevention strategy:**
- Use Sign-In With Ethereum (SIWE — EIP-4361) for profile write operations: user signs a
  message, backend verifies the signature matches the claimed address before updating the
  profile record
- The signature verification proves the user controls the wallet without a password
- For portfolio scope: a simple implementation is sufficient — `ethers.verifyMessage(message,
  signature)` on the backend, compare result to claimed address
- Document that profile data is tied to wallet address and there is no migration — this is
  acceptable for a testnet portfolio project

**Phase:** Backend API phase (user profiles endpoint)

---

## Section 5: Search and Discovery

### P-19 — Full-Text Search Against IPFS Metadata Requires Prior Indexing

**What goes wrong:** NFT names and descriptions live in IPFS metadata JSON, not in the smart
contract or subgraph. Implementing full-text search (e.g., "search for 'dragon' in NFT names")
requires that the backend has already fetched, parsed, and indexed that metadata into a
searchable store. If the indexing is incomplete (not all NFTs have been indexed yet), search
returns partial results. Users assume search is complete and trust it, missing relevant NFTs.

**Warning signs:**
- Search returns fewer results than browsing the marketplace manually
- Newly minted NFTs do not appear in search results for several minutes
- Search index size (number of indexed NFTs) is smaller than total `totalMinted()` count

**Prevention strategy:**
- Run the indexer as a background worker that processes newly minted NFTs (via `NFTMinted`
  events from the subgraph or direct event listener) and fetches their metadata into the
  search store
- On each search query, show a disclaimer "showing results for indexed NFTs" or simply ensure
  near-real-time indexing (< 60 seconds after mint)
- For portfolio scope, a simple approach: store name + description in PostgreSQL with a
  `tsvector` column for full-text search, or use a pre-built search service (Algolia free tier,
  Meilisearch self-hosted)
- Do not attempt to do full-text search against the subgraph — The Graph's GraphQL supports
  only exact-match filters, not full-text search

**Phase:** Search & discovery phase (backend API + search index setup)

---

### P-20 — Search Results Contain Stale Listings

**What goes wrong:** A search index is built from listing data at index time. If an NFT is
sold after being indexed, the search index still returns it as "available". A user clicks the
result, navigates to the NFT detail page, and finds it is already sold. This is a bad UX loop.

**Warning signs:**
- Search results include NFTs that are sold or unlisted
- "Buy" button appears in search results but clicking it shows "Listing not active" error
- The search index is populated on `ItemListed` event but not updated on `ItemSold` or
  `ItemUnlisted` events

**Prevention strategy:**
- Subscribe to `ItemSold` and `ItemUnlisted` contract events in the backend indexer and
  update (or remove) the corresponding search document when they fire
- Alternatively, add a `status` field to the search index (`active`, `sold`, `unlisted`) and
  filter `status = active` on every search query
- Apply a short TTL (30 seconds) to search result caches so stale sold listings expire quickly
- If a user clicks a result and gets "not active", catch that error and refresh the search
  index entry — treat it as a reconciliation trigger

**Phase:** Search & discovery phase; also during backend event listener setup

---

## Section 6: Smart Contract Upgrade and Compatibility

### P-21 — Existing Marketplace Contract Cannot Be Modified After Deployment

**What goes wrong:** The existing `Marketplace.sol` is not upgradeable (no proxy pattern). To
add royalty enforcement to `buyItem()`, the existing contract must either be replaced with a
new deployment or the new features must be added to a separate contract that calls into the
existing one. Replacing the contract means all existing listings are lost (they are stored in
the old contract's mapping), all users must re-approve the new contract address, and the
frontend config must be updated. Forgetting any of these steps breaks the marketplace silently.

**Warning signs:**
- New contract is deployed but `frontend/src/config/contracts.ts` still points to old address
- Users approve the new contract address but existing listings from the old contract appear to
  work (they do not — the old approval was for the old contract)
- Royalties are not paid because the old `Marketplace.sol` is still handling purchases

**Prevention strategy:**
- Accept that the MVP marketplace contract will be replaced and plan for it explicitly:
  1. Write the new AuctionContract and updated Marketplace with royalty support as separate files
  2. Deploy all new contracts in a single deployment script that updates all addresses at once
  3. Update `frontend/src/config/contracts.ts` MARKETPLACE address immediately after deployment
  4. Update the subgraph's data sources to point to both old and new addresses (to preserve
     historical indexing) with appropriate startBlocks
- Maintain a `deployments/sepolia.json` file that is the single source of truth for contract
  addresses, read by both the frontend (via env vars or import) and the subgraph

**Phase:** Architecture planning before any contract changes; deployment script before new
contract launch

---

### P-22 — NFTContract Missing ERC-2981 at Mint Time

**What goes wrong:** The existing `NFTContract.sol` does not inherit `ERC2981`. Adding ERC-2981
requires modifying the contract. Modifying the contract means redeploying it. Redeployment
creates a new contract address. All NFTs minted on the old contract retain no royalty
information. If the project keeps both the old and new NFT contracts active (for backward
compatibility), the marketplace must handle royalty calls on the old contract gracefully (the
call to `royaltyInfo()` should fail gracefully if the interface is not supported).

**Warning signs:**
- `royaltyInfo()` called on old NFTContract throws instead of returning `(address(0), 0)`
- Marketplace `buyItem()` reverts for all old-contract NFTs after royalty enforcement is added
- `ERC165Checker.supportsInterface(0x2a55205a)` returns false for old NFTs but the code
  assumes true

**Prevention strategy:**
- Before calling `royaltyInfo()` in `Marketplace.sol`, always check:
  `if (IERC165(listing.nftContract).supportsInterface(type(IERC2981).interfaceId))` — skip
  royalty distribution if not supported, do not revert
- This guard handles old NFTs, ERC721 contracts from other projects, and any contract that
  does not implement royalties
- When deploying the new `NFTContract.sol` with ERC-2981, keep the old contract address in
  the frontend config for reading owned NFTs from the Dashboard — users' existing NFTs do
  not disappear

**Phase:** Royalty phase (guard added to Marketplace before new NFTContract deployed)

---

## Section 7: Existing MVP Patterns That Will Break Under New Features

### P-23 — Sequential Metadata Fetching Will Collapse Under Auction Load

**What goes wrong:** The existing Marketplace page fetches metadata for each listing
sequentially in a `for...of` loop (identified in `CONCERNS.md` performance section). This is
already a bottleneck with fixed listings. Auctions add new data to fetch: current bid, time
remaining, number of bidders. Fetching all of this sequentially for 20 concurrent auctions
means 20+ serial RPC calls plus 20 serial IPFS fetches — easily 10+ seconds of load time.

**Warning signs:**
- Auction list page takes over 5 seconds to load with 10 active auctions
- Network tab shows RPC calls queuing sequentially rather than in parallel
- Same loop structure as existing `Marketplace.tsx` lines 38-61 copied into auction page

**Prevention strategy:**
- Before adding auction data to the frontend, fix the existing sequential fetch by converting
  to `Promise.allSettled()`: fetch all auction data in parallel, then process results
- Move metadata fetching to the backend/subgraph entirely so the frontend makes one GraphQL
  query rather than N RPC + N IPFS calls
- This is a prerequisite performance fix that should happen before adding auction UI

**Phase:** Backend API phase (move data fetching off chain-direct) OR as a prerequisite
fix before auction UI development

---

### P-24 — `window.location.reload()` Pattern Incompatible With Real-Time Updates

**What goes wrong:** The existing codebase reloads the page after buy/unlist transactions
(`NFTDetail.tsx` lines 115, 132). This destroys WebSocket connections, resets all component
state, and forces a full re-initialization of the wallet connection. Once WebSocket real-time
updates are added, a page reload after each transaction is directly contradictory — the entire
point of real-time updates is to update the UI without reloading.

**Warning signs:**
- WebSocket reconnects after every transaction (because the page reloads)
- Users see a flash of the disconnected state after each purchase
- Real-time "New bid placed" notification appears for a moment then disappears on reload

**Prevention strategy:**
- Remove all `window.location.reload()` calls before implementing real-time updates
- Replace with targeted state updates: after a successful transaction, call `fetchListings()`
  or `fetchAuction()` to refresh only the affected data
- This is the correct fix for the existing bug identified in CONCERNS.md — fix it in the
  same phase as real-time updates to avoid the contradictory behavior

**Phase:** Real-time updates phase (as a prerequisite cleanup before WebSocket integration)

---

### P-25 — `_activeListingIds` Array in Marketplace Cannot Scale to Auctions

**What goes wrong:** The existing `_removeActiveListing()` function does an O(n) scan of the
`_activeListingIds` array. As listings grow, this gas cost grows. Now add auctions: if English
auctions use a similar active-auction array, and there are 50 active auctions, every bid
placement that requires any array traversal becomes expensive. This is the existing bug noted
in `CONCERNS.md` (Scaling Limits section) now compounded by auction volume.

**Warning signs:**
- Gas cost of `settleAuction()` grows with the number of simultaneous auctions
- `getActiveListingIds()` view call starts approaching block gas limits with 500+ listings
- Auction contract copy-pastes the same `_activeIds` array pattern from Marketplace.sol

**Prevention strategy:**
- For the new AuctionContract, do not use an active-array pattern at all
- Use an enumerable mapping instead: `mapping(uint256 => Auction) public auctions` with
  separate counters, and use the subgraph to query active auctions (rather than on-chain
  enumeration)
- If on-chain enumeration is needed, use OpenZeppelin's `EnumerableSet` which has O(1) add
  and remove
- Fix the existing Marketplace `_activeListingIds` array in the same phase as auction
  development to establish the correct pattern once

**Phase:** Smart contract design for auctions; also fix in Marketplace during that phase

---

## Section 8: Offer System Specific

### P-26 — Offers Require ETH Escrow or Trust Assumptions

**What goes wrong:** An offer system lets buyers submit below-listing-price bids that sellers
can accept. The offer must either: (A) hold the ETH in escrow (buyer sends ETH to the contract
when making the offer), or (B) trust the buyer has ETH when the seller accepts (signature-based
off-chain order). Design A is simpler and trustless but locks up buyer ETH. Design B requires
signature verification and can fail if the buyer spent their ETH after signing the offer.

If the project chooses design B (signatures) and the seller accepts an offer where the buyer
no longer has the required ETH, the acceptance transaction reverts with an insufficient balance
error. The seller wasted gas and the experience is confusing.

**Warning signs:**
- Offers implemented as database records with no ETH held on-chain
- Seller accepts an offer → tx reverts → seller sees "offer expired" with no explanation
- No offer expiry mechanism; offers from 6 months ago still appear as valid

**Prevention strategy:**
- For portfolio scope, use escrow-based offers (design A): buyer sends ETH to the contract
  at offer creation, stored in `mapping(uint256 offerId => Offer)` with `amount` field
- Provide `withdrawOffer(offerId)` for buyers to cancel and reclaim ETH
- Set mandatory offer expiry (e.g., maximum 7 days) enforced in the contract: reject acceptance
  of expired offers with `require(block.timestamp < offer.expiresAt, "Offer expired")`
- Add `OfferCreated`, `OfferAccepted`, `OfferCancelled`, `OfferExpired` events for subgraph indexing

**Phase:** Offer system phase (smart contract design)

---

### P-27 — Accepting an Offer on a Listed NFT Bypasses Marketplace Logic

**What goes wrong:** If an NFT is listed at 1 ETH and a buyer makes an offer of 0.8 ETH that
the seller accepts via the offer contract, the offer contract transfers the NFT directly from
seller to buyer at 0.8 ETH. The marketplace listing for 1 ETH is never cancelled. The NFT
is now owned by the buyer but the marketplace still shows it as listed (active listing). Other
users click "Buy" and the transaction fails because the seller no longer owns the token.

**Warning signs:**
- Accepted offer results in NFT transfer but `Marketplace.listings[listingId].active` is still
  true
- Marketplace page shows the NFT as purchasable after it was sold via offer
- No `ItemUnlisted` event emitted when an offer is accepted for a listed NFT

**Prevention strategy:**
- The offer acceptance flow must check whether the NFT has an active listing and cancel it:
  1. In `acceptOffer()`, query whether there is an active listing for this token
  2. Call `marketplace.unlistItem(listingId)` if an active listing exists (or emit an event
     that the subgraph uses to mark the listing as inactive)
- Alternative: the offer contract calls the marketplace contract's internal unlisting logic
  (requires the contracts to be aware of each other — manageable in a single-deployer scenario)
- The subgraph must handle this cross-contract interaction: an `OfferAccepted` event must
  trigger the listing entity to be marked inactive

**Phase:** Offer system phase; test explicitly: list → offer → accept offer → verify listing inactive

---

## Summary Table

| # | Domain | Phase | Severity |
|---|--------|-------|----------|
| P-01 | Auctions — block timestamp clock drift | Contract design | High |
| P-02 | Auctions — Dutch auction integer division | Contract design | Medium |
| P-03 | Auctions — settlement requires explicit tx | Contract design + UI | High |
| P-04 | Auctions — outbid ETH reentrancy | Contract design | High |
| P-05 | Auctions — NFT approval vs. escrow | Contract design | High |
| P-06 | Auctions — Dutch buy race condition | Contract design | Medium |
| P-07 | Royalties — ERC-2981 not enforced by default | Royalty phase | High |
| P-08 | Royalties — stale receiver (deployer vs. creator) | Royalty phase | Medium |
| P-09 | Royalties — exceeds sale price edge case | Royalty phase | Low |
| P-10 | Subgraph — stale after contract redeployment | Subgraph phase | High |
| P-11 | Subgraph — missing new contract data sources | Subgraph phase | High |
| P-12 | Subgraph — derived state diverges from chain | Subgraph phase | High |
| P-13 | Subgraph — ABI mismatch on contract changes | Subgraph phase | Medium |
| P-14 | Backend — cache becomes source of truth | Backend API phase | High |
| P-15 | Backend — IPFS cache poison on gateway outage | Backend API phase | Medium |
| P-16 | Real-time — event broadcast before confirmation | Real-time phase | Medium |
| P-17 | Real-time — WebSocket listener accumulation | Real-time phase | Medium |
| P-18 | Backend — profile data unauthenticated writes | Backend API phase | High |
| P-19 | Search — partial index returned as complete | Search phase | Medium |
| P-20 | Search — stale sold listings in results | Search phase | Medium |
| P-21 | Contracts — non-upgradeable contract migration | Architecture planning | High |
| P-22 | Contracts — old NFTContract missing ERC-2981 | Royalty phase | High |
| P-23 | Existing MVP — sequential fetch under auction load | Backend API / pre-auction | Medium |
| P-24 | Existing MVP — reload incompatible with real-time | Real-time phase | Medium |
| P-25 | Existing MVP — O(n) listing array in auction scale | Contract design | Medium |
| P-26 | Offers — no ETH escrow = trust failures | Offer system phase | High |
| P-27 | Offers — accepted offer leaves stale listing | Offer system phase | High |

---

*Research completed: 2026-02-21*
*Scope: NFT Marketplace milestone 2 — auctions, royalties, indexing, off-chain services*
