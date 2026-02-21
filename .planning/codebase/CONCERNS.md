# Codebase Concerns

**Analysis Date:** 2026-02-21

## Tech Debt

**Hardhat Config Mismatch:**
- Issue: `hardhat.config.js` uses `ALCHEMY_SEPOLIA_URL` but docs reference `SEPOLIA_RPC_URL`
- Files: `contracts/hardhat.config.js` (line 18), `contracts/.env` (line 1)
- Impact: Sepolia deployments will fail due to missing environment variable. Users following CLAUDE.md will set wrong env var.
- Fix approach: Standardize on one variable name across config and documentation. Update `hardhat.config.js` to use `SEPOLIA_RPC_URL`.

**Exposed Secrets in .env Files:**
- Issue: Real API keys and private keys visible in committed `.env` files
- Files: `contracts/.env` (lines 2-5), `frontend/.env` (lines 6-7)
- Impact: Private key exposed (even if dummy): `0x9363ff047551e60c314a09cf62a269d471bafcf44a8c6aaaaaaaaaaaaaaaa`. Pinata API key partially visible: `b9ba4ef5908dc815dbfa`
- Fix approach: Ensure `.env` is in `.gitignore` (currently listed), but these files should never be committed. Use `.env.example` for documentation only. Consider rotating exposed keys immediately.

**No Frontend Testing Infrastructure:**
- Issue: No test suite configured for React frontend; only backend tests exist
- Files: All `frontend/src/**/*.tsx` files
- Impact: Component logic changes can introduce regressions silently. No confidence in refactors.
- Fix approach: Add vitest or jest with React Testing Library. Start with hooks (`useWallet.ts`, `useContracts.ts`) and critical pages (Marketplace.tsx, Dashboard.tsx).

**Hard-coded Contract Addresses in Code:**
- Issue: Default addresses duplicated in `config/contracts.ts` as fallback
- Files: `frontend/src/config/contracts.ts` (lines 7, 30)
- Impact: If defaults become incorrect (e.g., after redeploying), every user must update code. Address changes not backward-compatible.
- Fix approach: Remove hardcoded fallbacks. Require explicit env vars or provide clear error message. Consider contract registry pattern.

**Missing Error Handling in IPFS Operations:**
- Issue: No retry logic or fallback gateway for IPFS failures
- Files: `frontend/src/pages/Marketplace.tsx` (lines 43-50), `frontend/src/pages/Dashboard.tsx` (lines 61-68), `frontend/src/pages/NFTDetail.tsx` (lines 67-74)
- Impact: Metadata fetch failures silently fail with empty name/image. No user feedback. Pinata outage = broken UI for all NFTs.
- Fix approach: Add retry logic with exponential backoff in `ipfs.ts`. Use secondary gateway (Cloudflare IPFS, Infura) as fallback. Show loading skeleton during fetch.

---

## Known Bugs

**Step State Mismatch in MintForm:**
- Bug: Step counter logic incorrect when moving from upload to details
- Symptoms: Step jumps between 1 and 2 instead of 0 → 1 → 2 → 3 sequence
- Files: `frontend/src/components/MintForm.tsx` (lines 56, 70)
- Trigger: Upload image, fill form, submit. Step counter will show incorrect progression.
- Workaround: None—UI shows wrong step visually but minting still completes.

**Dashboard Statistics Not Implemented:**
- Bug: "Listed" count and "Total Volume" always hardcoded to 0
- Symptoms: Dashboard shows 0 listed NFTs even if user has active listings; 0 ETH volume
- Files: `frontend/src/pages/Dashboard.tsx` (lines 161, 177)
- Trigger: List an NFT, return to dashboard. Statistics don't update.
- Workaround: Check Marketplace page or NFTDetail to see listings.

**Window Location Reload Causes User State Loss:**
- Bug: `window.location.reload()` in buyItem and unlistItem handlers destroys wallet connection
- Symptoms: After buying/unlisting NFT, user is disconnected. Page reloads without graceful transition.
- Files: `frontend/src/pages/NFTDetail.tsx` (lines 115, 132)
- Trigger: Click buy or unlist button. Transaction completes, then full page reload occurs.
- Workaround: User manually reconnects wallet. Data is refreshed but UX broken.

**Uncaught Promise in Wallet Auto-Connect:**
- Bug: Promise chain in auto-connect effect doesn't handle all errors
- Symptoms: Silent failure if MetaMask denies eth_accounts permission. No error state updates.
- Files: `frontend/src/hooks/useWallet.ts` (lines 85-92)
- Trigger: User denies wallet permission on first visit, then opens browser console. No error visible in UI.
- Workaround: Manual connection still works; auto-connect can fail silently.

---

## Security Considerations

**Inadequate Input Validation on IPFS Metadata:**
- Risk: Fetched metadata from IPFS not validated. Malicious or malformed JSON could cause crashes.
- Files: `frontend/src/pages/Marketplace.tsx` (lines 44-50), `frontend/src/pages/Dashboard.tsx` (lines 62-68), `frontend/src/pages/NFTDetail.tsx` (lines 68-74)
- Current mitigation: Try-catch swallows errors and uses defaults. No type validation.
- Recommendations: Add schema validation for metadata (zod or similar). Validate image URLs. Add timeout on fetch. Sanitize name/description for XSS.

**No Rate Limiting on Contract Calls:**
- Risk: Frontend makes unlimited contract calls. User can spam listings/approvals.
- Files: `frontend/src/pages/Marketplace.tsx` (line 97), `frontend/src/components/ListingModal.tsx` (line 49)
- Current mitigation: Only visual "loading" state. Multiple rapid clicks can trigger multiple transactions.
- Recommendations: Debounce/throttle button clicks. Disable button during transaction. Show nonce tracking.

**Private Keys Potentially Exposed in Error Messages:**
- Risk: Error messages from contract interactions logged to console and shown in toast. If transaction includes sensitive data, it could leak.
- Files: `frontend/src/pages/Marketplace.tsx` (lines 103-107), `frontend/src/pages/NFTDetail.tsx` (lines 116-120)
- Current mitigation: Using `err.reason` and `err.message` which should be safe, but no sanitization.
- Recommendations: Only show user-friendly error messages (e.g., "Transaction failed"). Log full errors to console only in dev mode. Never expose raw error objects to UI.

**Approve Forever Pattern (ERC721):**
- Risk: `approve()` gives marketplace unlimited control over single NFT, but combined with `safeTransferFrom()` in contract, NFT control ends after one transaction. However, if contract has vulnerability, all approved NFTs could be at risk.
- Files: `frontend/src/components/ListingModal.tsx` (line 41), `contracts/contracts/Marketplace.sol` (line 93)
- Current mitigation: Marketplace uses `safeTransferFrom()` which is safe, but approval is per-token not per-transaction.
- Recommendations: Consider using `setApprovalForAll` with explicit revoke function. Or use permit-style pattern if moving to ERC721Permit in future.

**No Owner Verification on NFT Burning:**
- Risk: `burn()` in NFTContract relies only on `ownerOf()` check, but burned tokens don't revert cleanly in some ERC721 implementations.
- Files: `contracts/contracts/NFTContract.sol` (lines 29-33)
- Current mitigation: OpenZeppelin ERC721 handles it correctly, but no additional access control.
- Recommendations: Audit against accidental burns. Add optional burn prevention flag per NFT type. Document irreversible behavior clearly.

---

## Performance Bottlenecks

**Quadratic Loop in Dashboard NFT Enumeration:**
- Problem: Fetches all NFTs ever minted and checks ownership for each. O(n) calls to `ownerOf()`.
- Files: `frontend/src/pages/Dashboard.tsx` (lines 52-73)
- Cause: No indexed event listeners or off-chain indexing. Frontend iterates sequentially.
- Improvement path:
  1. Short-term: Add pagination. Fetch first 100, then paginate.
  2. Medium-term: Use contract events (emit on mint) and cache results.
  3. Long-term: Deploy Graph Protocol indexer or similar subgraph for efficient queries.

**Metadata Fetch Happens Sequentially in Marketplace:**
- Problem: Marketplace page fetches listings, then for each listing fetches metadata JSON one-by-one. 10 NFTs = 10 serial HTTP requests.
- Files: `frontend/src/pages/Marketplace.tsx` (lines 38-61)
- Cause: Loop does `await fetch()` inside for-of, blocking next iteration.
- Improvement path: Use `Promise.all()` or `Promise.allSettled()` to fetch all metadata in parallel. With 10 NFTs, should drop from ~5s to ~500ms.

**_activeListingIds Array Scan on Every Removal:**
- Problem: `_removeActiveListing()` scans entire array to find and remove listing. O(n) per removal.
- Files: `contracts/contracts/Marketplace.sol` (lines 164-172)
- Cause: Dynamic array doesn't support indexed removal. Uses swap-and-pop but still scans full array.
- Improvement path: Convert `_activeListingIds` to a mapping of `listing ID → index`, then remove in O(1). Requires refactor of view functions.

---

## Fragile Areas

**Wallet Connection Event Listeners Not Cleaned Up:**
- Files: `frontend/src/hooks/useWallet.ts` (lines 94-105)
- Why fragile: Event listeners registered in useEffect but never removed. Multiple component mounts = multiple listeners. Can cause memory leaks or duplicate reconnections.
- Safe modification: Add cleanup function that removes listeners: `return () => { window.ethereum.removeListener(...) }`
- Test coverage: No test for multiple mount/unmount cycles of hook.

**Contract ABI Hardcoded as Strings:**
- Files: `frontend/src/config/contracts.ts` (lines 8-44)
- Why fragile: If contract implementation changes, ABI strings don't auto-update. Easy to create version mismatch between contracts and frontend.
- Safe modification: Generate ABI from compiled contract JSON and import instead of hardcoding. Add build-time validation.
- Test coverage: No validation that ABI matches deployed contract. Runtime errors if mismatch discovered.

**IPFS Gateway Hardcoded for IPFS Conversion:**
- Files: `frontend/src/services/ipfs.ts` (line 58)
- Why fragile: If Pinata gateway goes down or changes rate limiting, all `ipfsToHttp()` calls fail silently. No fallback.
- Safe modification: Support multiple gateways with failover. Try primary, then fallback to Cloudflare or Infura.
- Test coverage: No test for gateway unavailability or timeout scenarios.

**Step State in MintForm (Visual/Logic Mismatch):**
- Files: `frontend/src/components/MintForm.tsx` (lines 27, 56, 70, 80)
- Why fragile: Step state updated inconsistently. Both line 56 and 70 set `setStep(2)`. Step should be incremental but logic has jumps.
- Safe modification: Refactor to explicit step constants: `STEP.UPLOAD=0, STEP.DETAILS=1, STEP.MINTING=2`. Update step only after async operation completes.
- Test coverage: No tests for form flow. Easy to add step in future and break UI.

**No Error Recovery in ListingModal:**
- Files: `frontend/src/components/ListingModal.tsx` (lines 35-72)
- Why fragile: If approval fails, listing step never runs. Modal stays open with ambiguous state. No retry button.
- Safe modification: Add explicit error state. Show error message and "Retry" button. Close modal only after both approve AND list succeed.
- Test coverage: No test for partial failure scenarios (approve succeeds, list fails).

---

## Scaling Limits

**_activeListingIds Array Unbounded:**
- Current capacity: No practical limit, but array scan O(n) becomes slow > 1000 listings
- Limit: With ~5-10ms per contract call, scanning 10,000 listings = 50-100s delay
- Scaling path: Replace array with mapping(listingId => bool isActive). Track count separately. Pagination required in frontend.

**No Database for User Metrics:**
- Current capacity: Dashboard stats hardcoded. Can't track "total volume" without indexer.
- Limit: MVP works for <100 users. At 1000+ users with active trading, will need real analytics.
- Scaling path: Deploy Graph Protocol subgraph to index events. Query GraphQL endpoint instead of frontend loops.

**Pinata API Rate Limits:**
- Current capacity: Free tier allows ~3 concurrent uploads, ~180 requests/min
- Limit: More than 3-5 users simultaneously uploading = rate limiting errors
- Scaling path: Upgrade to Pinata paid tier, or integrate web3.storage/Lighthouse for more throughput. Implement request queuing.

**MetaMask Limitations:**
- Current capacity: Works fine for single wallet connection per user
- Limit: No support for multi-sig wallets, hardware wallets with browser incompatibilities, or institutional custodians
- Scaling path: Add WalletConnect v2 for broader wallet support. Allow multiple wallet backends.

---

## Dependencies at Risk

**Hardhat v2.22 / OpenZeppelin v5 Compatibility:**
- Risk: Hardhat 2.22 is stable but OpenZeppelin v5 is relatively new. If critical security issues found, patching may lag.
- Impact: Contract security patches may take time. Testnet deployments are safe to test.
- Migration plan: Monitor OpenZeppelin security advisories. Plan upgrade to v5.1+ when released. Lock versions in package-lock.json.

**Vite v6 with React 19:**
- Risk: React 19 has opt-in "use client" semantics. Vite 6 still new (released late 2024). Edge cases may exist.
- Impact: Build issues, SSR incompatibilities if migrating later. Component library compatibility (Ant Design v5 is compatible but may have edge cases).
- Migration plan: Test on new minor versions before adopting. Current versions (Vite 6.0.0, React 19.0.0) stable for MVP. Monitor breaking changes in next releases.

**Ethers.js v6 with TypeScript:**
- Risk: Ethers v6 major changes to API (no providers.json, signature changes). If contract calls break, debugging is hard.
- Impact: Type errors from ethers not caught until runtime contract calls fail.
- Migration plan: Add strict TypeScript config (`strictNullChecks: true`). Test contract calls in integration tests. Lock ethers to v6.13.x.

**Ant Design v5 Dark Theme:**
- Risk: Dark theme not official in v5. Custom theme applied via inline styles. Updates may break styling.
- Impact: If Ant Design changes component structure, all inline gradients and custom styles must be updated.
- Migration plan: Extract theme constants to `theme.ts`. Use Ant Design v6 (when released) which has better dark mode support. Test design after each Ant Design patch.

---

## Missing Critical Features

**No Transaction Indexing or History:**
- Problem: TransactionHistory component shows demo data only. No actual transaction tracking.
- Blocks: Users can't view their activity. No analytics for sellers.
- Current state: Hardcoded fake transactions in `TransactionHistory.tsx` (lines 74-99)
- Solution path:
  1. Emit events from contracts (already done: ItemSold, ItemListed, NFTMinted)
  2. Listen to events and store in localStorage or IndexedDB
  3. Replace demo data with real event-based transactions

**No Bulk Operations:**
- Problem: Can only mint, list, or buy one NFT at a time.
- Blocks: Power users and creators can't batch actions.
- Current state: Forms designed for single NFT only.
- Solution path: Add "batch listing" modal. Add "bulk approve". Requires contract batch functions or frontend loops with gas optimization.

**No Royalty Support:**
- Problem: Creators get no secondary sale revenue. Only marketplace owner gets commission.
- Blocks: Sustainable creator economy.
- Current state: Commission hardcoded to marketplace owner only (`Marketplace.sol` line 89).
- Solution path: Support ERC2981 royalty standard. Store creator address with NFT. Split payment on resale.

**No Filtering by Collection:**
- Problem: Marketplace shows all NFTs mixed. No way to view by creator/contract.
- Blocks: Discoverability of creators' work.
- Current state: Single NFTContract deployed. If multiple contracts existed, no UI to filter.
- Solution path: Add collection selector. Support multiple NFT contracts. Refactor to marketplace-agnostic pattern.

---

## Test Coverage Gaps

**Marketplace Contract Reentrancy Coverage:**
- What's not tested: Multi-level reentrancy with different callers in same transaction
- Files: `contracts/contracts/Marketplace.sol` (lines 80-110), `contracts/test/Marketplace.test.js` (lines 90-110)
- Risk: ReentrancyGuard is used but only basic reentrancy tested. Doesn't test edge case of attacker contract calling back through intermediate function.
- Priority: **High** - Reentrancy is critical security issue for marketplace. Add test that deploys attacker contract and attempts callback.

**Frontend Wallet Disconnection Edge Cases:**
- What's not tested: Chain switching mid-transaction, user rejecting signature, MetaMask locked state
- Files: `frontend/src/hooks/useWallet.ts`, `frontend/src/pages/Marketplace.tsx`
- Risk: UI may hang or show incorrect state if wallet becomes unavailable during operation.
- Priority: **High** - User-facing flow. App should gracefully handle wallet state changes.

**IPFS Metadata Validation:**
- What's not tested: Malformed JSON, missing fields, oversized files, timeout scenarios
- Files: `frontend/src/pages/Marketplace.tsx` (lines 43-50), `frontend/src/services/ipfs.ts`
- Risk: App crashes or shows broken UI if metadata doesn't match expected schema.
- Priority: **Medium** - Affects UX but has silent fallback (shows `NFT #id` if metadata fails).

**Price Overflow/Underflow in Commission Calculation:**
- What's not tested: Extreme prices (near uint256 max), precision loss in division
- Files: `contracts/contracts/Marketplace.sol` (line 89), `contracts/test/Marketplace.test.js` (lines 80-97)
- Risk: At very high prices (>1000 ETH), commission calculation may lose precision or overflow.
- Priority: **Low** - Unlikely with reasonable market prices, but should be documented.

**Frontend Error Boundary:**
- What's not tested: Component crash handling, error recovery UI
- Files: All `frontend/src/**/*.tsx` files
- Risk: One bad component crashes entire app. No graceful degradation.
- Priority: **Medium** - Add ErrorBoundary component to catch React errors. Already has try-catch for contract calls but not UI errors.

---

*Concerns audit: 2026-02-21*
