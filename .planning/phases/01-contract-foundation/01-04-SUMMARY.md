---
phase: 01-contract-foundation
plan: "04"
subsystem: contracts
tags: [solidity, erc721, erc2981, eip-1167, clones, openzeppelin, hardhat, royalties, collection-factory]

# Dependency graph
requires:
  - phase: 01-01
    provides: "ERC2981 direct inheritance pattern and supportsInterface override for ERC721+ERC721URIStorage+ERC2981"
provides:
  - "Collection.sol: cloneable ERC721+ERC2981 with custom name/symbol storage overrides and onlyOwner mintNFT"
  - "CollectionFactory.sol: EIP-1167 clone factory deploying per-creator Collection proxies via Clones.clone()"
  - "CollectionFactory.test.js: 32 tests covering factory deployment, collection creation, minting, marketplace compatibility, and implementation protection"
affects:
  - "01-05: offer system can use Collection NFTs as subjects of offers"
  - "01-06: deploy script must include CollectionFactory + Collection; deployments/sepolia.json needs factory address"
  - "Phase 2: subgraph can index CollectionCreated events to build per-creator collection entities"
  - "Phase 3: frontend Create page should offer collection selection; minting UI needs royaltyBps input"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EIP-1167 minimal proxy pattern via Clones.clone() + atomic initialize() call"
    - "Custom name/symbol storage slot override: _collectionName/_collectionSymbol + override name()/symbol()"
    - "4-line initialize guard: bool _initialized set true in constructor + require in initialize()"
    - "collectionsByCreator mapping + allCollections array for factory enumeration"

key-files:
  created:
    - contracts/contracts/Collection.sol
    - contracts/contracts/CollectionFactory.sol
    - contracts/test/CollectionFactory.test.js
  modified: []

key-decisions:
  - "Store name/symbol in private string slots and override ERC721 name()/symbol() accessors — avoids OZ contracts-upgradeable dependency while still returning correct values from clones (RESEARCH.md Pitfall 5)"
  - "Call Clones.clone() and initialize() in one transaction in createCollection() — prevents front-running between deploy and init (Pitfall 4)"
  - "mintNFT() is onlyOwner (not public) — only the collection creator can mint, matching the per-creator collection design"
  - "royalty receiver set to msg.sender at mint time (collection owner) not to the factory — royalties flow to the creator"
  - "CollectionCreated event includes both name and symbol — subgraph can reconstruct collection metadata without querying contract"

patterns-established:
  - "Clone+initialize atomic pattern: Clones.clone() then Collection(clone).initialize() in same call"
  - "Implementation protection: constructor sets _initialized=true so implementation cannot be re-initialized"
  - "supportsInterface override with (ERC721, ERC721URIStorage, ERC2981) triple — same as NFTContract.sol pattern from 01-01"

# Metrics
duration: 4min
completed: "2026-02-21"
---

# Phase 1 Plan 04: CollectionFactory Summary

**EIP-1167 clone factory for gas-efficient per-creator ERC721 collections with per-token ERC-2981 royalties; 32 tests including full Marketplace compatibility verification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T08:30:13Z
- **Completed:** 2026-02-21T08:33:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Deployed `Collection.sol`: cloneable ERC721+ERC721URIStorage+ERC2981 implementation with custom name/symbol storage slots to work around OZ v5 constructor limitation; onlyOwner mintNFT with per-token royalty
- Deployed `CollectionFactory.sol`: EIP-1167 clone factory using `Clones.clone()` + atomic `initialize()` call; tracks all collections and per-creator collections with full view functions
- 32 tests passing across all 5 test blocks: factory deployment, collection creation, minting, marketplace compatibility (approve + list + buy + royalty payment verified end-to-end), and implementation protection
- 118 total tests across all test files pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Collection.sol and CollectionFactory.sol** - `a079c6a` (feat)
2. **Task 2: Create CollectionFactory tests** - `bce774f` (test)

## Files Created/Modified

- `contracts/contracts/Collection.sol` — Cloneable ERC721 implementation; name/symbol via storage overrides; onlyOwner mintNFT with ERC-2981 royalty; initialize guard; 119 lines
- `contracts/contracts/CollectionFactory.sol` — EIP-1167 clone factory; Clones.clone() + atomic init; allCollections, collectionsByCreator, totalCollections; 80 lines
- `contracts/test/CollectionFactory.test.js` — 32 tests covering all behaviors; uses ethers v6 and chai from hardhat-toolbox; 480 lines

## Decisions Made

- **Custom storage slots for name/symbol** instead of `@openzeppelin/contracts-upgradeable`. OZ v5 non-upgradeable ERC721 sets name/symbol only in the constructor which clones skip. Solution: declare `string private _collectionName` and `_collectionSymbol`, set them in `initialize()`, and override `name()`/`symbol()` to return them. Avoids adding an extra npm dependency.

- **mintNFT is `onlyOwner`** (not public like NFTContract.sol). Per-creator collections should only allow the creator to mint into them — this is the design intent. Non-owner mint reverts with `OwnableUnauthorizedAccount`.

- **Royalty receiver is `msg.sender` at mint time** (the creator/owner), not a configurable parameter. Keeps the interface simple and matches the per-creator model; royalties always go to the collection owner who minted the token.

- **CollectionCreated event emits both name and symbol**. The RESEARCH.md pattern only emitted `name`. Adding `symbol` enables subgraph indexing without a contract call, which is important for Phase 2 performance.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — compilation succeeded on first attempt, all 32 tests passed on first run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Collection.sol and CollectionFactory.sol are ready for integration with deploy scripts in plan 01-06
- Marketplace compatibility fully verified — Collection NFTs support approve + listItem + buyItem + ERC-2981 royalty payment
- No blockers for 01-05 (offer system): Collection NFTs are standard ERC-721 and work with the marketplace offer flow
- For plan 01-06: deploy script needs to deploy CollectionFactory (which auto-deploys Collection implementation in its constructor); `deployments/sepolia.json` should include `collectionFactoryAddress` and `collectionImplementationAddress`

---
*Phase: 01-contract-foundation*
*Completed: 2026-02-21*
