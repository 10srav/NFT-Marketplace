const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

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
            const accumulated = await marketplace.accumulatedCommission();
            expect(accumulated).to.equal(commission);
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

            // Marketplace holds only commission (no royalty), tracked via accumulatedCommission
            const accumulated = await marketplace.accumulatedCommission();
            expect(accumulated).to.equal(commission);
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
            const accumulated = await marketplace.accumulatedCommission();
            expect(accumulated).to.equal(commission);
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

    // ──── Offer System Tests ────

    describe("Making Offers", function () {
        it("Should escrow ETH and create offer", async function () {
            const offerAmount = ethers.parseEther("0.5");
            const marketplaceAddr = await marketplace.getAddress();
            const nftAddr = await nftContract.getAddress();

            const balBefore = await ethers.provider.getBalance(marketplaceAddr);
            await marketplace
                .connect(buyer)
                .makeOffer(nftAddr, 0, 0, { value: offerAmount });
            const balAfter = await ethers.provider.getBalance(marketplaceAddr);

            expect(balAfter - balBefore).to.equal(offerAmount);

            const offer = await marketplace.getOffer(0);
            expect(offer.buyer).to.equal(buyer.address);
            expect(offer.nftContract).to.equal(nftAddr);
            expect(offer.tokenId).to.equal(0n);
            expect(offer.amount).to.equal(offerAmount);
            expect(offer.active).to.be.true;
        });

        it("Should use default 7-day duration when durationSeconds=0", async function () {
            const offerAmount = ethers.parseEther("0.5");
            const now = await time.latest();
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, { value: offerAmount });

            const offer = await marketplace.getOffer(0);
            const sevenDays = 7 * 24 * 60 * 60;
            // expiry should be approximately now + 7 days (within a few seconds)
            expect(offer.expiry).to.be.closeTo(BigInt(now + sevenDays), 10n);
        });

        it("Should accept custom duration within bounds", async function () {
            const offerAmount = ethers.parseEther("0.5");
            const threeDays = 3 * 24 * 60 * 60;
            const now = await time.latest();
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, threeDays, {
                    value: offerAmount,
                });

            const offer = await marketplace.getOffer(0);
            expect(offer.expiry).to.be.closeTo(BigInt(now + threeDays), 10n);
        });

        it("Should reject zero ETH offer", async function () {
            await expect(
                marketplace
                    .connect(buyer)
                    .makeOffer(await nftContract.getAddress(), 0, 0, { value: 0 })
            ).to.be.revertedWith("Offer amount must be > 0");
        });

        it("Should reject duration below minimum (1h)", async function () {
            const tooShort = 30 * 60; // 30 minutes
            await expect(
                marketplace
                    .connect(buyer)
                    .makeOffer(await nftContract.getAddress(), 0, tooShort, {
                        value: ethers.parseEther("0.5"),
                    })
            ).to.be.revertedWith("Duration too short (min 1h)");
        });

        it("Should reject duration above maximum (30d)", async function () {
            const tooLong = 31 * 24 * 60 * 60; // 31 days
            await expect(
                marketplace
                    .connect(buyer)
                    .makeOffer(await nftContract.getAddress(), 0, tooLong, {
                        value: ethers.parseEther("0.5"),
                    })
            ).to.be.revertedWith("Duration too long (max 30d)");
        });

        it("Should emit OfferMade event with correct args", async function () {
            const offerAmount = ethers.parseEther("0.5");
            const now = await time.latest();
            const sevenDays = 7 * 24 * 60 * 60;

            const tx = await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });
            const receipt = await tx.wait();
            const event = receipt.logs.find(
                (log) => log.fragment && log.fragment.name === "OfferMade"
            );
            expect(event).to.not.be.undefined;
            expect(event.args.offerId).to.equal(0n);
            expect(event.args.buyer).to.equal(buyer.address);
            expect(event.args.amount).to.equal(offerAmount);
            expect(event.args.expiry).to.be.closeTo(BigInt(now + sevenDays), 10n);
        });

        it("Should increment offerId for each new offer", async function () {
            const offerAmount = ethers.parseEther("0.1");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, { value: offerAmount });
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, { value: offerAmount });

            expect(await marketplace.totalOffers()).to.equal(2n);
            const offer0 = await marketplace.getOffer(0);
            const offer1 = await marketplace.getOffer(1);
            expect(offer0.offerId).to.equal(0n);
            expect(offer1.offerId).to.equal(1n);
        });
    });

    describe("Accepting Offers", function () {
        let offerAmount;

        beforeEach(async function () {
            offerAmount = ethers.parseEther("0.8");
            // buyer makes offer on seller's NFT (token 0)
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });
            // seller must approve marketplace before accepting
            // (already approved in outer beforeEach for token 0)
        });

        it("Should transfer NFT to buyer when seller accepts", async function () {
            await marketplace.connect(seller).acceptOffer(0);
            expect(await nftContract.ownerOf(0)).to.equal(buyer.address);
        });

        it("Should pay seller net proceeds (offer minus commission)", async function () {
            const sellerBalBefore = await ethers.provider.getBalance(seller.address);
            const tx = await marketplace.connect(seller).acceptOffer(0);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const sellerBalAfter = await ethers.provider.getBalance(seller.address);

            // 2.5% commission on 0.8 ETH, 0% royalty (minted with 0 in beforeEach)
            const commission = (offerAmount * 250n) / 10000n;
            const expectedProceeds = offerAmount - commission;
            expect(sellerBalAfter - sellerBalBefore + gasCost).to.equal(expectedProceeds);
        });

        it("Should pay royalty to creator and correct proceeds to seller", async function () {
            // Deploy fresh NFT with 5% royalty
            const [, , , creator] = await ethers.getSigners();
            const NFTContract = await ethers.getContractFactory("NFTContract");
            const royaltyNft = await NFTContract.deploy();
            await royaltyNft.waitForDeployment();

            await royaltyNft.connect(creator).mintNFT("ipfs://royalty-offer", 500); // 5%
            await royaltyNft
                .connect(creator)
                .approve(await marketplace.getAddress(), 0);

            // buyer makes offer on creator's NFT
            await marketplace
                .connect(buyer)
                .makeOffer(await royaltyNft.getAddress(), 0, 0, {
                    value: offerAmount,
                });

            const creatorBalBefore = await ethers.provider.getBalance(creator.address);
            const tx = await marketplace.connect(creator).acceptOffer(1); // offerId=1
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const creatorBalAfter = await ethers.provider.getBalance(creator.address);

            // royalty = 5% = 0.04 ETH, commission = 2.5% = 0.02 ETH
            // sellerProceeds = 0.8 - 0.02 - 0.04 = 0.74 ETH
            // creator is both seller and royalty receiver: gets 0.74 + 0.04 = 0.78 ETH
            const royaltyAmount = (offerAmount * 500n) / 10000n;
            const commission = (offerAmount * 250n) / 10000n;
            const sellerProceeds = offerAmount - commission - royaltyAmount;
            const expectedCreatorTotal = sellerProceeds + royaltyAmount;
            expect(creatorBalAfter - creatorBalBefore + gasCost).to.equal(
                expectedCreatorTotal
            );
        });

        it("Should reject acceptOffer from non-owner", async function () {
            await expect(
                marketplace.connect(buyer).acceptOffer(0)
            ).to.be.revertedWith("Not the NFT owner");
        });

        it("Should reject acceptOffer for expired offer", async function () {
            // Advance time past 7 days
            await time.increase(7 * 24 * 60 * 60 + 1);
            await expect(
                marketplace.connect(seller).acceptOffer(0)
            ).to.be.revertedWith("Offer expired");
        });

        it("Should reject acceptOffer for already-inactive offer", async function () {
            // Cancel offer first
            await marketplace.connect(buyer).cancelOffer(0);
            await expect(
                marketplace.connect(seller).acceptOffer(0)
            ).to.be.revertedWith("Offer not active");
        });

        it("Should emit OfferAccepted event", async function () {
            await expect(marketplace.connect(seller).acceptOffer(0))
                .to.emit(marketplace, "OfferAccepted")
                .withArgs(
                    0,
                    await nftContract.getAddress(),
                    0,
                    seller.address,
                    buyer.address,
                    offerAmount
                );
        });

        it("Should mark offer as inactive after acceptance", async function () {
            await marketplace.connect(seller).acceptOffer(0);
            const offer = await marketplace.getOffer(0);
            expect(offer.active).to.be.false;
        });
    });

    describe("Auto-Unlist on Accept", function () {
        it("Should cancel active listing when offer is accepted", async function () {
            // Seller lists the NFT
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);

            // Buyer makes an offer
            const offerAmount = ethers.parseEther("0.9");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });

            // Seller accepts offer — listing should be auto-cancelled
            await marketplace.connect(seller).acceptOffer(0);

            // Listing should now be inactive
            const listing = await marketplace.listings(0);
            expect(listing.active).to.be.false;

            // Reverse lookup should be cleared
            const stored = await marketplace.activeListingByToken(
                await nftContract.getAddress(),
                0
            );
            expect(stored).to.equal(0n);

            // _activeListingIds should be empty
            const activeIds = await marketplace.getActiveListingIds();
            expect(activeIds.length).to.equal(0);
        });

        it("Should emit ItemUnlisted event when auto-unlisting on accept", async function () {
            await marketplace
                .connect(seller)
                .listItem(await nftContract.getAddress(), 0, PRICE);
            const offerAmount = ethers.parseEther("0.9");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });

            await expect(marketplace.connect(seller).acceptOffer(0))
                .to.emit(marketplace, "ItemUnlisted")
                .withArgs(0);
        });

        it("Should work correctly when there is no active listing", async function () {
            // No listing exists — just an offer
            const offerAmount = ethers.parseEther("0.9");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });

            // Should NOT revert
            await expect(marketplace.connect(seller).acceptOffer(0)).to.not.be.reverted;

            // NFT transferred
            expect(await nftContract.ownerOf(0)).to.equal(buyer.address);
        });
    });

    describe("Rejecting Offers", function () {
        let offerAmount;

        beforeEach(async function () {
            offerAmount = ethers.parseEther("0.5");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });
        });

        it("Should refund buyer when seller rejects offer", async function () {
            const buyerBalBefore = await ethers.provider.getBalance(buyer.address);
            await marketplace.connect(seller).rejectOffer(0);
            const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

            expect(buyerBalAfter - buyerBalBefore).to.equal(offerAmount);
        });

        it("Should reject rejectOffer from non-owner", async function () {
            const [, , , thirdParty] = await ethers.getSigners();
            await expect(
                marketplace.connect(thirdParty).rejectOffer(0)
            ).to.be.revertedWith("Not the NFT owner");
        });

        it("Should reject rejectOffer for already-inactive offer", async function () {
            await marketplace.connect(seller).rejectOffer(0);
            await expect(
                marketplace.connect(seller).rejectOffer(0)
            ).to.be.revertedWith("Offer not active");
        });

        it("Should emit OfferRejected event", async function () {
            await expect(marketplace.connect(seller).rejectOffer(0))
                .to.emit(marketplace, "OfferRejected")
                .withArgs(0);
        });

        it("Should mark offer as inactive after rejection", async function () {
            await marketplace.connect(seller).rejectOffer(0);
            const offer = await marketplace.getOffer(0);
            expect(offer.active).to.be.false;
        });
    });

    describe("Cancelling Offers", function () {
        let offerAmount;

        beforeEach(async function () {
            offerAmount = ethers.parseEther("0.5");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });
        });

        it("Should refund buyer when buyer cancels offer", async function () {
            const buyerBalBefore = await ethers.provider.getBalance(buyer.address);
            const tx = await marketplace.connect(buyer).cancelOffer(0);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

            expect(buyerBalAfter - buyerBalBefore + gasCost).to.equal(offerAmount);
        });

        it("Should reject cancelOffer from non-buyer", async function () {
            await expect(
                marketplace.connect(seller).cancelOffer(0)
            ).to.be.revertedWith("Not the offer buyer");
        });

        it("Should reject cancelOffer for already-inactive offer", async function () {
            await marketplace.connect(buyer).cancelOffer(0);
            await expect(
                marketplace.connect(buyer).cancelOffer(0)
            ).to.be.revertedWith("Offer not active");
        });

        it("Should emit OfferCancelled event", async function () {
            await expect(marketplace.connect(buyer).cancelOffer(0))
                .to.emit(marketplace, "OfferCancelled")
                .withArgs(0);
        });

        it("Should mark offer as inactive after cancellation", async function () {
            await marketplace.connect(buyer).cancelOffer(0);
            const offer = await marketplace.getOffer(0);
            expect(offer.active).to.be.false;
        });
    });

    describe("Offer Expiry", function () {
        let offerAmount;

        beforeEach(async function () {
            offerAmount = ethers.parseEther("0.5");
            await marketplace
                .connect(buyer)
                .makeOffer(await nftContract.getAddress(), 0, 0, {
                    value: offerAmount,
                });
        });

        it("Should reject acceptOffer after offer has expired", async function () {
            // Advance time by 7 days + 1 second
            await time.increase(7 * 24 * 60 * 60 + 1);

            await expect(
                marketplace.connect(seller).acceptOffer(0)
            ).to.be.revertedWith("Offer expired");
        });

        it("Should allow buyer to cancelOffer even after expiry (get refund)", async function () {
            await time.increase(7 * 24 * 60 * 60 + 1);

            const buyerBalBefore = await ethers.provider.getBalance(buyer.address);
            const tx = await marketplace.connect(buyer).cancelOffer(0);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

            expect(buyerBalAfter - buyerBalBefore + gasCost).to.equal(offerAmount);
        });

        it("Should allow seller to rejectOffer even after expiry", async function () {
            await time.increase(7 * 24 * 60 * 60 + 1);

            const buyerBalBefore = await ethers.provider.getBalance(buyer.address);
            await marketplace.connect(seller).rejectOffer(0);
            const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

            // Buyer gets refund
            expect(buyerBalAfter - buyerBalBefore).to.equal(offerAmount);
        });

        it("Should accept offer one second before expiry (still valid)", async function () {
            // Advance time to one second before expiry — should still be valid
            const offer = await marketplace.getOffer(0);
            const expiry = Number(offer.expiry);
            await time.increaseTo(expiry - 1);
            // block.timestamp <= expiry, so it's still valid
            await expect(marketplace.connect(seller).acceptOffer(0)).to.not.be.reverted;
        });
    });

    describe("Commission Safety", function () {
        it("Should track commission separately from escrowed offer ETH", async function () {
            const offerAmount = ethers.parseEther("1.0");
            const nftAddr = await nftContract.getAddress();
            const marketplaceAddr = await marketplace.getAddress();

            // Buyer makes offer — ETH escrowed
            await marketplace
                .connect(buyer)
                .makeOffer(nftAddr, 0, 0, { value: offerAmount });

            // Marketplace holds 1 ETH (escrowed), commission is 0
            const balMidway = await ethers.provider.getBalance(marketplaceAddr);
            expect(balMidway).to.equal(offerAmount);
            expect(await marketplace.accumulatedCommission()).to.equal(0n);

            // Seller accepts offer
            await marketplace.connect(seller).acceptOffer(0);

            const commission = (offerAmount * 250n) / 10000n;
            // After acceptance: escrowed ETH distributed, only commission remains
            const balAfter = await ethers.provider.getBalance(marketplaceAddr);
            expect(balAfter).to.equal(commission);
            expect(await marketplace.accumulatedCommission()).to.equal(commission);
        });

        it("Should not allow withdrawCommission to touch escrowed offer ETH", async function () {
            const offerAmount = ethers.parseEther("1.0");
            const nftAddr = await nftContract.getAddress();

            // Buyer 1 makes offer (escrowed ETH)
            const [, , , , buyer2] = await ethers.getSigners();
            await marketplace
                .connect(buyer2)
                .makeOffer(nftAddr, 0, 0, { value: offerAmount });

            // Separately: list and sell to generate commission
            await marketplace
                .connect(seller)
                .listItem(nftAddr, 0, PRICE);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });

            const commission = (PRICE * 250n) / 10000n;
            // Contract holds: escrowed offer (1 ETH) + commission (0.025 ETH)
            const totalBalance = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(totalBalance).to.equal(offerAmount + commission);

            // withdrawCommission should only take the commission
            const ownerBalBefore = await ethers.provider.getBalance(owner.address);
            const tx = await marketplace.connect(owner).withdrawCommission();
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const ownerBalAfter = await ethers.provider.getBalance(owner.address);

            expect(ownerBalAfter - ownerBalBefore + gasCost).to.equal(commission);

            // Escrowed ETH still in contract
            const balAfterWithdraw = await ethers.provider.getBalance(
                await marketplace.getAddress()
            );
            expect(balAfterWithdraw).to.equal(offerAmount);
        });

        it("Should revert withdrawCommission when no commission accumulated", async function () {
            // No sales made — commission is 0
            await expect(
                marketplace.connect(owner).withdrawCommission()
            ).to.be.revertedWith("No commission to withdraw");
        });

        it("Should accumulate commission from both listings and offers", async function () {
            const nftAddr = await nftContract.getAddress();

            // Mint second NFT to seller
            await nftContract.connect(seller).mintNFT("ipfs://second", 0);
            await nftContract
                .connect(seller)
                .approve(await marketplace.getAddress(), 1);

            // Sale 1: via buyItem
            await marketplace.connect(seller).listItem(nftAddr, 0, PRICE);
            await marketplace.connect(buyer).buyItem(0, { value: PRICE });

            // Sale 2: via acceptOffer on token 1
            const offerAmount = ethers.parseEther("0.5");
            await marketplace
                .connect(buyer)
                .makeOffer(nftAddr, 1, 0, { value: offerAmount });
            await marketplace.connect(seller).acceptOffer(0);

            const commissionFromSale1 = (PRICE * 250n) / 10000n;
            const commissionFromSale2 = (offerAmount * 250n) / 10000n;
            const totalExpected = commissionFromSale1 + commissionFromSale2;

            expect(await marketplace.accumulatedCommission()).to.equal(totalExpected);
        });
    });
});
