const hre = require("hardhat");

async function main() {
    console.log("Deploying contracts to", hre.network.name, "...\n");

    // Deploy NFTContract
    const NFTContract = await hre.ethers.getContractFactory("NFTContract");
    const nftContract = await NFTContract.deploy();
    await nftContract.waitForDeployment();
    const nftAddress = await nftContract.getAddress();
    console.log("✅ NFTContract deployed to:", nftAddress);

    // Deploy Marketplace
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    console.log("✅ Marketplace deployed to:", marketplaceAddress);

    console.log("\n── Deployment Summary ──");
    console.log("NFTContract:", nftAddress);
    console.log("Marketplace:", marketplaceAddress);
    console.log("\nUpdate frontend/src/config/contracts.ts with these addresses.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
