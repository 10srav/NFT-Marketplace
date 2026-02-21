# Phase 1: Contract Foundation - Research

**Researched:** 2026-02-21
**Domain:** Solidity smart contracts — ERC-2981 royalties, English/Dutch auctions, EIP-1167 clone factory, ETH offer escrow
**Confidence:** HIGH (all core findings verified against installed source code or official documentation)

---

## Summary

Phase 1 adds four new feature areas to the existing Hardhat/OZ v5 contract suite: royalty signals (ERC-2981), two auction types (English and Dutch), a per-creator collection factory (EIP-1167 clones), and an ETH offer/escrow system inside Marketplace.sol.

The installed package (`@openzeppelin/contracts@5.4.0`) already contains every primitive needed: `ERC721Royalty`, `ERC2981`, `Clones`, and `ReentrancyGuard`. No new npm packages are required for contract work. The upgrade package (`@openzeppelin/contracts-upgradeable`) would be needed only if collection clones use OZ's `Initializable` — the simpler alternative is a custom one-shot `initialize()` guard, which avoids adding a new dependency.

The single hardest problem is combining `ERC721URIStorage` and `ERC721Royalty` in the same contract: both override `supportsInterface` and (in some versions) `_burn`. The verified solution is to inherit from `ERC721URIStorage` and `ERC2981` directly rather than from `ERC721Royalty`, then override `supportsInterface` explicitly. This sidesteps the diamond-inheritance conflict entirely.

**Primary recommendation:** Use `ERC2981` (not `ERC721Royalty`) alongside `ERC721URIStorage`; use `ReentrancyGuard` + `nonReentrant` on every state-changing auction/offer function; use `Clones.clone()` + a manual `initialize()` guard for the factory.

---

## Standard Stack

### Core (all already installed in `contracts/node_modules`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@openzeppelin/contracts` | 5.4.0 | ERC721, ERC2981, Clones, ReentrancyGuard, Pausable, Ownable | Already in tree; no new packages |
| `hardhat` | ^2.22.0 | Compile, test, deploy | Already in devDeps |
| `@nomicfoundation/hardhat-toolbox` | ^5.0.0 | Bundled chai, ethers v6, hardhat-network-helpers, hardhat-verify | Already in devDeps |

### Supporting (no new packages needed)

| Library | Available At | Purpose | When to Use |
|---------|-------------|---------|-------------|
| `@nomicfoundation/hardhat-network-helpers` | bundled in toolbox v5 | `time.increase`, `time.latest`, `loadFixture` | All auction/offer time-dependent tests |
| `@nomicfoundation/hardhat-verify` | bundled in toolbox v5 | `npx hardhat verify --network sepolia` | Step 01-06 Etherscan verification |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ERC2981` directly | `ERC721Royalty` (wrapper) | `ERC721Royalty` conflicts with `ERC721URIStorage`'s `_burn` override in some OZ versions — use `ERC2981` directly |
| Custom `initialize()` guard | OZ `Initializable` from `@openzeppelin/contracts-upgradeable` | Adds a second npm package; custom guard is 4 lines and sufficient for non-upgradeable clones |
| Manual pull-payment mapping | OZ `PullPayment` | PullPayment is removed in OZ v5 (it was in v4); implement `pendingReturns` mapping manually |

**Installation:** No new packages needed. All primitives are in the existing `@openzeppelin/contracts@5.4.0`.

---

## Architecture Patterns

### Recommended Project Structure

```
contracts/
├── contracts/
│   ├── NFTContract.sol          # Updated: add ERC2981 royalty (plan 01-01)
│   ├── Marketplace.sol          # Updated: add offer system (plan 01-05)
│   ├── AuctionHouse.sol         # New: English + Dutch auctions (plans 01-02, 01-03)
│   ├── CollectionFactory.sol    # New: EIP-1167 clone factory (plan 01-04)
│   └── Collection.sol           # New: cloneable ERC721 implementation contract
├── scripts/
│   ├── deploy.js                # Updated: deploy all 4 contracts
│   └── verify.js                # New or inline: post-deploy Etherscan verification
├── deployments/
│   └── sepolia.json             # New: canonical address registry for all contracts
└── test/
    ├── NFTContract.test.js      # Updated: royalty tests added
    ├── Marketplace.test.js      # Updated: royalty-in-buy + offer tests
    ├── AuctionHouse.test.js     # New: English + Dutch auction tests
    └── CollectionFactory.test.js # New: factory + per-collection mint tests
```

### Pattern 1: ERC-2981 Royalty in NFTContract.sol

**What:** Inherit `ERC2981` alongside `ERC721URIStorage`. Call `_setTokenRoyalty(tokenId, msg.sender, feeNumerator)` inside `mintNFT()`. Override `supportsInterface` to resolve diamond conflict.

**When to use:** Every NFT mint — sets per-token royalty at creation time.

```solidity
// Source: installed @openzeppelin/contracts@5.4.0 — verified from node_modules
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract NFTContract is ERC721, ERC721URIStorage, ERC2981, Ownable {
    uint256 private _nextTokenId;
    uint256 public constant MAX_ROYALTY_BPS = 1000; // 10%

    function mintNFT(string memory _tokenURI, uint96 royaltyBps)
        public returns (uint256)
    {
        require(royaltyBps <= MAX_ROYALTY_BPS, "Royalty exceeds 10%");
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        _setTokenRoyalty(tokenId, msg.sender, royaltyBps);
        emit NFTMinted(msg.sender, tokenId, _tokenURI);
        return tokenId;
    }

    // Required: resolve supportsInterface conflict between ERC721URIStorage and ERC2981
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Required: resolve tokenURI conflict
    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
```

**Key insight:** `ERC721Royalty` is simply `ERC2981 + ERC721` with a `supportsInterface` override. Using `ERC2981` directly avoids a `_burn` conflict with `ERC721URIStorage` and gives identical runtime behavior.

### Pattern 2: Royalty Payment in Marketplace.buyItem and Auction Settlement

**What:** Query `IERC2981.royaltyInfo(tokenId, salePrice)` at settlement time. Deduct royalty from gross proceeds before paying seller. Guard with `supportsInterface` check so non-2981 NFTs still work.

**When to use:** Every settlement path — fixed-price buy, English auction settle, Dutch auction buy, offer accept.

```solidity
// Source: adapted from benber86/nft_royalties_market pattern (verified pattern)
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

function _payRoyaltyAndSeller(
    address nftContract,
    uint256 tokenId,
    address payable seller,
    uint256 salePrice
) internal {
    uint256 royaltyAmount = 0;
    if (IERC165(nftContract).supportsInterface(type(IERC2981).interfaceId)) {
        (address royaltyReceiver, uint256 amount) =
            IERC2981(nftContract).royaltyInfo(tokenId, salePrice);
        if (amount > 0 && royaltyReceiver != address(0)) {
            royaltyAmount = amount;
            payable(royaltyReceiver).transfer(royaltyAmount);
        }
    }
    uint256 commission = (salePrice * commissionRate) / COMMISSION_DENOMINATOR;
    // ROYL-04: combined check — royalty + commission must not exceed sale price
    require(royaltyAmount + commission <= salePrice, "Fees exceed sale price");
    uint256 sellerProceeds = salePrice - royaltyAmount - commission;
    seller.transfer(sellerProceeds);
}
```

### Pattern 3: English Auction — Pull-Payment with Anti-Sniping

**What:** NFT escrowed in AuctionHouse at creation. Bids credited to `pendingReturns` mapping (pull, not push). Anti-snipe: if bid arrives in last 10 minutes, extend `endTime` by 10 minutes. Settlement callable by anyone after expiry.

**When to use:** Plan 01-02.

```solidity
// Source: canonical pattern from Solidity documentation + security research
struct EnglishAuction {
    address nftContract;
    uint256 tokenId;
    address payable seller;
    uint256 startTime;
    uint256 endTime;
    uint256 reservePrice;
    address highestBidder;
    uint256 highestBid;
    bool settled;
}

mapping(uint256 => EnglishAuction) public auctions;
// Pull-payment: bidders withdraw their own refunds
mapping(uint256 => mapping(address => uint256)) public pendingReturns;

uint256 public constant ANTI_SNIPE_WINDOW = 10 minutes;
uint256 public constant ANTI_SNIPE_EXTENSION = 10 minutes;

function placeBid(uint256 auctionId) external payable nonReentrant whenNotPaused {
    EnglishAuction storage a = auctions[auctionId];
    require(block.timestamp < a.endTime, "Auction ended");
    require(msg.value > a.highestBid, "Bid too low");
    require(msg.value >= a.reservePrice, "Below reserve");

    // Credit previous highest bidder (pull pattern — no push)
    if (a.highestBidder != address(0)) {
        pendingReturns[auctionId][a.highestBidder] += a.highestBid;
    }

    a.highestBidder = msg.sender;
    a.highestBid = msg.value;

    // Anti-sniping: extend if bid is within final window
    if (a.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
        a.endTime += ANTI_SNIPE_EXTENSION;
    }
    emit BidPlaced(auctionId, msg.sender, msg.value, a.endTime);
}

function withdrawBid(uint256 auctionId) external nonReentrant {
    uint256 amount = pendingReturns[auctionId][msg.sender];
    require(amount > 0, "Nothing to withdraw");
    pendingReturns[auctionId][msg.sender] = 0; // Zero before transfer (re-entrancy guard)
    payable(msg.sender).transfer(amount);
}

function settleAuction(uint256 auctionId) external nonReentrant {
    EnglishAuction storage a = auctions[auctionId];
    require(block.timestamp >= a.endTime, "Not ended");
    require(!a.settled, "Already settled");
    a.settled = true;
    if (a.highestBidder != address(0)) {
        // Transfer NFT to winner, pay seller minus royalty+commission
        IERC721(a.nftContract).safeTransferFrom(address(this), a.highestBidder, a.tokenId);
        _payRoyaltyAndSeller(a.nftContract, a.tokenId, a.seller, a.highestBid);
    } else {
        // No bids — return NFT to seller
        IERC721(a.nftContract).safeTransferFrom(address(this), a.seller, a.tokenId);
    }
    emit AuctionSettled(auctionId, a.highestBidder, a.highestBid);
}
```

### Pattern 4: Dutch Auction — Linear Price Decay View Function

**What:** Price computed on-demand via a `view` function — no storage writes during the auction. First buyer to call `buy()` at current price wins. Seller can cancel if unsold.

**When to use:** Plan 01-03.

```solidity
// Source: canonical pattern from Solidity-by-Example Dutch Auction + community consensus
struct DutchAuction {
    address nftContract;
    uint256 tokenId;
    address payable seller;
    uint256 startPrice;
    uint256 endPrice;
    uint256 startTime;
    uint256 duration;
    bool sold;
    bool cancelled;
}

function getCurrentPrice(uint256 auctionId) public view returns (uint256) {
    DutchAuction storage a = dutchAuctions[auctionId];
    if (block.timestamp >= a.startTime + a.duration) {
        return a.endPrice; // Floor price after duration
    }
    uint256 elapsed = block.timestamp - a.startTime;
    uint256 priceRange = a.startPrice - a.endPrice;
    uint256 discount = (priceRange * elapsed) / a.duration; // Linear decay
    return a.startPrice - discount;
}

function buyDutch(uint256 auctionId) external payable nonReentrant whenNotPaused {
    DutchAuction storage a = dutchAuctions[auctionId];
    require(!a.sold && !a.cancelled, "Not available");
    uint256 currentPrice = getCurrentPrice(auctionId);
    require(msg.value >= currentPrice, "Insufficient payment");
    a.sold = true;
    // Refund overpayment
    if (msg.value > currentPrice) {
        payable(msg.sender).transfer(msg.value - currentPrice);
    }
    IERC721(a.nftContract).safeTransferFrom(address(this), msg.sender, a.tokenId);
    _payRoyaltyAndSeller(a.nftContract, a.tokenId, a.seller, currentPrice);
    emit DutchAuctionSold(auctionId, msg.sender, currentPrice);
}
```

### Pattern 5: CollectionFactory — EIP-1167 Clones with Manual Initialize Guard

**What:** Deploy one `Collection` implementation contract. Factory calls `Clones.clone(implementation)` then `Collection(clone).initialize(name, symbol, creator)`. Custom `bool _initialized` guard prevents re-init. No upgradeable package needed.

**When to use:** Plan 01-04.

```solidity
// Source: OpenZeppelin Clones.sol (installed v5.4.0) + RareSkills EIP-1167 pattern
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

// --- CollectionFactory.sol ---
contract CollectionFactory is Ownable {
    address public immutable collectionImplementation;
    address[] public allCollections;

    event CollectionCreated(address indexed creator, address indexed collection, string name);

    constructor() Ownable(msg.sender) {
        collectionImplementation = address(new Collection());
    }

    function createCollection(string memory name, string memory symbol)
        external returns (address)
    {
        address clone = Clones.clone(collectionImplementation);
        Collection(clone).initialize(name, symbol, msg.sender);
        allCollections.push(clone);
        emit CollectionCreated(msg.sender, clone, name);
        return clone;
    }
}

// --- Collection.sol (the implementation contract) ---
contract Collection is ERC721, ERC721URIStorage, ERC2981, Ownable {
    bool private _initialized;

    // Constructor disables this implementation from being used directly
    constructor() ERC721("", "") Ownable(msg.sender) {
        _initialized = true; // Prevent the implementation itself from being initialized
    }

    function initialize(string memory name, string memory symbol, address creator)
        external
    {
        require(!_initialized, "Already initialized");
        _initialized = true;
        // Set ERC721 name/symbol — requires internal setter or assembly
        // OZ v5 ERC721 stores name/symbol as immutables via constructor
        // SOLUTION: Use storage slots directly or override name()/symbol()
        _creator = creator;
        _transferOwnership(creator);
    }
    // ... mintNFT, supportsInterface overrides etc.
}
```

**OZ v5 ERC721 name/symbol limitation:** In OZ v5, `ERC721` stores `name` and `symbol` as constructor-set storage values (not immutables in v5.4.0 — they are `string private _name` and `string private _symbol`). They can be set via a custom `_initERC721(name, symbol)` internal function or by calling `__ERC721_init` from the upgradeable variant. The simplest approach for a non-upgradeable clone: override `name()` and `symbol()` to return values from storage slots set in `initialize()`.

### Pattern 6: Offer System in Marketplace.sol

**What:** Buyer sends ETH with `makeOffer()`, escrowed in contract. Seller calls `acceptOffer()` — triggers NFT transfer and ETH release (royalty + commission deducted). Seller calls `rejectOffer()` — refunds buyer. Buyer calls `cancelOffer()` — refunds buyer. Auto-expiry checked at accept time.

**When to use:** Plan 01-05.

```solidity
// Source: canonical escrow pattern
struct Offer {
    address payable buyer;
    uint256 amount;
    uint256 expiry;
    bool active;
}

uint256 public constant DEFAULT_OFFER_DURATION = 7 days;
// nftContract => tokenId => offerId => Offer
mapping(address => mapping(uint256 => mapping(uint256 => Offer))) public offers;
mapping(address => mapping(uint256 => uint256)) private _nextOfferId;

function makeOffer(address nftContract, uint256 tokenId, uint256 durationSeconds)
    external payable nonReentrant whenNotPaused
{
    require(msg.value > 0, "Offer must be > 0");
    uint256 duration = durationSeconds == 0 ? DEFAULT_OFFER_DURATION : durationSeconds;
    uint256 offerId = _nextOfferId[nftContract][tokenId]++;
    offers[nftContract][tokenId][offerId] = Offer({
        buyer: payable(msg.sender),
        amount: msg.value,
        expiry: block.timestamp + duration,
        active: true
    });
    emit OfferMade(nftContract, tokenId, offerId, msg.sender, msg.value);
}

function acceptOffer(address nftContract, uint256 tokenId, uint256 offerId)
    external nonReentrant whenNotPaused
{
    require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not owner");
    Offer storage o = offers[nftContract][tokenId][offerId];
    require(o.active, "Offer not active");
    require(block.timestamp <= o.expiry, "Offer expired");
    o.active = false;

    // Unlist any active fixed-price listing for this NFT (OFFR-02 requirement)
    _unlistIfActive(nftContract, tokenId);

    IERC721(nftContract).safeTransferFrom(msg.sender, o.buyer, tokenId);
    _payRoyaltyAndSeller(nftContract, tokenId, payable(msg.sender), o.amount);
    emit OfferAccepted(nftContract, tokenId, offerId, o.buyer, o.amount);
}
```

### Anti-Patterns to Avoid

- **Push-payment for outbid refunds in auctions:** Never send ETH back to outbid bidders in the `placeBid()` call body. The refund target could be a malicious contract that reverts or re-enters. Always use `pendingReturns` + a separate `withdrawBid()`.
- **State update after external calls:** Always mark auction as settled / offer as inactive BEFORE calling `safeTransferFrom` or `transfer`. Failure to do so enables re-entrancy via `onERC721Received`.
- **Using `transfer()` for large gas stipend scenarios:** `transfer()` has a 2300 gas stipend; use `call{value: ...}("")` for payments to contracts that may have receive hooks. However, for this codebase the existing `Marketplace.sol` uses `transfer()` — keep consistent unless a specific failure is observed.
- **Calling `safeTransferFrom` from seller's address for escrow:** When the auction house escrows the NFT, the seller must `approve(auctionHouseAddress, tokenId)` and then the auction house calls `safeTransferFrom(seller, auctionHouse, tokenId)` at creation — not at settlement. The NFT is held by the contract for the duration.
- **ERC721Royalty + ERC721URIStorage together:** Both override `supportsInterface` with incompatible parent lists. Use `ERC2981` directly instead of `ERC721Royalty`.
- **Constructors in clone implementation:** The implementation contract's constructor runs once at implementation deployment, not per clone. Initialize clone state via `initialize()` only. Mark the implementation itself as `_initialized = true` in its constructor to prevent front-running.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Royalty info interface | Custom royalty struct | `ERC2981` from OZ v5 (installed) | Standard ABI, subgraph-queryable, marketplace-compatible |
| Clone deployment bytecode | Raw assembly EIP-1167 bytecode | `Clones.clone(implementation)` from OZ v5 | Bug-free, audited, handles edge cases |
| Re-entrancy prevention | Custom mutex flag | `ReentrancyGuard` + `nonReentrant` from OZ v5 | Audited; single-threaded execution guarantee |
| Pausable circuit breaker | Custom `bool paused` | `Pausable` from OZ v5 | Already used in `Marketplace.sol`; keep consistent |
| Initializable one-shot | Third-party Initializable | 4-line `bool _initialized` guard | Avoids adding `@openzeppelin/contracts-upgradeable` dependency |
| Hardhat time manipulation | `evm_increaseTime` RPC calls manually | `time.increase()` from `@nomicfoundation/hardhat-network-helpers` | Clean API, already bundled in hardhat-toolbox |

**Key insight:** The existing contract suite already uses OZ v5 patterns. Adding new contracts in the same style minimises cognitive overhead and keeps the pattern surface area small for the subgraph mapping phase (Phase 2).

---

## Common Pitfalls

### Pitfall 1: ERC721URIStorage + ERC721Royalty diamond conflict

**What goes wrong:** Compiler error `TypeError: Derived contract must override function "supportsInterface"` (and potentially `_burn`) when inheriting both `ERC721URIStorage` and `ERC721Royalty`.

**Why it happens:** Both extensions override `supportsInterface` with different parent sets. `ERC721Royalty` inherits from `ERC2981`, `ERC721URIStorage` inherits from `IERC4906`. Solidity's C3 linearization cannot resolve the ambiguity automatically.

**How to avoid:** Import `ERC2981` directly instead of `ERC721Royalty`. Override `supportsInterface` explicitly in the final contract with all three parents: `override(ERC721, ERC721URIStorage, ERC2981)`.

**Warning signs:** Compiler error mentioning `supportsInterface` when both extensions are present.

### Pitfall 2: Push-payment reentrancy in English auction placeBid

**What goes wrong:** Sending ETH back to the previous highest bidder inside `placeBid()` allows a malicious bidder contract to re-enter and drain the auction.

**Why it happens:** `call` to an external address gives control to the callee. If the callee's `receive()` calls `placeBid()` again before state is updated, it can manipulate auction state.

**How to avoid:** Use pull-payment: accumulate refunds in `pendingReturns[auctionId][address]` mapping. Provide a separate `withdrawBid(auctionId)` function. Apply `nonReentrant` to all value-moving functions.

**Warning signs:** Any `transfer()` or `call{value:}()` inside the bid-placement logic body.

### Pitfall 3: NFT not escrowed before auction — NFT can be sold elsewhere during auction

**What goes wrong:** If the seller only approves the auction house but retains ownership, they can transfer the NFT to a buyer via a direct sale while the auction is running. Settlement then fails because the auction house cannot transfer an NFT it no longer has approval for.

**Why it happens:** Approval is revocable; ownership transfer revokes approvals.

**How to avoid:** Transfer the NFT from seller to AuctionHouse at `createAuction()` time. The contract holds it in escrow until settlement or cancellation.

**Warning signs:** `createAuction()` that does not call `safeTransferFrom(seller, address(this), tokenId)`.

### Pitfall 4: EIP-1167 clone initialize() front-running

**What goes wrong:** Between `Clones.clone()` and the `initialize()` call, another actor calls `initialize()` on the newly deployed clone with their own parameters.

**Why it happens:** `Clones.clone()` returns an address with no access control. Anyone who sees the transaction in the mempool can call `initialize()` before the factory does.

**How to avoid:** Call `Clones.clone()` and `initialize()` in the same transaction (as the factory does). Mark the implementation's `_initialized = true` in its constructor so the implementation itself cannot be initialized. The factory atomically creates and initializes the clone.

**Warning signs:** Factory `createCollection()` that does not immediately call `initialize()` on the returned clone address.

### Pitfall 5: OZ v5 `ERC721` constructor sets name/symbol — cannot be called in clone's initialize()

**What goes wrong:** `ERC721.__init(name, symbol)` is a constructor pattern in the non-upgradeable OZ v5 library. There is no internal `__ERC721_init(name, symbol)` callable post-construction in `@openzeppelin/contracts`.

**Why it happens:** OZ v5 non-upgradeable contracts use `immutable`-like constructor parameters. To support EIP-1167 clones, the implementation must either: (a) use `@openzeppelin/contracts-upgradeable` which has `__ERC721_init`, or (b) store name/symbol in regular `string private` slots and override `name()` / `symbol()` accessors.

**How to avoid:** Declare `string private _name; string private _symbol;` storage slots in `Collection.sol`. Override `name()` and `symbol()` to return them. Set these in `initialize()`. Do NOT inherit from `ERC721` directly if you need post-construction name/symbol — write a base contract that exposes these setters, or use upgradeable variant.

**Warning signs:** `Collection` contract inheriting `ERC721` from non-upgradeable OZ with name/symbol set only in the `constructor()` — clones will always return empty strings.

### Pitfall 6: ROYL-04 — combined royalty + commission overflow

**What goes wrong:** If royalty is 10% and commission is 10%, total deductions are 20% — safe. But if a malicious NFT contract returns a `royaltyAmount` larger than `salePrice`, subtraction underflows (Solidity 0.8 reverts, but the revert is confusing and leaves the buyer's ETH stuck).

**Why it happens:** ERC-2981 imposes no cap on the `royaltyAmount` returned by `royaltyInfo()`. A buggy or malicious NFT can return any value.

**How to avoid:** Validate after the `royaltyInfo()` call: `require(royaltyAmount + commission <= salePrice, "Fees exceed sale price")`. Cap royalty at `mintNFT()` time to `MAX_ROYALTY_BPS = 1000` (10%). Since commission max is also 10%, the combined maximum is 20% — well within safe limits.

**Warning signs:** No `require` guard after the `royaltyInfo()` call in settlement functions.

### Pitfall 7: `_activeListingIds` O(N) removal in Marketplace.sol

**What goes wrong:** The existing `_removeActiveListing()` is O(N) over all active listings. As listing count grows, gas cost for `buyItem()` and `unlistItem()` grows linearly. At scale (>1000 listings), calls may exceed block gas limits.

**Why it happens:** Linear scan of an unbounded array.

**How to avoid:** This is a known existing limitation documented in the codebase. Phase 1 plans should not worsen it. The offer system should not use a similar array pattern — use per-NFT mappings instead. The existing `_activeListingIds` approach is acceptable for MVP scale.

**Warning signs:** Any new feature adding another `uint256[]` that requires O(N) removal.

### Pitfall 8: Hardhat Etherscan verification — ETHERSCAN_API_KEY missing from hardhat.config.js

**What goes wrong:** `npx hardhat verify` fails with authentication error on Sepolia even with correct contract address.

**Why it happens:** `hardhat-verify` (bundled in `hardhat-toolbox@5`) requires an `etherscan.apiKey` in the `verify` block of `hardhat.config.js`. The current `hardhat.config.js` has no `verify` config block.

**How to avoid:** Add to `hardhat.config.js`:
```javascript
etherscan: {
  apiKey: process.env.ETHERSCAN_API_KEY || "",
},
```
Add `ETHERSCAN_API_KEY` to `contracts/.env`.

**Warning signs:** `hardhat.config.js` with no `etherscan` block and a deploy step that wants verification.

---

## Code Examples

### Combining ERC721URIStorage + ERC2981 (verified from installed OZ v5.4.0 source)

```solidity
// Source: verified from contracts/node_modules/@openzeppelin/contracts v5.4.0
// ERC721Royalty.sol = abstract contract ERC721Royalty is ERC2981, ERC721 { ... }
// ERC721URIStorage.sol = abstract contract ERC721URIStorage is IERC4906, ERC721 { ... }
// Both override supportsInterface — use ERC2981 directly to avoid conflict

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";

contract NFTContract is ERC721, ERC721URIStorage, ERC2981, Ownable {
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
```

### Clones.clone() usage (verified from installed OZ v5.4.0 source)

```solidity
// Source: contracts/node_modules/@openzeppelin/contracts/proxy/Clones.sol v5.4.0
// function clone(address implementation) internal returns (address instance)
// function clone(address implementation, uint256 value) internal returns (address instance)

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

function createCollection(string memory name, string memory symbol)
    external returns (address)
{
    address cloneAddress = Clones.clone(collectionImplementation);
    Collection(cloneAddress).initialize(name, symbol, msg.sender);
    allCollections.push(cloneAddress);
    emit CollectionCreated(msg.sender, cloneAddress, name);
    return cloneAddress;
}
```

### Time manipulation in Hardhat tests (verified from installed hardhat-network-helpers v1.1.2)

```javascript
// Source: contracts/node_modules/@nomicfoundation/hardhat-network-helpers v1.1.2
// Available exports: time.increase, time.increaseTo, time.latest, time.latestBlock,
//                    time.setNextBlockTimestamp, time.duration.{seconds,minutes,hours,days}

const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AuctionHouse", function() {
    async function deployFixture() {
        const [owner, seller, bidder1, bidder2] = await ethers.getSigners();
        // ... deploy contracts
        return { auctionHouse, nftContract, owner, seller, bidder1, bidder2 };
    }

    it("should settle after auction end", async function() {
        const { auctionHouse, seller, bidder1 } = await loadFixture(deployFixture);
        const DURATION = 24 * 60 * 60; // 1 day
        // Create and bid...
        await time.increase(DURATION + 1); // Fast-forward past end
        await auctionHouse.settleAuction(0);
        // assert winner received NFT
    });

    it("anti-snipe: extends auction on late bid", async function() {
        const { auctionHouse } = await loadFixture(deployFixture);
        const endTime = await auctionHouse.auctions(0).then(a => a.endTime);
        // Jump to 5 minutes before end
        await time.increaseTo(endTime - 5n * 60n);
        await auctionHouse.connect(bidder1).placeBid(0, { value: ethers.parseEther("2") });
        const newEndTime = await auctionHouse.auctions(0).then(a => a.endTime);
        expect(newEndTime).to.be.gt(endTime); // Extended by 10 minutes
    });
});
```

### ERC2981 royaltyInfo call pattern in Marketplace settlement

```solidity
// Source: ERC-2981 spec + verified OZ IERC2981 interface (installed v5.4.0)
// IERC2981.royaltyInfo(tokenId, salePrice) returns (address receiver, uint256 amount)

import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

function _deductFeesAndPay(
    address nftContract,
    uint256 tokenId,
    address payable seller,
    uint256 grossProceeds
) internal {
    uint256 royaltyAmount = 0;
    address royaltyReceiver = address(0);

    // Only call royaltyInfo if the NFT contract supports ERC-2981
    try IERC165(nftContract).supportsInterface(type(IERC2981).interfaceId)
        returns (bool supported)
    {
        if (supported) {
            (royaltyReceiver, royaltyAmount) =
                IERC2981(nftContract).royaltyInfo(tokenId, grossProceeds);
        }
    } catch {
        // Non-standard contracts may revert — treat as no royalty
    }

    uint256 commission = (grossProceeds * commissionRate) / COMMISSION_DENOMINATOR;
    require(royaltyAmount + commission <= grossProceeds, "Fees exceed proceeds");

    uint256 sellerProceeds = grossProceeds - commission - royaltyAmount;

    if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
        payable(royaltyReceiver).transfer(royaltyAmount);
    }
    seller.transfer(sellerProceeds);
    // Commission stays in contract; owner withdraws via withdrawCommission()
}
```

### Hardhat verify configuration addition

```javascript
// Source: @nomicfoundation/hardhat-verify docs (bundled in hardhat-toolbox@5)
// Add to hardhat.config.js:
module.exports = {
  solidity: { /* existing */ },
  networks: { /* existing */ },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

// Verify command (after deploy):
// npx hardhat verify --network sepolia <CONTRACT_ADDRESS> [constructor args...]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OZ v4 `PullPayment` utility | Manual `pendingReturns` mapping | OZ v5 (PullPayment removed) | Must implement pull-payment manually in auction |
| `ERC721Royalty` (OZ extension) | `ERC2981` directly alongside `ERC721URIStorage` | OZ v5 (conflict discovered) | Cleaner inheritance, no `_burn` conflict |
| `Waffle` for testing | `chai` + `ethers.js` via `hardhat-toolbox` | Hardhat 2.x → current | toolbox bundles everything; no separate install |
| Hardhat v2 verify plugin separate install | Bundled in `@nomicfoundation/hardhat-toolbox@5` | toolbox v5 | No separate `npm install hardhat-verify` |

**Deprecated/outdated:**
- `OZ PullPayment`: removed in v5 — implement `pendingReturns` mapping manually
- `ERC721Royalty` with `ERC721URIStorage`: conflict-prone — use `ERC2981` directly
- `waffle` testing library: replaced by built-in chai matchers in hardhat-toolbox

---

## Open Questions

1. **Collection.sol name/symbol after EIP-1167 clone**
   - What we know: OZ v5 `ERC721` stores name/symbol set only in constructor. Clones skip the constructor.
   - What's unclear: Best approach — custom storage overrides vs. using `@openzeppelin/contracts-upgradeable` package (which adds a dependency).
   - Recommendation: Override `name()` and `symbol()` to return `string private` storage slots set in `initialize()`. Avoids adding the upgradeable package. The planner should make this explicit in plan 01-04.

2. **Offer-unlist interaction: how to find a listing given nftContract + tokenId**
   - What we know: Current `Marketplace.sol` indexes listings by `listingId` only. There is no reverse lookup `(nftContract, tokenId) => listingId`.
   - What's unclear: OFFR-02 requires "accepting an offer cancels any active fixed-price listing for that NFT." Without a reverse-lookup index this requires O(N) scan or a new mapping.
   - Recommendation: Add a `mapping(address => mapping(uint256 => uint256)) public activeListingByToken` in Marketplace.sol that maps `(nftContract, tokenId) => listingId` (0 meaning no active listing). Set/clear this alongside `listings` and `_activeListingIds`. The planner should make this an explicit task in 01-05.

3. **Existing MVP NFT contract address migration**
   - What we know: Redeploying `NFTContract.sol` to add ERC-2981 creates a new contract address. Old MVP tokens live at the old address.
   - What's unclear: Dashboard `ownerOf` enumeration — how to handle two contract addresses simultaneously.
   - Recommendation: `deployments/sepolia.json` should record both `nftContractV1` and `nftContractV2` addresses. Frontend should query both. The planner must explicitly handle this in plan 01-06. This is a known blocker from STATE.md.

4. **AuctionHouse as standalone vs. integrated into Marketplace.sol**
   - What we know: ROADMAP describes `AuctionHouse.sol` as a new separate contract.
   - What's unclear: The `_payRoyaltyAndSeller` logic will be duplicated between `Marketplace.sol` and `AuctionHouse.sol` unless extracted into a shared library or base contract.
   - Recommendation: Extract settlement logic into an internal `_settleNFTSale()` shared function within each contract (duplication is acceptable at this scale), or create a `FeeCalculator` library. Do not force both into a single contract — separate concerns are cleaner for subgraph indexing.

---

## Sources

### Primary (HIGH confidence — verified from installed source)
- `contracts/node_modules/@openzeppelin/contracts@5.4.0` — ERC2981.sol, ERC721Royalty.sol, ERC721URIStorage.sol, Clones.sol, ReentrancyGuard.sol read directly from disk
- `contracts/node_modules/@nomicfoundation/hardhat-network-helpers@1.1.2` — file listing confirms time.increase, time.latest, time.increaseTo, loadFixture exports
- Existing `NFTContract.sol` and `Marketplace.sol` — read directly from `contracts/contracts/`

### Secondary (MEDIUM confidence — official docs verified)
- [EIP-2981 Specification](https://eips.ethereum.org/EIPS/eip-2981) — royaltyInfo interface, no built-in cap
- [Hardhat Smart Contract Verification](https://hardhat.org/docs/guides/smart-contract-verification) — etherscan config, verify command, toolbox inclusion
- [OpenZeppelin ERC-721 Docs v5.x](https://docs.openzeppelin.com/contracts/5.x/erc721) — extension patterns
- [OpenZeppelin Clones.sol master](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Clones.sol) — clone() and cloneDeterministic() signatures

### Tertiary (LOW confidence — WebSearch, cross-referenced with primary)
- [OZ Forum: Combining ERC721URIStorage + ERC721Royalty](https://forum.openzeppelin.com/t/how-to-use-erc721uristorage-and-erc721royalty-together-requires-override/27594) — use ERC2981 directly recommendation
- [benber86/nft_royalties_market](https://github.com/benber86/nft_royalties_market) — marketplace royalty deduction pattern
- [RareSkills EIP-1167 Initialize Pattern](https://rareskills.io/post/eip-1167-minimal-proxy-standard-with-initialization-clone-pattern) — one-shot initialize guard
- [OZ Forum: Clone Factory for ERC721](https://forum.openzeppelin.com/t/cloned-factory-pattern-for-erc721-contracts/29227) — 80%+ gas savings confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed node_modules
- Architecture patterns: HIGH — verified against OZ source and EIP specs
- NFT name/symbol in clones: MEDIUM — confirmed limitation, solution is known but untested
- Pitfalls: HIGH — most derived from reading actual source; reentrancy pattern from Solidity canonical docs
- Offer-unlist reverse index: MEDIUM — logical deduction from existing code, not a tested implementation

**Research date:** 2026-02-21
**Valid until:** 2026-08-21 (OZ v5.x stable; Hardhat 2.x stable)
