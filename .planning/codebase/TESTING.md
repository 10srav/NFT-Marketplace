# Testing Patterns

**Analysis Date:** 2026-02-21

## Test Framework

**Runner:**
- Hardhat (via `@nomicfoundation/hardhat-toolbox`)
- Version: 2.22.0+
- Config: `contracts/hardhat.config.js`

**Assertion Library:**
- Chai (included with hardhat-toolbox)

**Run Commands:**
```bash
npm run test                # Run all tests in contracts/
hardhat test                # Run tests directly
hardhat test --grep "Minting"  # Run specific test suite
```

**Test Coverage:**
- No coverage enforcement detected
- No coverage configuration found
- Not a current priority for this project

## Test File Organization

**Location:**
- Smart contract tests: `contracts/test/`
- Co-located with contracts directory
- No frontend tests found

**Naming:**
- Pattern: `[ContractName].test.js`
- Examples: `Marketplace.test.js`, `NFTContract.test.js`

**Structure:**
```
contracts/
├── contracts/
│   ├── NFTContract.sol
│   └── Marketplace.sol
└── test/
    ├── Marketplace.test.js
    └── NFTContract.test.js
```

## Test Structure

**Suite Organization:**

```javascript
describe("Marketplace", function () {
    let nftContract, marketplace;
    let owner, seller, buyer;
    const PRICE = ethers.parseEther("1.0");

    beforeEach(async function () {
        // Setup contracts and accounts
    });

    describe("Listing", function () {
        it("Should list an NFT", async function () {
            // test implementation
        });
    });
});
```

**Patterns:**

**Setup (beforeEach):**
- Get signers from ethers: `[owner, seller, buyer] = await ethers.getSigners();`
- Deploy contracts: `const NFTContract = await ethers.getContractFactory("NFTContract");`
- Initialize: `nftContract = await NFTContract.deploy();`
- Wait for deployment: `await nftContract.waitForDeployment();`
- Prepare state: mint NFTs, approve marketplace

**Teardown:**
- Not explicitly used (Hardhat handles cleanup between tests)

**Assertion Pattern:**
- Chai expect style: `expect(value).to.equal(expected)`
- Custom matchers for events: `.to.emit(contract, "EventName").withArgs(...)`
- Custom matchers for errors: `.to.be.reverted`, `.to.be.revertedWith("message")`

## Mocking

**Framework:**
- No dedicated mocking library (ethers.js signers used instead)
- Hardhat's test environment provides in-memory blockchain

**Patterns:**

**Connect with different account:**
```javascript
await nftContract.connect(seller).mintNFT("ipfs://test-uri");
```

**Call contract methods:**
```javascript
const listing = await marketplace.listings(0);
expect(listing.seller).to.equal(seller.address);
```

**Send transactions with value:**
```javascript
await marketplace.connect(buyer).buyItem(0, { value: PRICE });
```

**What to Mock:**
- Contract interactions (use `.connect(signer)`)
- Account addresses (use test signers)
- BigInt values (use `ethers.parseEther()` for ETH)

**What NOT to Mock:**
- Contracts: Deploy real instances in beforeEach
- Blockchain state: Use the test network directly
- Events: Verify emitted events with `.to.emit()`

## Fixtures and Factories

**Test Data:**

From `contracts/test/Marketplace.test.js`:
```javascript
const PRICE = ethers.parseEther("1.0");
const expectedProceeds = PRICE - (PRICE * 250n) / 10000n;
```

From `contracts/test/NFTContract.test.js`:
```javascript
await nftContract.connect(addr1).mintNFT("ipfs://test-uri-1");
```

**Location:**
- Top-level constants in each test file (e.g., `const PRICE = ...`)
- No separate fixtures directory
- Test-specific data defined in beforeEach

## Coverage

**Requirements:**
- Not enforced
- No coverage targets configured
- Coverage reporting not set up

**View Coverage:**
```bash
# Not currently configured
# Would need to add: hardhat coverage
```

## Test Types

**Unit Tests:**
- Scope: Individual contract functions
- Approach: Test minting, burning, transfers, listing, buying
- Setup: Deploy both contracts, mint NFT, approve marketplace
- Example: Testing `mintNFT()` returns correct tokenId

**Integration Tests:**
- Scope: Contract interactions (NFT ↔ Marketplace)
- Approach: Full workflow: mint → approve → list → buy
- Example: Verify NFT ownership changes after purchase

**E2E Tests:**
- Framework: Not used
- No end-to-end tests in current codebase
- Frontend testing: None implemented

## Common Patterns

**Async Testing:**
```javascript
it("Should transfer NFT to buyer on purchase", async function () {
    await marketplace.connect(buyer).buyItem(0, { value: PRICE });
    expect(await nftContract.ownerOf(0)).to.equal(buyer.address);
});
```

**Error Testing:**
```javascript
it("Should reject zero price", async function () {
    await expect(
        marketplace
            .connect(seller)
            .listItem(await nftContract.getAddress(), 0, 0)
    ).to.be.revertedWith("Price must be > 0");
});
```

**Event Testing:**
```javascript
it("Should emit ItemListed event", async function () {
    await expect(
        marketplace
            .connect(seller)
            .listItem(await nftContract.getAddress(), 0, PRICE)
    )
        .to.emit(marketplace, "ItemListed")
        .withArgs(0, await nftContract.getAddress(), 0, seller.address, PRICE);
});
```

**State Verification:**
```javascript
it("Should pay seller minus commission", async function () {
    const sellerBalBefore = await ethers.provider.getBalance(seller.address);
    await marketplace.connect(buyer).buyItem(0, { value: PRICE });
    const sellerBalAfter = await ethers.provider.getBalance(seller.address);

    const expectedProceeds = PRICE - (PRICE * 250n) / 10000n;
    expect(sellerBalAfter - sellerBalBefore).to.equal(expectedProceeds);
});
```

## Test Coverage Analysis

**Marketplace.sol** (`contracts/test/Marketplace.test.js`):
- Listing: Create listing, verify state, validate price, verify event
- Buying: Transfer NFT, pay seller, handle commission, event verification
- Unlisting: Cancel listing, prevent non-seller unlisting
- Admin: Commission rate updates, pause/unpause, commission withdrawal

**NFTContract.sol** (`contracts/test/NFTContract.test.js`):
- Minting: Mint NFT, assign to caller, set metadata URI, emit event, increment IDs
- Burning: Owner burn, prevent non-owner burn, emit event
- Transfers: Transfer between users

## Integration Points Tested

**NFT Minting → Approval → Listing:**
```javascript
// From Marketplace.test.js beforeEach
await nftContract.connect(seller).mintNFT("ipfs://test-uri");
await nftContract
    .connect(seller)
    .approve(await marketplace.getAddress(), 0);
```

**Full Purchase Flow:**
1. Mint NFT (to seller)
2. Approve marketplace
3. List NFT
4. Buy (from buyer with ETH)
5. Verify: ownership transfer, payment, commission deduction

---

*Testing analysis: 2026-02-21*
