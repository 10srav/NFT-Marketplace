---
phase: 01-contract-foundation
plan: 03
subsystem: contracts
tags: [solidity, hardhat, erc721, erc2981, dutch-auction, linear-decay, escrow, reentrancy-guard]

# Dependency graph
requires:
  - phase: 01-contract-foundation/01-02
    provides: AuctionHouse.sol with English auction, _deductFeesAndPay settlement pattern, IERC721Receiver escrow
provides:
  - AuctionHouse.sol extended with complete Dutch auction lifecycle (create, buy, cancel)
  - getCurrentPrice view function with linear decay (no storage writes)
  - buyDutch with CEI pattern, overpayment refund, and royalty-aware settlement
  - cancelDutchAuction for unsold auction NFT recovery
  - 20 Dutch auction tests alongside 44 English auction tests (64 total in AuctionHouse suite)
affects:
  - Phase 2 (The Graph indexing needs DutchAuctionCreated, DutchAuctionSold, DutchAuctionCancelled events)
  - Phase 4 (Backend read-accelerator should expose Dutch auction state + getCurrentPrice via REST)
  - Frontend Phase 3 (Dutch auction UI: create form, countdown price display, buy button)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dutch auction price decay: pure view function getCurrentPrice, no storage writes during decay"
    - "time.setNextBlockTimestamp for deterministic price in payment assertions (avoids block timing drift)"
    - "CEI in buyDutch: sold=true before overpayment refund, NFT transfer, and fee distribution"
    - "Overpayment refund: msg.value - currentPrice returned to buyer before settlement"
    - "Dutch cancel: only seller, only unsold/uncancelled, returns escrowed NFT"

key-files:
  created: []
  modified:
    - contracts/contracts/AuctionHouse.sol
    - contracts/test/AuctionHouse.test.js

key-decisions:
  - "getCurrentPrice is public view (not pure) — reads storage for startPrice/endPrice/startTime/duration fields"
  - "buyDutch sends overpayment refund BEFORE NFT transfer and fee settlement — still safe because sold=true set first (CEI)"
  - "time.setNextBlockTimestamp used in payment tests — eliminates block-to-block price drift that caused test failures"
  - "Tests use START_PRICE (generous overpayment) for simple buy scenarios, pinned timestamp for exact payment assertions"

patterns-established:
  - "Dutch auction price formula: startPrice - ((startPrice - endPrice) * elapsed / duration)"
  - "Floor behavior: getCurrentPrice returns endPrice when elapsed >= duration (not underflow)"
  - "DutchAuction existence check: require(a.seller != address(0)) mirrors English auction pattern"
  - "Dutch cancellation allows cancellation at any time before sold (unlike English which blocks cancel with bids)"

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 1 Plan 03: Dutch Auction for AuctionHouse Summary

**Dutch auction contract extension with linear price decay view function, first-buyer-wins purchase with overpayment refund, royalty-aware settlement via _deductFeesAndPay, and 20 new tests — 175 total tests passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T08:40:09Z
- **Completed:** 2026-02-21T08:45:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- AuctionHouse.sol extended with complete Dutch auction: DutchAuction struct, createDutchAuction, getCurrentPrice, buyDutch, cancelDutchAuction, three events
- getCurrentPrice is a pure view function — linear decay formula with no storage writes, floors at endPrice
- buyDutch follows CEI: sold=true before overpayment refund and all external calls; reuses _deductFeesAndPay for royalty + commission
- 20 Dutch auction tests covering all lifecycle paths, price decay at multiple time points, payment assertions, and edge cases
- All 44 existing English auction tests remain green — zero regressions; full suite of 175 tests passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Dutch auction functions to AuctionHouse.sol** - `90a495b` (feat)
2. **Task 2: Add Dutch auction tests to AuctionHouse.test.js** - `75ad0f6` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `contracts/contracts/AuctionHouse.sol` - Extended with Dutch auction (161 lines added): DutchAuction struct, _nextDutchAuctionId, dutchAuctions mapping, 3 events, createDutchAuction, getCurrentPrice, buyDutch, cancelDutchAuction
- `contracts/test/AuctionHouse.test.js` - 20 new Dutch auction tests (519 lines added): Creating Dutch Auctions (5), Price Decay (4), Buying (7), Cancelling Dutch Auctions (4)

## Decisions Made
- **getCurrentPrice is `public view` not `pure`**: The function reads auction storage (startPrice, endPrice, startTime, duration), so it cannot be declared `pure`. It is still a view function with no state writes.
- **Overpayment refund before NFT transfer**: CEI is satisfied because `a.sold = true` is set before any external calls. The refund transfer happens before the NFT transfer and fee distribution, which is safe.
- **time.setNextBlockTimestamp for payment tests**: Tests that query `getCurrentPrice` then send that as `msg.value` fail because one more block elapses during execution. Pinning the buy transaction to an exact timestamp and computing the expected price mathematically eliminates this drift. Used for all 4 payment assertion tests.
- **Tests use START_PRICE for simple buy scenarios**: Tests that only need to verify NFT ownership or sold state (not payment amounts) send START_PRICE as a guaranteed-sufficient amount, avoiding timing complexity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 5 failing tests due to block-timing price drift**
- **Found during:** Task 2 (running tests for the first time)
- **Issue:** Tests called `getCurrentPrice` in one block, then sent the returned value as `msg.value` to `buyDutch` in the next block. One extra second of decay caused `msg.value < currentPrice` at execution time (for "insufficient ETH") or mismatched payment amounts (for balance assertions).
- **Fix:** Used `time.setNextBlockTimestamp` to pin buy transaction timestamp, then computed expected price from the exact timestamp mathematically. Simple buy tests use `START_PRICE` as guaranteed-sufficient overpayment. "Insufficient ETH" test sends `0n` (always below any valid endPrice > 0).
- **Files modified:** contracts/test/AuctionHouse.test.js
- **Verification:** All 64 AuctionHouse tests + 175 total tests pass
- **Committed in:** `75ad0f6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test timing)
**Impact on plan:** Required fix for correct test operation. No scope creep; no contract code changed.

## Issues Encountered

The block-timing drift issue in payment tests (deviation above) was the only issue. Root cause: Hardhat mines a new block for each transaction, so `getCurrentPrice` called in block N returns a price that has already decayed further by block N+1 when `buyDutch` executes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AuctionHouse.sol is complete with both English and Dutch auction functionality
- Phase 1 has one plan remaining (01-06 or whichever is next per ROADMAP.md)
- DutchAuction events are named and structured — ready for The Graph schema in Phase 2
- No regressions; all 175 tests pass including NFTContract, Marketplace, CollectionFactory, and AuctionHouse

---
*Phase: 01-contract-foundation*
*Completed: 2026-02-21*
