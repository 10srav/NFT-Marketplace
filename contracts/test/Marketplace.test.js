const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Marketplace", function () {
    let nftContract, marketplace;
    let owner, seller, buyer;
    const PRICE = ethers.parseEther("1.0");

    beforeEach(async function () {
        [owner, seller, buyer] = await ethers.getSigners();

        // Deploy NFT contract
        const NFTContract = await ethers.getContractFactory("NFTContract");
        nftContract = await NFTContract.deploy();
        await nftContract.waitForDeployment();

        // Deploy Marketplace
        const Marketplace = await ethers.getContractFactory("Marketplace");
        marketplace = await Marketplace.deploy();
        await marketplace.waitForDeployment();

        // Mint an NFT to seller
        await nftContract.connect(seller).mintNFT("ipfs://test-uri");
        // Approve marketplace
        await nftContract
            .connect(seller)
            .approve(await marketplace.getAddress(), 0);
    });

    describe("Listing", function () {
        it("Should list an NFT", async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
            const listing = await marketplace.listings(0);
            expect(listing.seller).to.equal(seller.address);
            expect(listing.price).to.equal(PRICE);
            expect(listing.active).to.be.true;
        });

        it("Should emit ItemListed event", async function () {
            await expect(
                marketplace
                    .connect(seller)
                    .listItem(await nftContract.getAddress(), 0, PRICE)
            )
                .to.emit(marketplace, "ItemListed")
                .withArgs(0, await nftContract.getAddress(), 0, seller.address, PRICE);
        });

        it("Should reject zero price", async function () {
            await expect(
                marketplace
                    .connect(seller)
                    .listItem(await nftContract.getAddress(), 0, 0)
            ).to.be.revertedWith("Price must be > 0");
        });

        it("Should reject non-owner listing", async function () {
            await expect(
                marketplace
                    .connect(buyer)
                    .listItem(await nftContract.getAddress(), 0, PRICE)
            ).to.be.revertedWith("Not the NFT owner");
        });
    });

    describe("Buying", function () {
        beforeEach(async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
        });

        it("Should transfer NFT to buyer on purchase", async function () {
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            expect(await nftContract.ownerOf(0)).to.equal(buyer.address);
        });

        it("Should pay seller minus commission", async function () {
            const sellerBalBefore = await ethers.provider.getBalance(seller.address);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const sellerBalAfter = await ethers.provider.getBalance(seller.address);

            // 2.5% commission = 0.025 ETH
            const expectedProceeds = PRICE - (PRICE * 250n) / 10000n;
            expect(sellerBalAfter - sellerBalBefore).to.equal(expectedProceeds);
        });

        it("Should collect commission in marketplace", async function () {
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const commission = (PRICE * 250n) / 10000n;
            const marketBal = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(marketBal).to.equal(commission);
        });

        it("Should emit ItemSold event", async function () {
            const commission = (PRICE * 250n) / 10000n;
            await expect(marketplace.connect(buyer).buyItem(0, { value: PRICE }))
                .to.emit(marketplace, "ItemSold")
                .withArgs(0, buyer.address, PRICE, commission);
        });

        it("Should reject insufficient payment", async function () {
            await expect(
                marketplace
                    .connect(buyer)
                    .buyItem(0, { value: ethers.parseEther("0.5") })
            ).to.be.revertedWith("Insufficient payment");
        });

        it("Should prevent seller from buying own NFT", async function () {
            await expect(
                marketplace.connect(seller).buyItem(0, { value: PRICE })
            ).to.be.revertedWith("Cannot buy your own NFT");
        });
    });

    describe("Unlisting", function () {
        beforeEach(async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
        });

        it("Should allow seller to unlist", async function () {
            await marketplace.connect(seller).unlistItem(0);
            const listing = await marketplace.listings(0);
            expect(listing.active).to.be.false;
        });

        it("Should prevent non-seller from unlisting", async function () {
            await expect(
                marketplace.connect(buyer).unlistItem(0)
            ).to.be.revertedWith("Not the seller");
        });

        it("Should emit ItemUnlisted event", async function () {
            await expect(marketplace.connect(seller).unlistItem(0))
                .to.emit(marketplace, "ItemUnlisted")
                .withArgs(0);
        });
    });

    describe("Admin", function () {
        it("Should allow owner to update commission rate", async function () {
            await marketplace.connect(owner).setCommissionRate(500); // 5%
            expect(await marketplace.commissionRate()).to.equal(500);
        });

        it("Should reject commission > 10%", async function () {
            await expect(
                marketplace.connect(owner).setCommissionRate(1100)
            ).to.be.revertedWith("Max 10%");
        });

        it("Should allow owner to pause/unpause", async function () {
            await marketplace.connect(owner).pause();
            await expect(
                marketplace
                    .connect(seller)
                    .listItem(await nftContract.getAddress(), 0, PRICE)
            ).to.be.reverted;
            await marketplace.connect(owner).unpause();
        });

        it("Should allow owner to withdraw commission", async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });

            const ownerBalBefore = await ethers.provider.getBalance(owner.address);
            const tx = await marketplace.connect(owner).withdrawCommission();
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const ownerBalAfter = await ethers.provider.getBalance(owner.address);

            const commission = (PRICE * 250n) / 10000n;
            expect(ownerBalAfter - ownerBalBefore + gasCost).to.equal(commission);
        });
    });
});
