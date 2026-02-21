# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users can create, discover, and trade NFTs through a smooth, real-time marketplace experience that showcases the full Web3 development stack.
**Current focus:** Phase 1 — Contract Foundation

## Current Position

Phase: 1 of 5 (Contract Foundation)
Plan: 2 of 6 in current phase
Status: In progress
Last activity: 2026-02-21 — Completed 01-02-PLAN.md (AuctionHouse English auction contract)

Progress: [██░░░░░░░░] 8% (2/26 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 4 min
- Total execution time: 8 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-contract-foundation | 2/6 | 8 min | 4 min |

**Recent Trend:**
- Last 5 plans: 4 min, 4 min
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: ERC-2981 via ERC721Royalty (already in OZ v5 tree — zero new packages)
- [Roadmap]: AuctionHouse.sol custom contract (no viable third-party library for OZ v5); pull-payment pattern required to prevent bid reentrancy (P-04)
- [Roadmap]: CollectionFactory.sol uses EIP-1167 minimal proxies — gas-efficient, each collection gets its own address for subgraph entity isolation
- [Roadmap]: Backend is read accelerator only — never financial authority; all purchase/auction state must be verified against contract before any transaction (P-14)
- [01-01]: Use ERC2981 directly (not ERC721Royalty) — avoids supportsInterface diamond conflict with ERC721URIStorage in OZ v5
- [01-01]: mintNFT signature changed to 2-arg: mintNFT(string tokenURI, uint96 royaltyBps) — BREAKING CHANGE for frontend Create page and any existing deploy scripts
- [01-01]: activeListingByToken reverse mapping added in 01-01 (not deferred to 01-05) — touched same code paths, cleaner to do together
- [01-01]: _deductFeesAndPay is the canonical settlement function — all downstream plans (01-02, 01-03, 01-05) must use this pattern for royalty payment
- [01-02]: IERC721Receiver implemented on AuctionHouse — safeTransferFrom escrow requires it; plain transferFrom would bypass approval checks
- [01-02]: _deductFeesAndPay copied verbatim from Marketplace.sol — per-contract copy, no shared library (RESEARCH.md recommendation)
- [01-02]: settleAuction is permissionless (any caller) — prevents stuck auctions if seller/winner is unresponsive
- [01-02]: Anti-snipe is additive (endTime += EXTENSION, not reset to now+10min) — preserves original end-time contract integrity

### Pending Todos

- Frontend: mintNFT calls in Create page must be updated to pass royaltyBps (default 0 until UI input is added in Phase 3)
- Frontend: ItemSold event listener must handle new 5-arg signature (added royalty field)

### Blockers/Concerns

- [Phase 1]: Redeploying NFTContract.sol to add ERC-2981 means existing MVP NFTs (minted without royalty support) will have a different contract address. Dashboard ownerOf enumeration must handle both old and new contract addresses — needs explicit decision in Phase 1 plan.
- [Phase 2]: graph-cli and graph-ts version estimates (~0.91.x / ~0.35.x) need verification with `npm info` before Phase 2 begins.
- [Phase 4]: Chain reorganization + WebSocket broadcast interaction (P-16) needs explicit test design before implementing the listener — write the test scenario first.

## Session Continuity

Last session: 2026-02-21T08:33:20Z
Stopped at: Completed 01-02-PLAN.md — AuctionHouse English auction contract (2 tasks, 86 tests passing)
Resume file: None
