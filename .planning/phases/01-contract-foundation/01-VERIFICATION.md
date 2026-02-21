---
phase: 01-contract-foundation
verified: 2026-02-21T10:00:00Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: Deploy all four contracts to Sepolia testnet
    expected: deployments/sepolia.json written with nftContract, marketplace, auctionHouse, collectionFactory, and collectionImplementation addresses
    why_human: Requires real Sepolia ETH. contracts/.env has a placeholder DEPLOYER_PRIVATE_KEY and uses SEPOLIA_RPC_URL but hardhat.config.js reads ALCHEMY_SEPOLIA_URL -- this env var name mismatch must be fixed before deploying.
  - test: Verify all four contracts on Etherscan
    expected: Each contract source code readable on Sepolia Etherscan after running the printed npx hardhat verify commands
    why_human: Requires a real ETHERSCAN_API_KEY and completed Sepolia deployment.
---

# Phase 1: Contract Foundation Verification Report

**Phase Goal:** The full on-chain feature set is deployed to Sepolia with stable ABIs -- royalties paid on every settlement path, both auction types working, creator collections deployable via factory, and offers escrowed in contract
**Verified:** 2026-02-21T10:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | English auction: seller creates, buyers bid and get refunded when outbid, winner receives NFT on settlement with royalty and commission deducted | VERIFIED | AuctionHouse.sol: createEnglishAuction (line 134), placeBid with pendingReturns (line 183), settleAuction with _deductFeesAndPay (line 229). 37 English auction tests pass. |
| 2 | Dutch auction: price decreases linearly, first buyer wins immediately, royalty and commission paid | VERIFIED | AuctionHouse.sol: createDutchAuction (line 294), getCurrentPrice linear decay (line 346), buyDutch with _deductFeesAndPay (line 360). Tests for midpoint price, linear decrease, overpayment refund, royalty payment -- all pass. |
| 3 | Collection factory: user deploys named collection, mints NFTs, NFTs listable and purchasable on marketplace | VERIFIED | CollectionFactory.sol (86 lines) + Collection.sol (128 lines). Marketplace Compatibility: 7 tests -- all pass. |
| 4 | Offers: buyer escrows ETH, seller accepts or rejects, buyer cancels, accepting auto-cancels active listing | VERIFIED | Marketplace.sol: makeOffer (line 188), acceptOffer with _unlistIfActive (line 218), rejectOffer (line 253), cancelOffer (line 270). Auto-Unlist on Accept group (3 tests) all pass. |
| 5 | Royalty paid on every sale path; royalty + commission never overflows | VERIFIED | Both Marketplace._deductFeesAndPay (line 343) and AuctionHouse._deductFeesAndPay (line 455): require(royaltyAmount + commission <= salePrice). All 4 sale path tests pass. |
| 6 | All 175 tests pass locally | VERIFIED | npx hardhat test: 175 passing (6s), 0 failing. |
| 7 | Deploy script deploys all 4 contracts and writes deployments registry | VERIFIED | deploy.js deploys all 4 contracts, writes deployments/NETWORK.json with 5 addresses; hardhat.json and localhost.json confirmed. |
| 8 | Frontend ABIs include all Phase 1 contract functions | VERIFIED | contracts.ts: AUCTION_HOUSE, COLLECTION_FACTORY, COLLECTION sections; MARKETPLACE has offer functions and 5-arg ItemSold; NFT has 2-arg mintNFT and royaltyInfo. |
| 9 | Hardhat config has Etherscan verification block | VERIFIED | hardhat.config.js lines 30-32: etherscan block with ETHERSCAN_API_KEY env var. |
| 10 | Contracts deployed to Sepolia with valid addresses | HUMAN NEEDED | No deployments/sepolia.json exists. DEPLOYER_PRIVATE_KEY is a placeholder. Env var name mismatch (SEPOLIA_RPC_URL vs ALCHEMY_SEPOLIA_URL) blocks deployment. |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|
| contracts/contracts/NFTContract.sol | 66 | VERIFIED | ERC721 + ERC721URIStorage + ERC2981 + Ownable; mintNFT(tokenURI, royaltyBps) with 10% cap |
| contracts/contracts/Marketplace.sol | 414 | VERIFIED | listItem, buyItem, unlistItem, offer functions, _deductFeesAndPay, _unlistIfActive; CEI throughout |
| contracts/contracts/AuctionHouse.sol | 493 | VERIFIED | English + Dutch auctions, pull-payment, anti-sniping, NFT escrow, _deductFeesAndPay; IERC721Receiver |
| contracts/contracts/CollectionFactory.sol | 86 | VERIFIED | EIP-1167 Clones.clone() + atomic initialize() |
| contracts/contracts/Collection.sol | 128 | VERIFIED | Custom name/symbol slots, _initialized guard, mintNFT(onlyOwner), ERC2981 |
| contracts/scripts/deploy.js | 114 | VERIFIED | Deploys all 4 contracts, writes deployments JSON, preserves nftContractV1, prints verify commands |
| contracts/hardhat.config.js | 33 | VERIFIED | Solidity 0.8.20, etherscan block present |
| contracts/deployments/hardhat.json | -- | VERIFIED | All 5 addresses: nftContract, marketplace, auctionHouse, collectionFactory, collectionImplementation |
| contracts/deployments/localhost.json | -- | VERIFIED | All 5 addresses present |
| contracts/deployments/sepolia.json | -- | MISSING | Does not exist -- Sepolia deployment not performed |
| frontend/src/config/contracts.ts | 177 | VERIFIED | 5 contract sections: NFT, MARKETPLACE, AUCTION_HOUSE, COLLECTION_FACTORY, COLLECTION |
| frontend/.env | -- | VERIFIED | VITE_AUCTION_HOUSE_ADDRESS and VITE_COLLECTION_FACTORY_ADDRESS set to local addresses |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| AuctionHouse.sol | IERC2981.royaltyInfo | _deductFeesAndPay try/catch | WIRED | supportsInterface check then royaltyInfo in both settleAuction and buyDutch paths |
| Marketplace.sol | IERC2981.royaltyInfo | _deductFeesAndPay try/catch | WIRED | Same pattern in buyItem and acceptOffer paths |
| Marketplace.acceptOffer | activeListingByToken | _unlistIfActive() | WIRED | Line 236: _unlistIfActive called before NFT transfer; 3 tests verify auto-unlist |
| CollectionFactory.sol | Collection.sol | Clones.clone() + initialize() | WIRED | Clone deployed and initialized atomically in same transaction |
| Collection.sol | Marketplace.sol | ERC721 + ERC2981 interfaces | WIRED | 7 Marketplace Compatibility tests all pass |
| deploy.js | deployments/NETWORK.json | fs.writeFileSync | WIRED | Writes after all deployments; hardhat.json and localhost.json confirmed |
| contracts.ts | VITE env vars | import.meta.env | WIRED | All 4 contracts read from env vars; .env has all 4 set |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| ROYL-01 | SATISFIED | mintNFT(tokenURI, royaltyBps) with 10% cap in NFTContract and Collection |
| ROYL-02 | SATISFIED | Marketplace._deductFeesAndPay in buyItem |
| ROYL-03 | SATISFIED | AuctionHouse._deductFeesAndPay in settleAuction and buyDutch |
| ROYL-04 | SATISFIED | require(royaltyAmount + commission <= salePrice) in both contracts |
| EAUC-01 | SATISFIED | createEnglishAuction with NFT escrow via safeTransferFrom |
| EAUC-02 | SATISFIED | placeBid: bid must exceed highestBid and meet reservePrice |
| EAUC-03 | SATISFIED | pendingReturns mapping + withdrawBid (pull-payment, CEI) |
| EAUC-04 | SATISFIED | Anti-snipe: extend endTime if bid placed within ANTI_SNIPE_WINDOW |
| EAUC-05 | SATISFIED | settleAuction transfers NFT from contract to highestBidder |
| EAUC-06 | SATISFIED | _deductFeesAndPay called in settleAuction winner path |
| EAUC-07 | SATISFIED | settleAuction no-bid path returns NFT to seller |
| DAUC-01 | SATISFIED | createDutchAuction with NFT escrow |
| DAUC-02 | SATISFIED | getCurrentPrice: linear decay formula; tests at 25/50/75 percent pass |
| DAUC-03 | SATISFIED | buyDutch: a.sold = true in CEI before external calls |
| DAUC-04 | SATISFIED | buyDutch: overpayment refunded before NFT transfer |
| DAUC-05 | SATISFIED | _deductFeesAndPay called in buyDutch |
| COLL-01 | SATISFIED | CollectionFactory.createCollection(name, symbol) |
| COLL-02 | SATISFIED | Collection.mintNFT(onlyOwner) |
| COLL-03 | SATISFIED | Tests: listItem works for Collection contract addresses |
| COLL-04 | SATISFIED | Tests: buyItem works and royalty paid for Collection NFTs |
| COLL-05 | SATISFIED | Clones.clone() used; test confirms clone bytecode smaller than implementation |
| OFFR-01 | SATISFIED | makeOffer: ETH stored in contract (msg.value), Offer struct created |
| OFFR-02 | SATISFIED | acceptOffer: ownership check, CEI, NFT transfer, _deductFeesAndPay |
| OFFR-03 | SATISFIED | rejectOffer: marks inactive, transfers escrowed ETH to buyer |
| OFFR-04 | SATISFIED | cancelOffer: checks offer.buyer == msg.sender, marks inactive, refunds |
| OFFR-05 | SATISFIED | _unlistIfActive called in acceptOffer; 3 dedicated tests verify behavior |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| contracts/.env | DEPLOYER_PRIVATE_KEY is a placeholder (all a chars) | Info | Expected -- real key needed for Sepolia |
| contracts/.env | Uses SEPOLIA_RPC_URL but hardhat.config reads ALCHEMY_SEPOLIA_URL | Warning | Env var name mismatch will silently use empty RPC URL on Sepolia network |

No TODO/FIXME/placeholder comments in any Solidity contract. All handlers have real implementations. No empty returns in business logic.

### Human Verification Required

#### 1. Sepolia Deployment

**Test:** Fix the env var name mismatch first. The contracts/.env file has SEPOLIA_RPC_URL but hardhat.config.js reads process.env.ALCHEMY_SEPOLIA_URL. Rename the env var in one of those files so they match. Also set a real DEPLOYER_PRIVATE_KEY funded with Sepolia ETH, and set ETHERSCAN_API_KEY. Then run:

    cd contracts && npx hardhat run scripts/deploy.js --network sepolia

**Expected:** deployments/sepolia.json written with all 5 addresses. Copy printed VITE_ values to frontend/.env.

**Why human:** Requires real Sepolia ETH, a real wallet private key, and a valid Alchemy RPC endpoint.

#### 2. Etherscan Verification

**Test:** After Sepolia deployment, run each printed npx hardhat verify command.

**Expected:** All four contracts verified and readable on Sepolia Etherscan.

**Why human:** Requires Sepolia deployment to complete and ETHERSCAN_API_KEY to be set.

### Gaps Summary

All on-chain contract logic is complete and fully tested (175/175 tests passing). The single outstanding item is Sepolia deployment, gated on human action:

1. Fix env var name mismatch: contracts/.env has SEPOLIA_RPC_URL but hardhat.config.js reads ALCHEMY_SEPOLIA_URL. Rename one to match.
2. Replace placeholder DEPLOYER_PRIVATE_KEY with a real wallet private key funded with Sepolia ETH.
3. Run: cd contracts && npx hardhat run scripts/deploy.js --network sepolia
4. Commit deployments/sepolia.json.

The deploy script, hardhat config, and frontend ABI configuration are fully implemented and production-ready pending these credentials.

---

_Verified: 2026-02-21T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
