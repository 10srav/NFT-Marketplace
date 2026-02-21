---
phase: 01-contract-foundation
plan: 02
subsystem: contracts
tags: [solidity, hardhat, erc721, erc2981, auction, pull-payment, escrow, anti-sniping, reentrancy-guard]

# Dependency graph
requires:
  - phase: 01-contract-foundation/01-01
    provides: NFTContract.sol with ERC-2981 royalty support and _deductFeesAndPay settlement pattern
provides:
  - AuctionHouse.sol with complete English auction lifecycle (escrow, bidding, settlement, cancellation)
  - Pull-payment (pendingReturns) pattern for safe outbid fund management
  - Anti-sniping timer extension (10-min window, 10-min extension)
  - Royalty-aware settlement via _deductFeesAndPay mirroring Marketplace.sol
  - 44 comprehensive tests covering every auction state and edge case
affects:
  - 01-03 (DutchAuction should extend/mirror AuctionHouse patterns and use same _deductFeesAndPay approach)
  - 01-05 (Marketplace upgrade should remain compatible with AuctionHouse event signatures)
  - Phase 2 (The Graph indexing needs EnglishAuctionCreated, BidPlaced, EnglishAuctionSettled events)
  - Phase 4 (Backend read-accelerator should expose auction state via REST endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pull-payment for outbid funds: pendingReturns mapping, CEI (zero before transfer) in withdrawBid"
    - "NFT escrow via safeTransferFrom to contract + IERC721Receiver.onERC721Received"
    - "Anti-sniping: extend endTime by 10min when bid placed in final 10min window"
    - "Royalty-aware settlement: _deductFeesAndPay copied from Marketplace.sol (per-contract copy, no shared library)"
    - "CEI in settleAuction: settled=true before all external calls (NFT transfer + ETH transfer)"
    - "loadFixture + time.increase for time-dependent Hardhat tests"

key-files:
  created:
    - contracts/contracts/AuctionHouse.sol
    - contracts/test/AuctionHouse.test.js
  modified: []

key-decisions:
  - "IERC721Receiver implemented on AuctionHouse so safeTransferFrom escrow works without plain transferFrom"
  - "_deductFeesAndPay copied verbatim from Marketplace.sol — each contract owns its copy (RESEARCH.md recommendation)"
  - "settleAuction is public (any address can settle) — prevents stuck auctions if seller/winner is unresponsive"
  - "EnglishAuctionSettled emits (auctionId, address(0), 0) when no bids — explicit no-bid settlement path"
  - "Anti-snipe extension is additive (not reset to +10min from now) — endTime += EXTENSION preserves time integrity"

patterns-established:
  - "English auction struct pattern: nftContract/tokenId/seller/startTime/endTime/reservePrice/highestBidder/highestBid/settled/cancelled"
  - "Auction existence check: require(a.seller != address(0)) guards all public functions"
  - "Commission stays in contract, royalty is pushed, seller gets proceeds — same 3-party split as Marketplace"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 1 Plan 02: AuctionHouse English Auction Summary

**English auction contract with NFT escrow, pull-payment bidding, 10-minute anti-snipe extension, and ERC-2981 royalty-aware settlement — 44 tests, all passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T08:29:41Z
- **Completed:** 2026-02-21T08:33:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Complete AuctionHouse.sol (245 lines) with English auction lifecycle: create, bid, withdraw, settle, cancel
- Pull-payment pattern via pendingReturns mapping prevents reentrancy on outbid refunds
- Anti-sniping: bids within 10 minutes of auction end extend the timer by 10 minutes
- Royalty-aware settlement mirrors Marketplace.sol's _deductFeesAndPay — consistent 3-party split across all sale types
- 44 comprehensive tests covering every function, edge case, and event — all 86 project tests pass together

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AuctionHouse.sol with English auction contract** - `29200d6` (feat)
2. **Task 2: Create comprehensive English auction tests** - `fc3deae` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `contracts/contracts/AuctionHouse.sol` - English auction contract (245 lines): EnglishAuction struct, createEnglishAuction, placeBid, withdrawBid, settleAuction, cancelEnglishAuction, _deductFeesAndPay, IERC721Receiver
- `contracts/test/AuctionHouse.test.js` - 44-test suite (745 lines): all auction lifecycle paths, anti-sniping, pull-payment, royalty settlement, admin functions

## Decisions Made
- **IERC721Receiver on AuctionHouse:** safeTransferFrom requires the recipient to implement onERC721Received; plain transferFrom would bypass approval checks — safer to use safeTransferFrom throughout.
- **_deductFeesAndPay copied not shared:** Per RESEARCH.md recommendation, each settlement contract owns its copy. Avoids creating a shared library dependency that would complicate upgrades and The Graph ABI handling.
- **settleAuction is permissionless:** Any address can call settle after auction ends — prevents stuck auctions if seller/winner goes offline.
- **Anti-snipe is additive (endTime += EXTENSION):** Resetting to block.timestamp + 10min could let rapid sniping compress the auction. Additive extension preserves the original end-time contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AuctionHouse.sol is ready; plan 01-03 (DutchAuction) should follow the same struct/event/settlement patterns
- The `_deductFeesAndPay` pattern is now established in both Marketplace.sol and AuctionHouse.sol — DutchAuction should copy the same function
- All 86 tests pass; no regressions from new code

---
*Phase: 01-contract-foundation*
*Completed: 2026-02-21*
