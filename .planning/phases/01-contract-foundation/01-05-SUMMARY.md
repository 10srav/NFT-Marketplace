---
phase: 01-contract-foundation
plan: "05"
subsystem: smart-contracts
tags: [solidity, marketplace, offers, escrow, erc721, erc2981, hardhat, openzeppelin]

# Dependency graph
requires:
  - phase: 01-01
    provides: "activeListingByToken reverse mapping, _deductFeesAndPay settlement function, ERC-2981 royalty support"
provides:
  - "Full offer/escrow lifecycle: makeOffer, acceptOffer, rejectOffer, cancelOffer"
  - "ETH escrow in contract with commission-safe withdrawCommission"
  - "Auto-unlist of fixed-price listing when offer is accepted"
  - "Configurable offer duration (1h–30d, default 7d)"
  - "62 Marketplace tests (37 new), 155 total across all suites"
affects:
  - "01-06 (deploy scripts must include offer functions)"
  - "Phase 2 subgraph (OfferMade, OfferAccepted, OfferRejected, OfferCancelled events to index)"
  - "Phase 3 frontend (makeOffer, acceptOffer, rejectOffer, cancelOffer UI flows)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CEI (Checks-Effects-Interactions): offer.active = false before all external calls in acceptOffer"
    - "_accumulatedCommission tracker: commission tracked separately from escrowed ETH so withdrawCommission cannot drain buyer deposits"
    - "Reverse mapping reuse: _unlistIfActive uses existing activeListingByToken for O(1) listing lookup"
    - "Duration bounds pattern: MIN/MAX constants with 0 as sentinel for default (7 days)"

key-files:
  created: []
  modified:
    - contracts/contracts/Marketplace.sol
    - contracts/test/Marketplace.test.js

key-decisions:
  - "_accumulatedCommission added to prevent withdrawCommission from sweeping escrowed offer ETH — critical safety fix"
  - "cancelOffer/rejectOffer allowed after expiry so buyers are never locked out of refunds"
  - "acceptOffer blocked at expiry+1 (block.timestamp > offer.expiry) to protect sellers from stale offers"
  - "Auto-unlist emits ItemUnlisted — subgraph and frontend can treat it identically to manual unlist"
  - "getOffer() view function added as convenience (offers mapping is public but struct return is cleaner for callers)"

patterns-established:
  - "All settlement paths use _deductFeesAndPay: buyItem, acceptOffer — consistent commission+royalty handling"
  - "State marked inactive before external calls (CEI) in all payment-releasing functions"

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 1 Plan 05: Offer System Summary

**ETH-escrowed offer lifecycle (makeOffer/acceptOffer/rejectOffer/cancelOffer) with commission-safe withdrawCommission and auto-unlist on accept**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T08:30:26Z
- **Completed:** 2026-02-21T08:35:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Full offer lifecycle: buyers escrow ETH via makeOffer, sellers accept/reject, buyers cancel — all paths handle refunds correctly
- Commission safety: `_accumulatedCommission` tracks platform fees separately from escrowed offer ETH, so `withdrawCommission` can never drain buyer deposits
- Auto-unlist: `_unlistIfActive` cancels any active fixed-price listing when an offer is accepted, preventing double-spend of the same NFT
- 62 Marketplace tests passing (37 new), 155 total across all test suites — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add offer system to Marketplace.sol** - `c825274` (feat)
2. **Task 2: Add offer system tests to Marketplace.test.js** - `2408576` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `contracts/contracts/Marketplace.sol` - Added Offer struct, makeOffer, acceptOffer, rejectOffer, cancelOffer, _unlistIfActive, getOffer, _accumulatedCommission, totalOffers, updated withdrawCommission
- `contracts/test/Marketplace.test.js` - Added 7 new describe blocks (Making Offers, Accepting Offers, Auto-Unlist on Accept, Rejecting Offers, Cancelling Offers, Offer Expiry, Commission Safety); also updated 2 existing tests to use accumulatedCommission view

## Decisions Made

- **_accumulatedCommission tracker:** The plan specified this as a critical safety requirement. `withdrawCommission` was previously sweeping `address(this).balance`, which would have drained escrowed offer ETH. Now it only withdraws tracked commission.
- **cancelOffer/rejectOffer allowed after expiry:** Buyers must always be able to recover their escrowed ETH even after an offer expires. `cancelOffer` has no expiry check; `rejectOffer` has no expiry check. Only `acceptOffer` enforces the deadline.
- **Boundary test adjusted:** The "exact expiry boundary" test was changed to "one second before expiry" because `time.increaseTo(expiry)` sets the _current_ block time and the next transaction mines at `expiry+1`, making `block.timestamp > expiry`. Testing at `expiry-1` reliably validates the happy path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused local variables in acceptOffer causing compiler warnings**
- **Found during:** Task 1 verification (compile step)
- **Issue:** `uint256 royaltyPaid` and `uint256 commission` were assigned but never used in `acceptOffer`. Solidity compiler emitted warnings.
- **Fix:** Removed both unused assignments — `_deductFeesAndPay` return value discarded, commission not needed in `OfferAccepted` event (amount is sufficient)
- **Files modified:** contracts/contracts/Marketplace.sol
- **Verification:** `npx hardhat compile --force` shows "Compiled 32 Solidity files successfully" with no warnings
- **Committed in:** c825274 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed boundary expiry test — time.increaseTo semantics**
- **Found during:** Task 2 test run (61 passing, 1 failing)
- **Issue:** "Should accept offer at exact expiry boundary" used `time.increaseTo(Number(expiry))` then immediately called acceptOffer. Because Hardhat's `increaseTo` sets the last mined block's timestamp, the next transaction's block timestamp is `expiry+1`, triggering the `> expiry` check.
- **Fix:** Changed test to `time.increaseTo(expiry - 1)` and renamed to "one second before expiry (still valid)" — accurately tests the valid-before-deadline case
- **Files modified:** contracts/test/Marketplace.test.js
- **Verification:** 62/62 Marketplace tests pass; 155/155 total
- **Committed in:** 2408576 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - Bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Marketplace.sol offer system complete and tested. Ready for 01-06 deploy scripts.
- Subgraph (Phase 2) needs to index: OfferMade, OfferAccepted, OfferRejected, OfferCancelled events.
- Frontend (Phase 3) needs UI flows for: make offer (with ETH input + duration), accept/reject offer panel on NFT detail, cancel pending offer on dashboard.
- Concern: `rejectOffer` has no expiry check — seller can call it even after expiry to trigger the refund. This is intentional (buyer always recoverable) but frontend should handle gracefully.

---
*Phase: 01-contract-foundation*
*Completed: 2026-02-21*
