const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const network = hre.network.name;
    console.log("Deploying contracts to", network, "...\n");

    // ── Load existing deployments (to preserve V1 addresses on Sepolia) ──
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentsFile = path.join(deploymentsDir, `${network}.json`);
    let existingDeployments = {};
    if (fs.existsSync(deploymentsFile)) {
        try {
            existingDeployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
        } catch {
            existingDeployments = {};
        }
    }

    // ── Deploy NFTContract ──
    const NFTContract = await hre.ethers.getContractFactory("NFTContract");
    const nftContract = await NFTContract.deploy();
    await nftContract.waitForDeployment();
    const nftAddress = await nftContract.getAddress();
    console.log("NFTContract deployed to:", nftAddress);

    // ── Deploy Marketplace ──
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    console.log("Marketplace deployed to:", marketplaceAddress);

    // ── Deploy AuctionHouse ──
    const AuctionHouse = await hre.ethers.getContractFactory("AuctionHouse");
    const auctionHouse = await AuctionHouse.deploy();
    await auctionHouse.waitForDeployment();
    const auctionHouseAddress = await auctionHouse.getAddress();
    console.log("AuctionHouse deployed to:", auctionHouseAddress);

    // ── Deploy CollectionFactory (deploys Collection implementation internally) ──
    const CollectionFactory = await hre.ethers.getContractFactory("CollectionFactory");
    const collectionFactory = await CollectionFactory.deploy();
    await collectionFactory.waitForDeployment();
    const collectionFactoryAddress = await collectionFactory.getAddress();
    console.log("CollectionFactory deployed to:", collectionFactoryAddress);

    // ── Retrieve the Collection implementation address from the factory ──
    const collectionImplementationAddress = await collectionFactory.collectionImplementation();
    console.log("Collection implementation deployed to:", collectionImplementationAddress);

    // ── Build deployments record ──
    const deploymentRecord = {
        network,
        deployedAt: new Date().toISOString(),
        nftContract: nftAddress,
        marketplace: marketplaceAddress,
        auctionHouse: auctionHouseAddress,
        collectionFactory: collectionFactoryAddress,
        collectionImplementation: collectionImplementationAddress,
    };

    // Preserve old NFTContract address as nftContractV1 on Sepolia (or any network with prior deploy)
    if (existingDeployments.nftContract && existingDeployments.nftContract !== nftAddress) {
        deploymentRecord.nftContractV1 = existingDeployments.nftContract;
        console.log("\nPrevious NFTContract preserved as nftContractV1:", deploymentRecord.nftContractV1);
    }

    // Write deployments file
    fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentRecord, null, 2));
    console.log(`\nDeployment record written to deployments/${network}.json`);

    // ── Summary ──
    console.log("\n── Deployment Summary ──");
    console.log("NFTContract:             ", nftAddress);
    console.log("Marketplace:             ", marketplaceAddress);
    console.log("AuctionHouse:            ", auctionHouseAddress);
    console.log("CollectionFactory:       ", collectionFactoryAddress);
    console.log("Collection (impl):       ", collectionImplementationAddress);

    if (deploymentRecord.nftContractV1) {
        console.log("NFTContract V1 (legacy):", deploymentRecord.nftContractV1);
    }

    // ── Etherscan verification commands (Sepolia only) ──
    if (network === "sepolia") {
        console.log("\n── Etherscan Verification Commands ──");
        console.log(`npx hardhat verify --network sepolia ${nftAddress}`);
        console.log(`npx hardhat verify --network sepolia ${marketplaceAddress}`);
        console.log(`npx hardhat verify --network sepolia ${auctionHouseAddress}`);
        console.log(`npx hardhat verify --network sepolia ${collectionFactoryAddress}`);
        console.log("\nNote: The Collection implementation was deployed by CollectionFactory.");
        console.log("If you need to verify it separately, use:");
        console.log(`npx hardhat verify --network sepolia ${collectionImplementationAddress}`);
    }

    console.log("\nUpdate frontend/.env with these addresses:");
    console.log(`VITE_NFT_CONTRACT_ADDRESS=${nftAddress}`);
    console.log(`VITE_MARKETPLACE_ADDRESS=${marketplaceAddress}`);
    console.log(`VITE_AUCTION_HOUSE_ADDRESS=${auctionHouseAddress}`);
    console.log(`VITE_COLLECTION_FACTORY_ADDRESS=${collectionFactoryAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
