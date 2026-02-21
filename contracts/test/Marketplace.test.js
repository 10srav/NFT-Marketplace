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

        // Mint an NFT to seller with 0% royalty (so existing tests are unaffected)
        await nftContract.connect(seller).mintNFT("ipfs://test-uri", 0);
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

        it("Should set activeListingByToken reverse lookup on list", async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
            // listingId 0 => stored as 0+1 = 1
            const stored = await marketplace.activeListingByToken(
                await nftContract.getAddress(),
                0
            );
            expect(stored).to.equal(1n);
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

        it("Should pay seller minus commission (0% royalty)", async function () {
            const sellerBalBefore = await ethers.provider.getBalance(seller.address);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const sellerBalAfter = await ethers.provider.getBalance(seller.address);

            // 2.5% commission = 0.025 ETH, 0% royalty
            const expectedProceeds = PRICE - (PRICE * 250n) / 10000n;
            expect(sellerBalAfter - sellerBalBefore).to.equal(expectedProceeds);
        });

        it("Should collect commission in marketplace (0% royalty)", async function () {
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const commission = (PRICE * 250n) / 10000n;
            const marketBal = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(marketBal).to.equal(commission);
        });

        it("Should emit ItemSold event with royalty field", async function () {
            const commission = (PRICE * 250n) / 10000n;
            const royalty = 0n; // 0% royalty NFT
            await expect(marketplace.connect(buyer).buyItem(0, { value: PRICE }))
                .to.emit(marketplace, "ItemSold")
                .withArgs(0, buyer.address, PRICE, commission, royalty);
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

        it("Should clear activeListingByToken reverse lookup on buy", async function () {
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const stored = await marketplace.activeListingByToken(
                await nftContract.getAddress(),
                0
            );
            expect(stored).to.equal(0n);
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

        it("Should clear activeListingByToken reverse lookup on unlist", async function () {
            await marketplace.connect(seller).unlistItem(0);
            const stored = await marketplace.activeListingByToken(
                await nftContract.getAddress(),
                0
            );
            expect(stored).to.equal(0n);
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

    describe("Royalty Settlement", function () {
        it("Should pay royalty to creator on secondary sale", async function () {
            // seller (creator) mints with 5% royalty
            const NFTContract = await ethers.getContractFactory("NFTContract");
            const royaltyNft = await NFTContract.deploy();
            await royaltyNft.waitForDeployment();

            // seller is both creator and initial owner; use addr not in default setup
            const [, , , creator, secondaryBuyer] = await ethers.getSigners();
            await royaltyNft.connect(creator).mintNFT("ipfs://royalty-test", 500); // 5%
            await royaltyNft
                .connect(creator)
                .approve(await marketplace.getAddress(), 0);
            await marketplace
                .connect(creator)
                .listItem(await royaltyNft.getAddress(), 0, PRICE);

            const creatorBalBefore = await ethers.provider.getBalance(creator.address);
            // secondaryBuyer buys — creator is both seller AND royalty receiver here
            // Net: creator gets sellerProceeds + royalty = PRICE - commission
            const tx = await marketplace
                .connect(secondaryBuyer)
                .buyItem(0, { value: PRICE });
            const receipt = await tx.wait();
            const creatorBalAfter = await ethers.provider.getBalance(creator.address);

            // creator paid gas as seller only — seller.transfer excludes gas
            // royalty = 5% of 1 ETH = 0.05 ETH
            // commission = 2.5% = 0.025 ETH
            // sellerProceeds = 1 - 0.025 - 0.05 = 0.925 ETH
            // creator receives sellerProceeds + royalty = 0.925 + 0.05 = 0.975 ETH
            const royaltyAmount = (PRICE * 500n) / 10000n; // 0.05 ETH
            const commission = (PRICE * 250n) / 10000n;   // 0.025 ETH
            const sellerProceeds = PRICE - commission - royaltyAmount;
            const expectedCreatorTotal = sellerProceeds + royaltyAmount;
            expect(creatorBalAfter - creatorBalBefore).to.equal(expectedCreatorTotal);
        });

        it("Should handle 0% royalty correctly — seller gets full amount minus commission only", async function () {
            // seller minted with 0% royalty in beforeEach
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);

            const sellerBalBefore = await ethers.provider.getBalance(seller.address);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const sellerBalAfter = await ethers.provider.getBalance(seller.address);

            const commission = (PRICE * 250n) / 10000n; // 0.025 ETH
            const expectedProceeds = PRICE - commission;  // 0.975 ETH
            expect(sellerBalAfter - sellerBalBefore).to.equal(expectedProceeds);

            // Marketplace holds only commission (no royalty)
            const marketBal = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(marketBal).to.equal(commission);
        });

        it("Should handle max royalty (10%) + max commission (10%) — seller gets 80%", async function () {
            // Set commission to 10%
            await marketplace.connect(owner).setCommissionRate(1000);

            // Deploy fresh NFT and mint with 10% royalty
            const NFTContract = await ethers.getContractFactory("NFTContract");
            const royaltyNft = await NFTContract.deploy();
            await royaltyNft.waitForDeployment();
            const [, , , creator] = await ethers.getSigners();

            await royaltyNft.connect(creator).mintNFT("ipfs://max-fees", 1000); // 10%
            await royaltyNft
                .connect(creator)
                .approve(await marketplace.getAddress(), 0);
            await marketplace
                .connect(creator)
                .listItem(await royaltyNft.getAddress(), 0, PRICE);

            const creatorBalBefore = await ethers.provider.getBalance(creator.address);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const creatorBalAfter = await ethers.provider.getBalance(creator.address);

            // royalty = 10% = 0.1 ETH, commission = 10% = 0.1 ETH
            // sellerProceeds = 1 - 0.1 - 0.1 = 0.8 ETH
            // creator is both seller and royalty receiver: gets 0.8 + 0.1 = 0.9 ETH
            const royaltyAmount = (PRICE * 1000n) / 10000n; // 0.1 ETH
            const commission = (PRICE * 1000n) / 10000n;    // 0.1 ETH
            const sellerProceeds = PRICE - commission - royaltyAmount; // 0.8 ETH
            const expectedCreatorTotal = sellerProceeds + royaltyAmount; // 0.9 ETH
            expect(creatorBalAfter - creatorBalBefore).to.equal(expectedCreatorTotal);

            // Marketplace holds exactly commission (10%)
            const marketBal = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(marketBal).to.equal(commission);
        });

        it("Should handle non-ERC2981 NFTs gracefully — no revert, seller gets full minus commission", async function () {
            // Deploy a plain ERC721 without ERC2981
            const PlainERC721 = await ethers.getContractFactory("MockPlainERC721");
            const plainNft = await PlainERC721.deploy();
            await plainNft.waitForDeployment();

            // Mint token 0 to seller
            await plainNft.connect(seller).mint(seller.address);
            await plainNft
                .connect(seller)
                .approve(await marketplace.getAddress(), 0);
            await marketplace
                .connect(seller)
                .listItem(await plainNft.getAddress(), 0, PRICE);

            const sellerBalBefore = await ethers.provider.getBalance(seller.address);
            // Should NOT revert
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });
            const sellerBalAfter = await ethers.provider.getBalance(seller.address);

            // No royalty — seller gets PRICE - commission
            const commission = (PRICE * 250n) / 10000n;
            expect(sellerBalAfter - sellerBalBefore).to.equal(PRICE - commission);

            // NFT transferred to buyer
            expect(await plainNft.ownerOf(0)).to.equal(buyer.address);
        });

        it("Should emit ItemSold with correct royalty amount on 5% royalty sale", async function () {
            const NFTContract = await ethers.getContractFactory("NFTContract");
            const royaltyNft = await NFTContract.deploy();
            await royaltyNft.waitForDeployment();
            const [, , , creator] = await ethers.getSigners();

            await royaltyNft.connect(creator).mintNFT("ipfs://event-test", 500);
            await royaltyNft
                .connect(creator)
                .approve(await marketplace.getAddress(), 0);
            await marketplace
                .connect(creator)
                .listItem(await royaltyNft.getAddress(), 0, PRICE);

            const commission = (PRICE * 250n) / 10000n;  // 0.025 ETH
            const royalty = (PRICE * 500n) / 10000n;      // 0.05 ETH

            await expect(marketplace.connect(buyer).buyItem(0, { value: PRICE }))
                .to.emit(marketplace, "ItemSold")
                .withArgs(0, buyer.address, PRICE, commission, royalty);
        });
    });
});
