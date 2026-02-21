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
            const tx = await nftContract.connect(addr1).mintNFT("ipfs://test-uri-1", 500);
            await tx.wait();
            expect(await nftContract.ownerOf(0)).to.equal(addr1.address);
        });

        it("Should set the correct tokenURI", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://test-uri-1", 500);
            expect(await nftContract.tokenURI(0)).to.equal("ipfs://test-uri-1");
        });

        it("Should emit NFTMinted event", async function () {
            await expect(nftContract.connect(addr1).mintNFT("ipfs://test-uri-1", 500))
                .to.emit(nftContract, "NFTMinted")
                .withArgs(addr1.address, 0, "ipfs://test-uri-1");
        });

        it("Should increment token IDs", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await nftContract.connect(addr1).mintNFT("ipfs://uri-1", 500);
            expect(await nftContract.ownerOf(0)).to.equal(addr1.address);
            expect(await nftContract.ownerOf(1)).to.equal(addr1.address);
        });

        it("Should track total minted count", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await nftContract.connect(addr2).mintNFT("ipfs://uri-1", 500);
            expect(await nftContract.totalMinted()).to.equal(2);
        });
    });

    describe("Burning", function () {
        it("Should allow owner to burn their NFT", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await nftContract.connect(addr1).burn(0);
            await expect(nftContract.ownerOf(0)).to.be.reverted;
        });

        it("Should prevent non-owner from burning", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await expect(
                nftContract.connect(addr2).burn(0)
            ).to.be.revertedWith("Not the token owner");
        });

        it("Should emit NFTBurned event", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await expect(nftContract.connect(addr1).burn(0))
                .to.emit(nftContract, "NFTBurned")
                .withArgs(0);
        });
    });

    describe("Transfers", function () {
        it("Should allow transfer between users", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://uri-0", 500);
            await nftContract
                .connect(addr1)
                .transferFrom(addr1.address, addr2.address, 0);
            expect(await nftContract.ownerOf(0)).to.equal(addr2.address);
        });
    });

    describe("Royalties", function () {
        it("Should set royalty info on mint", async function () {
            // Mint with 5% royalty (500 bps)
            await nftContract.connect(addr1).mintNFT("ipfs://royalty-uri", 500);
            const salePrice = ethers.parseEther("1");
            const [receiver, amount] = await nftContract.royaltyInfo(0, salePrice);
            expect(receiver).to.equal(addr1.address);
            // 5% of 1 ETH = 0.05 ETH
            expect(amount).to.equal(ethers.parseEther("0.05"));
        });

        it("Should reject royalty over 10%", async function () {
            // 1001 bps = 10.01% — should revert
            await expect(
                nftContract.connect(addr1).mintNFT("ipfs://bad-royalty", 1001)
            ).to.be.revertedWith("Royalty exceeds 10%");
        });

        it("Should allow 0% royalty", async function () {
            await nftContract.connect(addr1).mintNFT("ipfs://zero-royalty", 0);
            const salePrice = ethers.parseEther("1");
            const [receiver, amount] = await nftContract.royaltyInfo(0, salePrice);
            // ERC2981 returns address(0) for receiver and 0 for amount when royalty is 0
            expect(amount).to.equal(0n);
        });

        it("Should allow exactly 10% royalty (1000 bps)", async function () {
            // Boundary: 1000 bps is the max allowed
            await nftContract.connect(addr1).mintNFT("ipfs://max-royalty", 1000);
            const salePrice = ethers.parseEther("1");
            const [receiver, amount] = await nftContract.royaltyInfo(0, salePrice);
            expect(receiver).to.equal(addr1.address);
            // 10% of 1 ETH = 0.1 ETH
            expect(amount).to.equal(ethers.parseEther("0.1"));
        });

        it("Should report ERC-2981 support via supportsInterface", async function () {
            // ERC-2981 interface ID = 0x2a55205a
            expect(await nftContract.supportsInterface("0x2a55205a")).to.be.true;
        });

        it("Should report ERC-721 support via supportsInterface", async function () {
            // ERC-721 interface ID = 0x80ac58cd
            expect(await nftContract.supportsInterface("0x80ac58cd")).to.be.true;
        });

        it("Should set correct royalty receiver as the minter, not the contract owner", async function () {
            // addr2 mints, not the contract owner
            await nftContract.connect(addr2).mintNFT("ipfs://addr2-uri", 750);
            const salePrice = ethers.parseEther("2");
            const [receiver, amount] = await nftContract.royaltyInfo(0, salePrice);
            expect(receiver).to.equal(addr2.address);
            // 7.5% of 2 ETH = 0.15 ETH
            expect(amount).to.equal(ethers.parseEther("0.15"));
        });

        it("Should set independent royalties per token", async function () {
            // addr1 mints token 0 with 5%, addr2 mints token 1 with 10%
            await nftContract.connect(addr1).mintNFT("ipfs://token-0", 500);
            await nftContract.connect(addr2).mintNFT("ipfs://token-1", 1000);
            const salePrice = ethers.parseEther("1");

            const [receiver0, amount0] = await nftContract.royaltyInfo(0, salePrice);
            expect(receiver0).to.equal(addr1.address);
            expect(amount0).to.equal(ethers.parseEther("0.05"));

            const [receiver1, amount1] = await nftContract.royaltyInfo(1, salePrice);
            expect(receiver1).to.equal(addr2.address);
            expect(amount1).to.equal(ethers.parseEther("0.1"));
        });
    });
});
