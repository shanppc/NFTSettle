const hre = require("hardhat");

async function main() {
  // 1. Get the deployer's account 
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying  using account:", deployer.address);

  // Check balance before deploy (helps catch low-funds issues early)

  const ERC20TokenFactory = await hre.ethers.getContractFactory("NFTMarketplace");

  console.log("Deploying... (please wait for confirmation)");
  const marketplace = await ERC20TokenFactory.deploy();

  // 5. Wait for the transaction to be mined
  await marketplace.waitForDeployment();

  // 6. Log useful info
  const deployedAddress = await marketplace.getAddress();
  console.log("✅ deployed to:", deployedAddress);


  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting 30 seconds before verifying (give the block explorers time to index)...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("Verifying contract on explorer...");
    await hre.run("verify:verify", {
      address: deployedAddress,
    });
  }
}

// Standard error handling + exit
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });