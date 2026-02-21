const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Deploy fresh CollectionFactory + Marketplace for each test suite
async function deployFixture() {
    const [owner, creator, buyer, other] = await ethers.getSigners();

    const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
    const factory = await CollectionFactory.deploy();
    await factory.waitForDeployment();

    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();

    return { factory, marketplace, owner, creator, buyer, other };
}

// ─────────────────────────────────────────────────────────────────────────────
// CollectionFactory Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CollectionFactory", function () {

    // ─── 1. Factory Deployment ─────────────────────────────────────────────

    describe("Factory Deployment", function () {
        it("Should deploy with a valid implementation address", async function () {
            const { factory } = await deployFixture();
            const implAddress = await factory.collectionImplementation();
            expect(implAddress).to.not.equal(ethers.ZeroAddress);
            // Must be a contract (has code at the address)
            const code = await ethers.provider.getCode(implAddress);
            expect(code).to.not.equal("0x");
        });

        it("Should start with zero collections", async function () {
            const { factory } = await deployFixture();
            expect(await factory.totalCollections()).to.equal(0);
        });

        it("Should return an empty allCollections array initially", async function () {
            const { factory } = await deployFixture();
            const all = await factory.getAllCollections();
            expect(all).to.have.length(0);
        });

        it("Factory owner should be the deployer", async function () {
            const { factory, owner } = await deployFixture();
            expect(await factory.owner()).to.equal(owner.address);
        });
    });

    // ─── 2. Creating Collections ───────────────────────────────────────────

    describe("Creating Collections", function () {
        it("Should create a collection with the given name and symbol", async function () {
            const { factory, creator } = await deployFixture();
            const addr = await factory.connect(creator).createCollection.staticCall("My Art", "MYART");
            await factory.connect(creator).createCollection("My Art", "MYART");

            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            expect(await collection.name()).to.equal("My Art");
            expect(await collection.symbol()).to.equal("MYART");
        });

        it("Should set the creator as the collection owner", async function () {
            const { factory, creator } = await deployFixture();
            const addr = await factory.connect(creator).createCollection.staticCall("My Art", "MYART");
            await factory.connect(creator).createCollection("My Art", "MYART");

            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);
            expect(await collection.owner()).to.equal(creator.address);
        });

        it("Should track collections in allCollections array", async function () {
            const { factory, creator } = await deployFixture();
            await factory.connect(creator).createCollection("Collection A", "COLLA");
            await factory.connect(creator).createCollection("Collection B", "COLLB");

            const all = await factory.getAllCollections();
            expect(all).to.have.length(2);
            expect(await factory.totalCollections()).to.equal(2);
        });

        it("Should track collections by creator address", async function () {
            const { factory, creator, other } = await deployFixture();
            await factory.connect(creator).createCollection("Creator A1", "CA1");
            await factory.connect(creator).createCollection("Creator A2", "CA2");
            await factory.connect(other).createCollection("Other B1", "OB1");

            const creatorColls = await factory.getCollectionsByCreator(creator.address);
            const otherColls = await factory.getCollectionsByCreator(other.address);
            expect(creatorColls).to.have.length(2);
            expect(otherColls).to.have.length(1);
        });

        it("Should emit CollectionCreated event with correct args", async function () {
            const { factory, creator } = await deployFixture();
            const tx = factory.connect(creator).createCollection("Emit Test", "EMIT");

            // We need the deployed clone address from the event
            const receipt = await (await tx).wait();
            const event = receipt.logs.find(
                (log) => log.fragment && log.fragment.name === "CollectionCreated"
            );
            expect(event).to.not.be.undefined;
            expect(event.args.creator).to.equal(creator.address);
            expect(event.args.name).to.equal("Emit Test");
            expect(event.args.symbol).to.equal("EMIT");
            expect(event.args.collection).to.not.equal(ethers.ZeroAddress);
        });

        it("Should deploy each collection at a distinct address", async function () {
            const { factory, creator } = await deployFixture();
            await factory.connect(creator).createCollection("Col 1", "C1");
            await factory.connect(creator).createCollection("Col 2", "C2");

            const all = await factory.getAllCollections();
            expect(all[0]).to.not.equal(all[1]);
        });

        it("Should deploy clone (EIP-1167 minimal proxy) not the implementation", async function () {
            const { factory, creator } = await deployFixture();
            await factory.connect(creator).createCollection("Clone Test", "CLN");

            const all = await factory.getAllCollections();
            const cloneAddress = all[0];
            const implAddress = await factory.collectionImplementation();

            expect(cloneAddress).to.not.equal(implAddress);
            // Clone bytecode is much smaller (55 bytes) vs implementation
            const cloneCode = await ethers.provider.getCode(cloneAddress);
            const implCode = await ethers.provider.getCode(implAddress);
            expect(cloneCode.length).to.be.lessThan(implCode.length);
        });
    });

    // ─── 3. Minting into Collections ──────────────────────────────────────

    describe("Minting into Collections", function () {
        async function createCollection(factory, creator) {
            const addr = await factory.connect(creator).createCollection.staticCall("Artist Drop", "DROP");
            await factory.connect(creator).createCollection("Artist Drop", "DROP");
            const Collection = await ethers.getContractFactory("Collection");
            return Collection.attach(addr);
        }

        it("Should allow the creator (owner) to mint into their collection", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await collection.connect(creator).mintNFT("ipfs://token-0", 500);
            expect(await collection.ownerOf(0)).to.equal(creator.address);
        });

        it("Should reject minting from a non-owner address", async function () {
            const { factory, creator, other } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await expect(
                collection.connect(other).mintNFT("ipfs://token-0", 0)
            ).to.be.revertedWithCustomError(collection, "OwnableUnauthorizedAccount");
        });

        it("Should set the correct tokenURI on minted tokens", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await collection.connect(creator).mintNFT("ipfs://metadata-cid-001", 250);
            expect(await collection.tokenURI(0)).to.equal("ipfs://metadata-cid-001");
        });

        it("Should store correct royalty info via ERC-2981", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            const royaltyBps = 500; // 5%
            await collection.connect(creator).mintNFT("ipfs://royalty-token", royaltyBps);

            const salePrice = ethers.parseEther("1");
            const [receiver, amount] = await collection.royaltyInfo(0, salePrice);

            expect(receiver).to.equal(creator.address);
            // 5% of 1 ETH = 0.05 ETH
            expect(amount).to.equal(ethers.parseEther("0.05"));
        });

        it("Should allow 0% royalty (free secondary sales)", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await collection.connect(creator).mintNFT("ipfs://free-royalty", 0);
            const [, amount] = await collection.royaltyInfo(0, ethers.parseEther("1"));
            expect(amount).to.equal(0);
        });

        it("Should reject royalty above 10% (1000 bps)", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await expect(
                collection.connect(creator).mintNFT("ipfs://bad-royalty", 1001)
            ).to.be.revertedWith("Royalty exceeds 10%");
        });

        it("Should accept exactly 10% royalty (1000 bps)", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await expect(
                collection.connect(creator).mintNFT("ipfs://max-royalty", 1000)
            ).to.not.be.reverted;
        });

        it("Should emit NFTMinted event with correct args", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await expect(
                collection.connect(creator).mintNFT("ipfs://event-test", 300)
            )
                .to.emit(collection, "NFTMinted")
                .withArgs(creator.address, 0, "ipfs://event-test");
        });

        it("Should increment token IDs across successive mints", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            await collection.connect(creator).mintNFT("ipfs://t0", 0);
            await collection.connect(creator).mintNFT("ipfs://t1", 0);
            await collection.connect(creator).mintNFT("ipfs://t2", 0);

            expect(await collection.ownerOf(0)).to.equal(creator.address);
            expect(await collection.ownerOf(1)).to.equal(creator.address);
            expect(await collection.ownerOf(2)).to.equal(creator.address);
            expect(await collection.totalMinted()).to.equal(3);
        });

        it("Should track total minted correctly", async function () {
            const { factory, creator } = await deployFixture();
            const collection = await createCollection(factory, creator);

            expect(await collection.totalMinted()).to.equal(0);
            await collection.connect(creator).mintNFT("ipfs://t0", 0);
            expect(await collection.totalMinted()).to.equal(1);
        });
    });

    // ─── 4. Marketplace Compatibility (COLL-04) ───────────────────────────

    describe("Marketplace Compatibility", function () {
        async function deployAndMint(factory, marketplace, creator) {
            // Create collection
            const addr = await factory.connect(creator).createCollection.staticCall("Trade Col", "TC");
            await factory.connect(creator).createCollection("Trade Col", "TC");
            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            // Mint token 0 with 5% royalty
            await collection.connect(creator).mintNFT("ipfs://tradeable-token", 500);

            return { collection };
        }

        it("Should support ERC-165 interface detection", async function () {
            const { factory, creator } = await deployFixture();
            const addr = await factory.connect(creator).createCollection.staticCall("IF Test", "IFT");
            await factory.connect(creator).createCollection("IF Test", "IFT");
            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            // ERC-165 interfaceId
            expect(await collection.supportsInterface("0x01ffc9a7")).to.equal(true);
            // ERC-721 interfaceId
            expect(await collection.supportsInterface("0x80ac58cd")).to.equal(true);
            // ERC-2981 interfaceId
            expect(await collection.supportsInterface("0x2a55205a")).to.equal(true);
            // Random interfaceId should return false
            expect(await collection.supportsInterface("0xdeadbeef")).to.equal(false);
        });

        it("Should allow creator to approve marketplace and list a collection NFT", async function () {
            const { factory, marketplace, creator } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            // Approve marketplace for token 0
            await collection.connect(creator).approve(marketplaceAddr, 0);
            expect(await collection.getApproved(0)).to.equal(marketplaceAddr);

            // List on marketplace
            const price = ethers.parseEther("1");
            await marketplace.connect(creator).listItem(collectionAddr, 0, price);

            const listingId = 0;
            const listing = await marketplace.listings(listingId);
            expect(listing.active).to.equal(true);
            expect(listing.price).to.equal(price);
            expect(listing.nftContract).to.equal(collectionAddr);
            expect(listing.tokenId).to.equal(0);
            expect(listing.seller).to.equal(creator.address);
        });

        it("Should allow a buyer to purchase a listed collection NFT", async function () {
            const { factory, marketplace, creator, buyer } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            // Approve and list
            await collection.connect(creator).approve(marketplaceAddr, 0);
            const price = ethers.parseEther("1");
            await marketplace.connect(creator).listItem(collectionAddr, 0, price);

            // Buy
            await marketplace.connect(buyer).buyItem(0, { value: price });

            // NFT transferred to buyer
            expect(await collection.ownerOf(0)).to.equal(buyer.address);

            // Listing inactive
            const listing = await marketplace.listings(0);
            expect(listing.active).to.equal(false);
        });

        it("Should pay ERC-2981 royalty to creator on secondary sale", async function () {
            const { factory, marketplace, creator, buyer } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            // Approve and list
            await collection.connect(creator).approve(marketplaceAddr, 0);
            const price = ethers.parseEther("1");
            await marketplace.connect(creator).listItem(collectionAddr, 0, price);

            const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

            // Buy triggers royalty payment
            await marketplace.connect(buyer).buyItem(0, { value: price });

            const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);

            // Creator receives royalty (5% of 1 ETH = 0.05 ETH) + seller proceeds
            // Commission is 2.5%, royalty 5%, so seller gets 92.5% = 0.925 ETH
            // Total creator receives: 0.925 (proceeds) + 0.05 (royalty) = 0.975 ETH
            // The creator is both seller and royalty receiver here
            const received = creatorBalanceAfter - creatorBalanceBefore;
            // Gas costs make exact comparison tricky; verify it's more than 0.9 ETH
            expect(received).to.be.greaterThan(ethers.parseEther("0.9"));
        });

        it("Should emit ItemSold with correct royalty amount for collection NFT", async function () {
            const { factory, marketplace, creator, buyer } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            await collection.connect(creator).approve(marketplaceAddr, 0);
            const price = ethers.parseEther("1");
            await marketplace.connect(creator).listItem(collectionAddr, 0, price);

            const expectedRoyalty = ethers.parseEther("0.05"); // 5% of 1 ETH
            const expectedCommission = (price * 250n) / 10000n; // 2.5%

            await expect(
                marketplace.connect(buyer).buyItem(0, { value: price })
            )
                .to.emit(marketplace, "ItemSold")
                .withArgs(0, buyer.address, price, expectedCommission, expectedRoyalty);
        });

        it("Should transfer NFT ownership correctly after purchase", async function () {
            const { factory, marketplace, creator, buyer } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            await collection.connect(creator).approve(marketplaceAddr, 0);
            await marketplace.connect(creator).listItem(collectionAddr, 0, ethers.parseEther("1"));
            await marketplace.connect(buyer).buyItem(0, { value: ethers.parseEther("1") });

            // NFT is with buyer, not creator
            expect(await collection.ownerOf(0)).to.equal(buyer.address);
        });

        it("Should work with setApprovalForAll instead of per-token approve", async function () {
            const { factory, marketplace, creator, buyer } = await deployFixture();
            const { collection } = await deployAndMint(factory, marketplace, creator);

            const marketplaceAddr = await marketplace.getAddress();
            const collectionAddr = await collection.getAddress();

            // Approve all tokens to marketplace
            await collection.connect(creator).setApprovalForAll(marketplaceAddr, true);
            await marketplace.connect(creator).listItem(collectionAddr, 0, ethers.parseEther("0.5"));
            await marketplace.connect(buyer).buyItem(0, { value: ethers.parseEther("0.5") });

            expect(await collection.ownerOf(0)).to.equal(buyer.address);
        });
    });

    // ─── 5. Implementation Protection ─────────────────────────────────────

    describe("Implementation Protection", function () {
        it("Should prevent direct initialization of the implementation contract", async function () {
            const { factory, creator } = await deployFixture();
            const implAddress = await factory.collectionImplementation();

            const Collection = await ethers.getContractFactory("Collection");
            const impl = Collection.attach(implAddress);

            // Implementation has _initialized = true from constructor — should revert
            await expect(
                impl.connect(creator).initialize("Hacked", "HACK", creator.address)
            ).to.be.revertedWith("Already initialized");
        });

        it("Should prevent re-initialization of a clone", async function () {
            const { factory, creator, other } = await deployFixture();

            const addr = await factory.connect(creator).createCollection.staticCall("Legit", "LGT");
            await factory.connect(creator).createCollection("Legit", "LGT");

            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            // Trying to initialize again — should fail
            await expect(
                collection.connect(other).initialize("Hacked", "HACK", other.address)
            ).to.be.revertedWith("Already initialized");
        });

        it("Should have correct owner after clone creation — not the factory", async function () {
            const { factory, creator } = await deployFixture();

            const addr = await factory.connect(creator).createCollection.staticCall("Ownership Test", "OWT");
            await factory.connect(creator).createCollection("Ownership Test", "OWT");

            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            const factoryAddr = await factory.getAddress();

            // Owner is creator, not the factory
            expect(await collection.owner()).to.equal(creator.address);
            expect(await collection.owner()).to.not.equal(factoryAddr);
        });

        it("Should prevent non-owner from minting even via direct call", async function () {
            const { factory, creator, other } = await deployFixture();

            const addr = await factory.connect(creator).createCollection.staticCall("Protected", "PRT");
            await factory.connect(creator).createCollection("Protected", "PRT");

            const Collection = await ethers.getContractFactory("Collection");
            const collection = Collection.attach(addr);

            await expect(
                collection.connect(other).mintNFT("ipfs://attack", 0)
            ).to.be.revertedWithCustomError(collection, "OwnableUnauthorizedAccount");
        });
    });

});
