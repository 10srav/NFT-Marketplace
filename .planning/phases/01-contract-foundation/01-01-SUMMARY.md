---
phase: 01-contract-foundation
plan: 01
subsystem: contracts
tags: [solidity, erc2981, erc721, openzeppelin, hardhat, royalties, marketplace]

# Dependency graph
requires: []
provides:
  - ERC-2981 per-token royalty in NFTContract.sol (minter as receiver, capped at 10%)
  - Royalty-aware buyItem settlement via _deductFeesAndPay in Marketplace.sol
  - ROYL-04 overflow guard (royalty + commission <= salePrice)
  - activeListingByToken reverse lookup mapping in Marketplace.sol
  - MockPlainERC721 test helper for non-ERC2981 fallback testing
  - 42 tests passing (17 NFTContract + 25 Marketplace)
affects:
  - 01-02 (AuctionHouse English auction must reuse _deductFeesAndPay pattern)
  - 01-03 (AuctionHouse Dutch auction must reuse _deductFeesAndPay pattern)
  - 01-05 (Marketplace offer system uses _deductFeesAndPay + activeListingByToken)
  - 01-06 (deployment scripts must handle new 2-arg mintNFT signature)
  - frontend (mintNFT calls need royaltyBps second argument)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ERC2981 directly (not ERC721Royalty) to avoid diamond conflict with ERC721URIStorage"
    - "_deductFeesAndPay internal function: supportsInterface try/catch -> royaltyInfo -> ROYL-04 guard -> pay royalty -> pay seller"
    - "activeListingByToken[nftContract][tokenId] = listingId+1 (offset by 1, 0 = no listing)"

key-files:
  created:
    - contracts/contracts/mocks/MockPlainERC721.sol
  modified:
    - contracts/contracts/NFTContract.sol
    - contracts/contracts/Marketplace.sol
    - contracts/test/NFTContract.test.js
    - contracts/test/Marketplace.test.js

key-decisions:
  - "Use ERC2981 directly (not ERC721Royalty) to avoid supportsInterface diamond conflict with ERC721URIStorage"
  - "mintNFT signature changed to 2-arg: mintNFT(string tokenURI, uint96 royaltyBps) — breaking change for frontend"
  - "Royalty receiver is always msg.sender at mint time (the creator), stored per-token via _setTokenRoyalty"
  - "activeListingByToken added in plan 01-01 (not 01-05 as originally planned) because it adds minimal complexity now and sets up 01-05 cleanly"
  - "MockPlainERC721 placed in contracts/mocks/ as a test helper — not a production contract"

patterns-established:
  - "_deductFeesAndPay pattern: query ERC2981 via try/catch, guard overflow, pay royalty then seller"
  - "All settlement paths (buy, auction settle, offer accept) should call _deductFeesAndPay"
  - "Reverse lookup pattern: store listingId+1 in mapping so 0 unambiguously means no listing"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 1 Plan 01: ERC-2981 Royalty Foundation Summary

**ERC-2981 per-token royalties added to NFTContract (minter as receiver, 10% cap) with royalty-aware Marketplace.buyItem settlement via _deductFeesAndPay — foundational pattern for all 5 settlement paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T08:21:56Z
- **Completed:** 2026-02-21T08:25:55Z
- **Tasks:** 2 of 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- NFTContract.sol inherits ERC2981 alongside ERC721URIStorage using correct OZ v5 pattern — no diamond conflict
- mintNFT now accepts royaltyBps (uint96, max 1000 = 10%), calls _setTokenRoyalty per token with minter as receiver
- Marketplace.sol _deductFeesAndPay handles royalty query, ROYL-04 overflow guard, royalty payment, and seller payment in a single reusable function
- activeListingByToken reverse mapping added — prerequisite for offer-unlist in plan 01-05
- 42 tests total (17 NFTContract + 25 Marketplace), all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ERC-2981 royalty support to NFTContract.sol and update tests** - `1d33f25` (feat)
2. **Task 2: Add royalty payment to Marketplace.sol buyItem and update tests** - `c53012d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `contracts/contracts/NFTContract.sol` - Added ERC2981 import + inheritance, mintNFT 2-arg signature, MAX_ROYALTY_BPS constant, _setTokenRoyalty call, supportsInterface(ERC721, ERC721URIStorage, ERC2981)
- `contracts/contracts/Marketplace.sol` - Added IERC2981/IERC165 imports, _deductFeesAndPay internal function, activeListingByToken mapping, refactored buyItem, updated ItemSold event to 5 args
- `contracts/test/NFTContract.test.js` - Updated all mintNFT calls to 2-arg form; added Royalties describe block (7 tests covering royaltyInfo, 10% cap, 0%, boundary, supportsInterface, per-token independence)
- `contracts/test/Marketplace.test.js` - Updated mintNFT calls; added activeListingByToken assertions; updated ItemSold expectations; added Royalty Settlement describe block (5 tests)
- `contracts/contracts/mocks/MockPlainERC721.sol` - Plain ERC721 without ERC2981, used to test graceful non-royalty fallback

## Decisions Made

- **ERC2981 not ERC721Royalty:** ERC721Royalty conflicts with ERC721URIStorage's supportsInterface override in OZ v5. Using ERC2981 directly with explicit `override(ERC721, ERC721URIStorage, ERC2981)` resolves the diamond ambiguity cleanly.
- **mintNFT signature breaking change:** The original 1-arg signature was changed to 2-arg (adds royaltyBps). This is a breaking change for the frontend's `services/ipfs.ts` and any Create page calls. Frontend must be updated in Phase 3 to pass royaltyBps (e.g., from a form input or defaulting to 0).
- **activeListingByToken pulled forward to 01-01:** The plan originally deferred this to 01-05 (offer system). Added it here because it touches the same listItem/buyItem/unlistItem code paths already being modified, avoiding a second pass over those functions.
- **ROYL-04 guard placement:** Guard is placed after royaltyInfo query, before any transfers. This ensures a malicious NFT returning an inflated royaltyAmount causes a clean revert rather than an arithmetic underflow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added MockPlainERC721 test helper contract**

- **Found during:** Task 2 (Marketplace.test.js — "Should handle non-ERC2981 NFTs gracefully" test)
- **Issue:** The plan specified testing a "plain ERC721 mock" but no such contract existed in the codebase. The test would fail to compile without it.
- **Fix:** Created `contracts/contracts/mocks/MockPlainERC721.sol` — minimal ERC721 with a `mint(address)` function, no ERC2981 support.
- **Files modified:** `contracts/contracts/mocks/MockPlainERC721.sol` (created)
- **Verification:** Hardhat compiles the mock; non-ERC2981 test passes.
- **Committed in:** c53012d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for test completeness. No scope creep — mock is minimal and test-only.

## Issues Encountered

None — plan executed cleanly. The ERC2981/ERC721URIStorage diamond pitfall documented in RESEARCH.md was avoided by following the recommended pattern exactly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 01-02 (English Auction) can use `_deductFeesAndPay` from Marketplace.sol as a reference pattern for AuctionHouse.sol settlement — both contracts need the same royalty + commission deduction logic
- Plan 01-05 (Offer System) can use `activeListingByToken` immediately — the mapping is already maintained in all 3 code paths (listItem, buyItem, unlistItem)
- **Frontend blocker:** `mintNFT` signature is now 2-arg. The Create page (`frontend/src/pages/Create.tsx` or equivalent) must pass a royaltyBps argument. Recommend defaulting to 0 until a royalty input UI is built in Phase 3.
- **Frontend blocker:** `ItemSold` event is now 5 args (added royalty). Any frontend event listener parsing this event must be updated.

---
*Phase: 01-contract-foundation*
*Completed: 2026-02-21*
