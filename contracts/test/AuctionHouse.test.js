const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AuctionHouse", function () {
    const RESERVE = ethers.parseEther("1");
    const DURATION = 24 * 60 * 60; // 1 day in seconds

    async function deployFixture() {
        const [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

        // Deploy NFTContract
        const NFTContract = await ethers.getContractFactory("NFTContract");
        const nftContract = await NFTContract.deploy();
        await nftContract.waitForDeployment();

        // Deploy AuctionHouse
        const AuctionHouse = await ethers.getContractFactory("AuctionHouse");
        const auctionHouse = await AuctionHouse.deploy();
        await auctionHouse.waitForDeployment();

        // Mint an NFT to seller with 500 bps (5%) royalty
        await nftContract.connect(seller).mintNFT("ipfs://auction-test-uri", 500);
        // tokenId = 0

        // Approve AuctionHouse for the NFT
        await nftContract
            .connect(seller)
            .approve(await auctionHouse.getAddress(), 0);

        return { nftContract, auctionHouse, owner, seller, bidder1, bidder2, bidder3 };
    }

    // Helper: create an auction and return auctionId
    async function createAuction(auctionHouse, nftContract, seller, reserve, duration) {
        const res = reserve !== undefined ? reserve : RESERVE;
        const dur = duration !== undefined ? duration : DURATION;
        const tx = await auctionHouse
            .connect(seller)
            .createEnglishAuction(await nftContract.getAddress(), 0, res, dur);
        const receipt = await tx.wait();
        const event = receipt.logs
            .map((log) => {
                try {
                    return auctionHouse.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find((e) => e && e.name === "EnglishAuctionCreated");
        return event.args.auctionId;
    }

    // ──── Creating Auctions ────

    describe("Creating Auctions", function () {
        it("Should create auction and escrow NFT in contract", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            const auctionHouseAddr = await auctionHouse.getAddress();
            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            // NFT transferred to AuctionHouse (escrowed)
            expect(await nftContract.ownerOf(0)).to.equal(auctionHouseAddr);

            const auction = await auctionHouse.englishAuctions(auctionId);
            expect(auction.seller).to.equal(seller.address);
            expect(auction.reservePrice).to.equal(RESERVE);
            expect(auction.highestBidder).to.equal(ethers.ZeroAddress);
            expect(auction.highestBid).to.equal(0n);
            expect(auction.settled).to.be.false;
            expect(auction.cancelled).to.be.false;
        });

        it("Should emit EnglishAuctionCreated event with correct args", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            const nftAddr = await nftContract.getAddress();
            const latestTime = await time.latest();

            await expect(
                auctionHouse
                    .connect(seller)
                    .createEnglishAuction(nftAddr, 0, RESERVE, DURATION)
            )
                .to.emit(auctionHouse, "EnglishAuctionCreated")
                .withArgs(
                    0n,
                    nftAddr,
                    0n,
                    seller.address,
                    RESERVE,
                    // endTime is latestTime + 1 (next block) + DURATION; allow range check below
                    (endTime) => endTime > BigInt(latestTime) && endTime <= BigInt(latestTime + DURATION + 5)
                );
        });

        it("Should reject listing from non-owner of NFT", async function () {
            const { nftContract, auctionHouse, bidder1 } = await loadFixture(deployFixture);

            await expect(
                auctionHouse
                    .connect(bidder1)
                    .createEnglishAuction(await nftContract.getAddress(), 0, RESERVE, DURATION)
            ).to.be.revertedWith("Not the NFT owner");
        });

        it("Should reject duration below minimum (1 hour)", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            const tooShort = 30 * 60; // 30 minutes
            await expect(
                auctionHouse
                    .connect(seller)
                    .createEnglishAuction(await nftContract.getAddress(), 0, RESERVE, tooShort)
            ).to.be.revertedWith("Invalid duration");
        });

        it("Should reject duration above maximum (30 days)", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            const tooLong = 31 * 24 * 60 * 60; // 31 days
            await expect(
                auctionHouse
                    .connect(seller)
                    .createEnglishAuction(await nftContract.getAddress(), 0, RESERVE, tooLong)
            ).to.be.revertedWith("Invalid duration");
        });

        it("Should reject zero reserve price", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            await expect(
                auctionHouse
                    .connect(seller)
                    .createEnglishAuction(await nftContract.getAddress(), 0, 0, DURATION)
            ).to.be.revertedWith("Reserve price must be > 0");
        });

        it("Should return the correct auctionId", async function () {
            const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            expect(auctionId).to.equal(0n);
        });
    });

    // ──── Placing Bids ────

    describe("Placing Bids", function () {
        it("Should accept a valid bid at or above reserve", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse
                .connect(bidder1)
                .placeBid(auctionId, { value: RESERVE });

            const auction = await auctionHouse.englishAuctions(auctionId);
            expect(auction.highestBidder).to.equal(bidder1.address);
            expect(auction.highestBid).to.equal(RESERVE);
        });

        it("Should reject a bid below reserve price", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const belowReserve = RESERVE - 1n;

            await expect(
                auctionHouse
                    .connect(bidder1)
                    .placeBid(auctionId, { value: belowReserve })
            ).to.be.revertedWith("Bid below reserve price");
        });

        it("Should reject a bid not exceeding the current highest bid", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse
                .connect(bidder1)
                .placeBid(auctionId, { value: RESERVE });

            // bidder2 tries to bid same amount — must be strictly greater
            await expect(
                auctionHouse
                    .connect(bidder2)
                    .placeBid(auctionId, { value: RESERVE })
            ).to.be.revertedWith("Bid must exceed current highest bid");
        });

        it("Should credit pendingReturns for the outbid bidder", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await auctionHouse
                .connect(bidder1)
                .placeBid(auctionId, { value: RESERVE });

            const higherBid = RESERVE + ethers.parseEther("0.5");
            await auctionHouse
                .connect(bidder2)
                .placeBid(auctionId, { value: higherBid });

            // bidder1 should have RESERVE credited for withdrawal
            const pending = await auctionHouse.pendingReturns(auctionId, bidder1.address);
            expect(pending).to.equal(RESERVE);
        });

        it("Should reject a bid after auction has ended", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            // Advance time past auction end
            await time.increase(DURATION + 1);

            await expect(
                auctionHouse
                    .connect(bidder1)
                    .placeBid(auctionId, { value: RESERVE })
            ).to.be.revertedWith("Auction has ended");
        });

        it("Should reject a bid from the seller", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await expect(
                auctionHouse
                    .connect(seller)
                    .placeBid(auctionId, { value: RESERVE })
            ).to.be.revertedWith("Seller cannot bid");
        });

        it("Should emit BidPlaced event with correct args", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const auction = await auctionHouse.englishAuctions(auctionId);

            await expect(
                auctionHouse
                    .connect(bidder1)
                    .placeBid(auctionId, { value: RESERVE })
            )
                .to.emit(auctionHouse, "BidPlaced")
                .withArgs(auctionId, bidder1.address, RESERVE, auction.endTime);
        });

        it("Should accumulate pendingReturns across multiple outbids", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2, bidder3 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const bid1 = RESERVE;
            const bid2 = RESERVE + ethers.parseEther("0.5");
            const bid3 = RESERVE + ethers.parseEther("1.0");

            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: bid1 });
            await auctionHouse.connect(bidder2).placeBid(auctionId, { value: bid2 });
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: bid3 });

            // bidder2 should have bid2 pending; bidder1 had bid1 credited then re-bid — bid1 pending from first outbid
            const pending2 = await auctionHouse.pendingReturns(auctionId, bidder2.address);
            expect(pending2).to.equal(bid2);
            // bidder1's original bid1 is in pendingReturns from when bidder2 outbid them
            const pending1 = await auctionHouse.pendingReturns(auctionId, bidder1.address);
            expect(pending1).to.equal(bid1);
        });
    });

    // ──── Anti-Sniping ────

    describe("Anti-Sniping", function () {
        it("Should extend endTime when bid placed within the snipe window", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const auctionBefore = await auctionHouse.englishAuctions(auctionId);

            // Advance to just inside the anti-snipe window (5 minutes before end)
            const snipeWindowStart = Number(auctionBefore.endTime) - 5 * 60;
            await time.increaseTo(snipeWindowStart);

            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            const auctionAfter = await auctionHouse.englishAuctions(auctionId);
            const EXTENSION = await auctionHouse.ANTI_SNIPE_EXTENSION();

            // endTime should have increased by ANTI_SNIPE_EXTENSION
            expect(auctionAfter.endTime).to.equal(auctionBefore.endTime + EXTENSION);
        });

        it("Should NOT extend endTime when bid placed outside the snipe window", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const auctionBefore = await auctionHouse.englishAuctions(auctionId);

            // Bid placed early — 12 hours into the 24-hour auction (well outside snipe window)
            await time.increase(12 * 60 * 60);

            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            const auctionAfter = await auctionHouse.englishAuctions(auctionId);

            // endTime should NOT have changed
            expect(auctionAfter.endTime).to.equal(auctionBefore.endTime);
        });

        it("Should emit BidPlaced with extended endTime after snipe", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            const auctionBefore = await auctionHouse.englishAuctions(auctionId);
            const EXTENSION = await auctionHouse.ANTI_SNIPE_EXTENSION();
            const expectedNewEndTime = auctionBefore.endTime + EXTENSION;

            // Move to 1 minute before end (within snipe window)
            const oneMinBeforeEnd = Number(auctionBefore.endTime) - 60;
            await time.increaseTo(oneMinBeforeEnd);

            await expect(
                auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE })
            )
                .to.emit(auctionHouse, "BidPlaced")
                .withArgs(auctionId, bidder1.address, RESERVE, expectedNewEndTime);
        });
    });

    // ──── Withdrawing Bids ────

    describe("Withdrawing Bids", function () {
        it("Should allow outbid bidder to withdraw their funds", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            const higherBid = RESERVE + ethers.parseEther("0.5");
            await auctionHouse.connect(bidder2).placeBid(auctionId, { value: higherBid });

            // bidder1 withdraws their refund
            await expect(
                auctionHouse.connect(bidder1).withdrawBid(auctionId)
            ).to.changeEtherBalance(bidder1, RESERVE);
        });

        it("Should reject withdrawal when pendingReturns is zero", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await expect(
                auctionHouse.connect(bidder1).withdrawBid(auctionId)
            ).to.be.revertedWith("No funds to withdraw");
        });

        it("Should zero out pendingReturns after withdrawal (prevent double-withdraw)", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            const higherBid = RESERVE + ethers.parseEther("0.5");
            await auctionHouse.connect(bidder2).placeBid(auctionId, { value: higherBid });

            await auctionHouse.connect(bidder1).withdrawBid(auctionId);

            const remaining = await auctionHouse.pendingReturns(auctionId, bidder1.address);
            expect(remaining).to.equal(0n);

            // Second withdrawal attempt should fail
            await expect(
                auctionHouse.connect(bidder1).withdrawBid(auctionId)
            ).to.be.revertedWith("No funds to withdraw");
        });

        it("Should emit BidWithdrawn event", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            const higherBid = RESERVE + ethers.parseEther("0.5");
            await auctionHouse.connect(bidder2).placeBid(auctionId, { value: higherBid });

            await expect(auctionHouse.connect(bidder1).withdrawBid(auctionId))
                .to.emit(auctionHouse, "BidWithdrawn")
                .withArgs(auctionId, bidder1.address, RESERVE);
        });
    });

    // ──── Settling Auctions ────

    describe("Settling Auctions", function () {
        it("Should transfer NFT to the highest bidder on settlement", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            await time.increase(DURATION + 1);
            await auctionHouse.settleAuction(auctionId);

            expect(await nftContract.ownerOf(0)).to.equal(bidder1.address);
        });

        it("Should pay seller ETH minus commission and royalty", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            await time.increase(DURATION + 1);

            // seller is also royalty receiver (minted with 5% royalty)
            // commission = 2.5% of RESERVE = 0.025 ETH
            // royalty = 5% of RESERVE = 0.05 ETH
            // sellerProceeds = RESERVE - commission - royalty = 0.925 ETH
            // seller = seller AND royalty receiver, so total ETH to seller = 0.925 + 0.05 = 0.975 ETH
            const commission = (RESERVE * 250n) / 10000n;
            const royalty = (RESERVE * 500n) / 10000n;
            const sellerProceeds = RESERVE - commission - royalty;
            const expectedSellerTotal = sellerProceeds + royalty; // seller IS royalty receiver

            await expect(
                auctionHouse.settleAuction(auctionId)
            ).to.changeEtherBalance(seller, expectedSellerTotal);
        });

        it("Should pay royalty to separate creator address", async function () {
            const { auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            // Deploy a new NFT and mint with a different creator as royalty receiver
            const [, , , , , creator] = await ethers.getSigners();
            const NFTFactory = await ethers.getContractFactory("NFTContract");
            const royaltyNft = await NFTFactory.deploy();
            await royaltyNft.waitForDeployment();

            // Creator mints token 0 with 5% royalty
            await royaltyNft.connect(creator).mintNFT("ipfs://creator-uri", 500);
            // Transfer to seller so seller can auction it
            await royaltyNft
                .connect(creator)
                .transferFrom(creator.address, seller.address, 0);
            await royaltyNft
                .connect(seller)
                .approve(await auctionHouse.getAddress(), 0);

            const auctionId = await createAuction(
                auctionHouse,
                royaltyNft,
                seller,
                RESERVE,
                DURATION
            );

            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);

            const commission = (RESERVE * 250n) / 10000n;
            const royalty = (RESERVE * 500n) / 10000n;
            const sellerProceeds = RESERVE - commission - royalty;

            // Verify creator gets royalty
            await expect(
                auctionHouse.settleAuction(auctionId)
            ).to.changeEtherBalances(
                [creator, seller],
                [royalty, sellerProceeds]
            );
        });

        it("Should reject settlement before auction has ended", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            await expect(
                auctionHouse.settleAuction(auctionId)
            ).to.be.revertedWith("Auction has not ended");
        });

        it("Should reject double settlement", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);

            await auctionHouse.settleAuction(auctionId);

            await expect(
                auctionHouse.settleAuction(auctionId)
            ).to.be.revertedWith("Auction already settled");
        });

        it("Should return NFT to seller if no bids placed", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await time.increase(DURATION + 1);

            await auctionHouse.settleAuction(auctionId);

            // NFT returned to seller
            expect(await nftContract.ownerOf(0)).to.equal(seller.address);
        });

        it("Should allow anyone (not just seller) to call settle", async function () {
            const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);

            // bidder2 (not seller or winner) can settle
            await expect(auctionHouse.connect(bidder2).settleAuction(auctionId)).to.not.be
                .reverted;
        });

        it("Should emit EnglishAuctionSettled event with winner and amount", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);

            await expect(auctionHouse.settleAuction(auctionId))
                .to.emit(auctionHouse, "EnglishAuctionSettled")
                .withArgs(auctionId, bidder1.address, RESERVE);
        });

        it("Should emit EnglishAuctionSettled with zero address and zero amount if no bids", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await time.increase(DURATION + 1);

            await expect(auctionHouse.settleAuction(auctionId))
                .to.emit(auctionHouse, "EnglishAuctionSettled")
                .withArgs(auctionId, ethers.ZeroAddress, 0n);
        });

        it("Should leave commission in AuctionHouse contract after settlement", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);
            await auctionHouse.settleAuction(auctionId);

            const commission = (RESERVE * 250n) / 10000n;
            const contractBalance = await ethers.provider.getBalance(
                await auctionHouse.getAddress()
            );
            expect(contractBalance).to.equal(commission);
        });
    });

    // ──── Cancelling Auctions ────

    describe("Cancelling Auctions", function () {
        it("Should allow seller to cancel if no bids have been placed", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await auctionHouse.connect(seller).cancelEnglishAuction(auctionId);

            const auction = await auctionHouse.englishAuctions(auctionId);
            expect(auction.cancelled).to.be.true;

            // NFT returned to seller
            expect(await nftContract.ownerOf(0)).to.equal(seller.address);
        });

        it("Should reject cancellation when bids have been placed", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });

            await expect(
                auctionHouse.connect(seller).cancelEnglishAuction(auctionId)
            ).to.be.revertedWith("Cannot cancel with active bids");
        });

        it("Should reject cancellation by non-seller", async function () {
            const { nftContract, auctionHouse, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await expect(
                auctionHouse.connect(bidder1).cancelEnglishAuction(auctionId)
            ).to.be.revertedWith("Not the seller");
        });

        it("Should reject double cancellation", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(seller).cancelEnglishAuction(auctionId);

            await expect(
                auctionHouse.connect(seller).cancelEnglishAuction(auctionId)
            ).to.be.revertedWith("Auction already cancelled");
        });

        it("Should emit EnglishAuctionCancelled event", async function () {
            const { nftContract, auctionHouse, seller } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await expect(auctionHouse.connect(seller).cancelEnglishAuction(auctionId))
                .to.emit(auctionHouse, "EnglishAuctionCancelled")
                .withArgs(auctionId);
        });
    });

    // ──── Dutch Auctions ────

    describe("Dutch Auctions", function () {
        const START_PRICE = ethers.parseEther("10");
        const END_PRICE = ethers.parseEther("1");
        const DUTCH_DURATION = 24 * 60 * 60; // 1 day in seconds

        // Helper: mint a fresh NFT for Dutch auction tests (avoids conflicts with English auction tokenId 0)
        async function mintAndApproveForDutch(nftContract, auctionHouse, seller) {
            await nftContract.connect(seller).mintNFT("ipfs://dutch-test-uri", 500);
            const tokenId = 1; // second mint
            await nftContract.connect(seller).approve(await auctionHouse.getAddress(), tokenId);
            return tokenId;
        }

        // Helper: create a Dutch auction and return auctionId
        async function createDutchAuction(
            auctionHouse,
            nftContract,
            seller,
            tokenId,
            startPrice,
            endPrice,
            duration
        ) {
            const sp = startPrice !== undefined ? startPrice : START_PRICE;
            const ep = endPrice !== undefined ? endPrice : END_PRICE;
            const dur = duration !== undefined ? duration : DUTCH_DURATION;
            const tx = await auctionHouse
                .connect(seller)
                .createDutchAuction(await nftContract.getAddress(), tokenId, sp, ep, dur);
            const receipt = await tx.wait();
            const event = receipt.logs
                .map((log) => {
                    try {
                        return auctionHouse.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e && e.name === "DutchAuctionCreated");
            return event.args.auctionId;
        }

        // ──── Creating Dutch Auctions ────

        describe("Creating Dutch Auctions", function () {
            it("Should create a Dutch auction and escrow NFT", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionHouseAddr = await auctionHouse.getAddress();
                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // NFT escrowed in AuctionHouse
                expect(await nftContract.ownerOf(tokenId)).to.equal(auctionHouseAddr);

                const auction = await auctionHouse.dutchAuctions(auctionId);
                expect(auction.seller).to.equal(seller.address);
                expect(auction.startPrice).to.equal(START_PRICE);
                expect(auction.endPrice).to.equal(END_PRICE);
                expect(auction.duration).to.equal(BigInt(DUTCH_DURATION));
                expect(auction.sold).to.be.false;
                expect(auction.cancelled).to.be.false;
            });

            it("Should reject if startPrice <= endPrice", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                await expect(
                    auctionHouse
                        .connect(seller)
                        .createDutchAuction(
                            await nftContract.getAddress(),
                            tokenId,
                            END_PRICE,     // startPrice == endPrice
                            END_PRICE,
                            DUTCH_DURATION
                        )
                ).to.be.revertedWith("startPrice must exceed endPrice");
            });

            it("Should reject if endPrice is zero", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                await expect(
                    auctionHouse
                        .connect(seller)
                        .createDutchAuction(
                            await nftContract.getAddress(),
                            tokenId,
                            START_PRICE,
                            0n,
                            DUTCH_DURATION
                        )
                ).to.be.revertedWith("endPrice must be > 0");
            });

            it("Should reject if caller does not own NFT", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                await expect(
                    auctionHouse
                        .connect(bidder1)
                        .createDutchAuction(
                            await nftContract.getAddress(),
                            tokenId,
                            START_PRICE,
                            END_PRICE,
                            DUTCH_DURATION
                        )
                ).to.be.revertedWith("Not the NFT owner");
            });

            it("Should emit DutchAuctionCreated with correct args", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);
                const nftAddr = await nftContract.getAddress();

                await expect(
                    auctionHouse
                        .connect(seller)
                        .createDutchAuction(nftAddr, tokenId, START_PRICE, END_PRICE, DUTCH_DURATION)
                )
                    .to.emit(auctionHouse, "DutchAuctionCreated")
                    .withArgs(0n, nftAddr, BigInt(tokenId), seller.address, START_PRICE, END_PRICE, BigInt(DUTCH_DURATION));
            });
        });

        // ──── Price Decay ────

        describe("Price Decay", function () {
            it("Should return startPrice at auction start", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                const price = await auctionHouse.getCurrentPrice(auctionId);
                // At start, elapsed ~= 0, so price should be very close to startPrice
                // Allow 1 second of drift (1 ETH / 86400 seconds * 1 = ~11.5 gwei)
                const tolerance = (START_PRICE - END_PRICE) / BigInt(DUTCH_DURATION);
                expect(price).to.be.gte(START_PRICE - tolerance);
                expect(price).to.be.lte(START_PRICE);
            });

            it("Should return endPrice after duration expires", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await time.increase(DUTCH_DURATION + 1);

                const price = await auctionHouse.getCurrentPrice(auctionId);
                expect(price).to.equal(END_PRICE);
            });

            it("Should return midpoint price at half duration", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await time.increase(DUTCH_DURATION / 2);

                const price = await auctionHouse.getCurrentPrice(auctionId);
                const expectedMid = (START_PRICE + END_PRICE) / 2n;
                // Allow 1-second drift tolerance
                const tolerance = (START_PRICE - END_PRICE) / BigInt(DUTCH_DURATION);
                expect(price).to.be.gte(expectedMid - tolerance);
                expect(price).to.be.lte(expectedMid + tolerance);
            });

            it("Should decrease linearly over time", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                const auction = await auctionHouse.dutchAuctions(auctionId);
                const startTimestamp = Number(auction.startTime);

                // Check price at 25%, 50%, 75% of duration
                await time.increaseTo(startTimestamp + DUTCH_DURATION * 0.25);
                const price25 = await auctionHouse.getCurrentPrice(auctionId);

                await time.increaseTo(startTimestamp + DUTCH_DURATION * 0.5);
                const price50 = await auctionHouse.getCurrentPrice(auctionId);

                await time.increaseTo(startTimestamp + DUTCH_DURATION * 0.75);
                const price75 = await auctionHouse.getCurrentPrice(auctionId);

                // Monotonically decreasing
                expect(price25).to.be.gt(price50);
                expect(price50).to.be.gt(price75);
                // All prices should be between endPrice and startPrice
                expect(price25).to.be.lt(START_PRICE);
                expect(price75).to.be.gt(END_PRICE);
            });
        });

        // ──── Buying ────

        describe("Buying", function () {
            it("Should allow purchase at current price and transfer NFT to buyer", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // Advance to ~50% of duration and send START_PRICE (guaranteed >= currentPrice)
                await time.increase(DUTCH_DURATION / 2);
                await auctionHouse.connect(bidder1).buyDutch(auctionId, { value: START_PRICE });

                // NFT transferred to buyer
                expect(await nftContract.ownerOf(tokenId)).to.equal(bidder1.address);

                const auction = await auctionHouse.dutchAuctions(auctionId);
                expect(auction.sold).to.be.true;
            });

            it("Should refund overpayment to buyer", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // Pin exact buy timestamp at 50% of duration for deterministic price
                const auction = await auctionHouse.dutchAuctions(auctionId);
                const buyTimestamp = Number(auction.startTime) + DUTCH_DURATION / 2;
                await time.setNextBlockTimestamp(buyTimestamp);

                // Compute expected price at exact buyTimestamp (linear decay formula)
                const elapsed = BigInt(DUTCH_DURATION / 2);
                const priceDrop = ((START_PRICE - END_PRICE) * elapsed) / BigInt(DUTCH_DURATION);
                const expectedPrice = START_PRICE - priceDrop;

                // Send START_PRICE (well above expectedPrice) — overpayment should be refunded
                const sent = START_PRICE;

                const balanceBefore = await ethers.provider.getBalance(bidder1.address);
                const tx = await auctionHouse.connect(bidder1).buyDutch(auctionId, { value: sent });
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed * receipt.gasPrice;
                const balanceAfter = await ethers.provider.getBalance(bidder1.address);

                const netSpent = balanceBefore - balanceAfter - gasUsed;
                // netSpent should equal expectedPrice (overpayment refunded)
                expect(netSpent).to.equal(expectedPrice);
            });

            it("Should pay royalty to creator", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // Pin exact buy timestamp for deterministic price
                const auction = await auctionHouse.dutchAuctions(auctionId);
                const buyTimestamp = Number(auction.startTime) + DUTCH_DURATION / 2;
                await time.setNextBlockTimestamp(buyTimestamp);

                const elapsed = BigInt(DUTCH_DURATION / 2);
                const priceDrop = ((START_PRICE - END_PRICE) * elapsed) / BigInt(DUTCH_DURATION);
                const price = START_PRICE - priceDrop;

                // seller minted, so seller IS the royalty receiver (5% royalty)
                const royalty = (price * 500n) / 10000n;
                const commission = (price * 250n) / 10000n;
                const sellerProceeds = price - royalty - commission;
                // seller gets sellerProceeds + royalty (same address)
                const expectedSellerTotal = sellerProceeds + royalty;

                await expect(
                    auctionHouse.connect(bidder1).buyDutch(auctionId, { value: price })
                ).to.changeEtherBalance(seller, expectedSellerTotal);
            });

            it("Should pay seller minus royalty and commission", async function () {
                const { auctionHouse, seller, bidder1 } = await loadFixture(deployFixture);

                // Deploy a fresh NFT where creator != seller so royalties go to separate address
                const [, , , , , creator] = await ethers.getSigners();
                const NFTFactory = await ethers.getContractFactory("NFTContract");
                const royaltyNft = await NFTFactory.deploy();
                await royaltyNft.waitForDeployment();

                // Creator mints token 0 with 5% royalty
                await royaltyNft.connect(creator).mintNFT("ipfs://creator-dutch-uri", 500);
                // Transfer to seller so seller can auction it
                await royaltyNft
                    .connect(creator)
                    .transferFrom(creator.address, seller.address, 0);
                await royaltyNft
                    .connect(seller)
                    .approve(await auctionHouse.getAddress(), 0);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    royaltyNft,
                    seller,
                    0
                );

                // Pin exact buy timestamp for deterministic price
                const auction = await auctionHouse.dutchAuctions(auctionId);
                const buyTimestamp = Number(auction.startTime) + DUTCH_DURATION / 2;
                await time.setNextBlockTimestamp(buyTimestamp);

                const elapsed = BigInt(DUTCH_DURATION / 2);
                const priceDrop = ((START_PRICE - END_PRICE) * elapsed) / BigInt(DUTCH_DURATION);
                const price = START_PRICE - priceDrop;
                const royalty = (price * 500n) / 10000n;
                const commission = (price * 250n) / 10000n;
                const sellerProceeds = price - royalty - commission;

                await expect(
                    auctionHouse.connect(bidder1).buyDutch(auctionId, { value: price })
                ).to.changeEtherBalances(
                    [creator, seller],
                    [royalty, sellerProceeds]
                );
            });

            it("Should reject purchase with insufficient ETH", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // Send 0 ETH — always below any possible price (endPrice > 0)
                await expect(
                    auctionHouse.connect(bidder1).buyDutch(auctionId, { value: 0n })
                ).to.be.revertedWith("Insufficient ETH sent");
            });

            it("Should reject purchase of already sold auction", async function () {
                const { nftContract, auctionHouse, seller, bidder1, bidder2 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await time.increase(DUTCH_DURATION / 2);
                // Use START_PRICE to avoid timing issues on the first buy
                await auctionHouse.connect(bidder1).buyDutch(auctionId, { value: START_PRICE });

                await expect(
                    auctionHouse.connect(bidder2).buyDutch(auctionId, { value: START_PRICE })
                ).to.be.revertedWith("Auction already sold");
            });

            it("Should emit DutchAuctionSold with correct price", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                // Pin exact buy timestamp for deterministic price
                const auction = await auctionHouse.dutchAuctions(auctionId);
                const buyTimestamp = Number(auction.startTime) + DUTCH_DURATION / 2;
                await time.setNextBlockTimestamp(buyTimestamp);

                const elapsed = BigInt(DUTCH_DURATION / 2);
                const priceDrop = ((START_PRICE - END_PRICE) * elapsed) / BigInt(DUTCH_DURATION);
                const price = START_PRICE - priceDrop;

                await expect(
                    auctionHouse.connect(bidder1).buyDutch(auctionId, { value: price })
                )
                    .to.emit(auctionHouse, "DutchAuctionSold")
                    .withArgs(auctionId, bidder1.address, price);
            });
        });

        // ──── Cancelling Dutch Auctions ────

        describe("Cancelling Dutch Auctions", function () {
            it("Should allow seller to cancel and return NFT", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await auctionHouse.connect(seller).cancelDutchAuction(auctionId);

                // NFT returned to seller
                expect(await nftContract.ownerOf(tokenId)).to.equal(seller.address);

                const auction = await auctionHouse.dutchAuctions(auctionId);
                expect(auction.cancelled).to.be.true;
            });

            it("Should reject cancel by non-seller", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await expect(
                    auctionHouse.connect(bidder1).cancelDutchAuction(auctionId)
                ).to.be.revertedWith("Not the seller");
            });

            it("Should reject cancel of sold auction", async function () {
                const { nftContract, auctionHouse, seller, bidder1 } =
                    await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await time.increase(DUTCH_DURATION / 2);
                // Use START_PRICE to avoid timing issues
                await auctionHouse.connect(bidder1).buyDutch(auctionId, { value: START_PRICE });

                await expect(
                    auctionHouse.connect(seller).cancelDutchAuction(auctionId)
                ).to.be.revertedWith("Auction already sold");
            });

            it("Should emit DutchAuctionCancelled", async function () {
                const { nftContract, auctionHouse, seller } = await loadFixture(deployFixture);
                const tokenId = await mintAndApproveForDutch(nftContract, auctionHouse, seller);

                const auctionId = await createDutchAuction(
                    auctionHouse,
                    nftContract,
                    seller,
                    tokenId
                );

                await expect(auctionHouse.connect(seller).cancelDutchAuction(auctionId))
                    .to.emit(auctionHouse, "DutchAuctionCancelled")
                    .withArgs(auctionId);
            });
        });
    });

    // ──── Admin ────

    describe("Admin", function () {
        it("Should allow owner to update commission rate", async function () {
            const { auctionHouse, owner } = await loadFixture(deployFixture);

            await auctionHouse.connect(owner).setCommissionRate(500); // 5%
            expect(await auctionHouse.commissionRate()).to.equal(500);
        });

        it("Should reject commission rate above 10%", async function () {
            const { auctionHouse, owner } = await loadFixture(deployFixture);

            await expect(
                auctionHouse.connect(owner).setCommissionRate(1100)
            ).to.be.revertedWith("Max 10%");
        });

        it("Should emit CommissionRateUpdated event", async function () {
            const { auctionHouse, owner } = await loadFixture(deployFixture);

            await expect(auctionHouse.connect(owner).setCommissionRate(300))
                .to.emit(auctionHouse, "CommissionRateUpdated")
                .withArgs(300);
        });

        it("Should allow owner to pause and prevent creating auctions", async function () {
            const { nftContract, auctionHouse, owner, seller } =
                await loadFixture(deployFixture);

            await auctionHouse.connect(owner).pause();

            await expect(
                auctionHouse
                    .connect(seller)
                    .createEnglishAuction(
                        await nftContract.getAddress(),
                        0,
                        RESERVE,
                        DURATION
                    )
            ).to.be.reverted;
        });

        it("Should allow owner to pause and prevent bidding", async function () {
            const { nftContract, auctionHouse, owner, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await auctionHouse.connect(owner).pause();

            await expect(
                auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE })
            ).to.be.reverted;
        });

        it("Should allow owner to unpause", async function () {
            const { nftContract, auctionHouse, owner, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);

            await auctionHouse.connect(owner).pause();
            await auctionHouse.connect(owner).unpause();

            // Should not revert after unpausing
            await expect(
                auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE })
            ).to.not.be.reverted;
        });

        it("Should allow owner to withdraw accumulated commission", async function () {
            const { nftContract, auctionHouse, owner, seller, bidder1 } =
                await loadFixture(deployFixture);

            const auctionId = await createAuction(auctionHouse, nftContract, seller);
            await auctionHouse.connect(bidder1).placeBid(auctionId, { value: RESERVE });
            await time.increase(DURATION + 1);
            await auctionHouse.settleAuction(auctionId);

            const commission = (RESERVE * 250n) / 10000n;

            await expect(
                auctionHouse.connect(owner).withdrawCommission()
            ).to.changeEtherBalance(owner, commission);
        });
    });
});
