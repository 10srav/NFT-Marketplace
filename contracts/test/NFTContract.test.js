const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTContract", function () {
    let nftContract;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const NFTContract = await ethers.getContractFactory("NFTContract");
        nftContract = await NFTContract.deploy();
        await nftContract.waitForDeployment();
    });

    describe("Minting", function () {
        it("Should mint an NFT and assign to caller", async function () {
            const tx = await nftContract.connect(addr1).mintNFT("ipfs://test-uri-1");
            await tx.wait();
            expect(await nftContract.ownerOf(0)).to.equal(addr1.address);
        });

        it("Should set the correct tokenURI", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://test-uri-1");
            expect(await nftContract.tokenURI(0)).to.equal("ipfs://test-uri-1");
        });

        it("Should emit NFTMinted event", async function () {
            await expect(nftContract.connect(addr1).mintNFT("ipfs://test-uri-1"))
                .to.emit(nftContract, "NFTMinted")
                .withArgs(addr1.address, 0, "ipfs://test-uri-1");
        });

        it("Should increment token IDs", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await nftContract.connect(addr1).mintNFT("ipfs://uri-1");
            expect(await nftContract.ownerOf(0)).to.equal(addr1.address);
            expect(await nftContract.ownerOf(1)).to.equal(addr1.address);
        });

        it("Should track total minted count", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await nftContract.connect(addr2).mintNFT("ipfs://uri-1");
            expect(await nftContract.totalMinted()).to.equal(2);
        });
    });

    describe("Burning", function () {
        it("Should allow owner to burn their NFT", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await nftContract.connect(addr1).burn(0);
            await expect(nftContract.ownerOf(0)).to.be.reverted;
        });

        it("Should prevent non-owner from burning", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await expect(
                nftContract.connect(addr2).burn(0)
            ).to.be.revertedWith("Not the token owner");
        });

        it("Should emit NFTBurned event", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await expect(nftContract.connect(addr1).burn(0))
                .to.emit(nftContract, "NFTBurned")
                .withArgs(0);
        });
    });

    describe("Transfers", function () {
        it("Should allow transfer between users", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0");
            await nftContract
                .connect(addr1)
                .transferFrom(addr1.address, addr2.address, 0);
            expect(await nftContract.ownerOf(0)).to.equal(addr2.address);
        });
    });
});
