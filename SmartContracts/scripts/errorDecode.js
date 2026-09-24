const { ethers } = require("hardhat");

async function main() {
    const contractName = "NFTMarketplace"; 
    
    console.log(`Fetching ABI for: ${contractName}...`);
    const contract = await ethers.getContractFactory(contractName);
    const iface = contract.interface;

    // The raw error data you got
    const errorData = "0xa05e34b0"; 

    try {
        const decodedError = iface.parseError(errorData);
        console.log("\n✅ Error Decoded Successfully!");
        console.log("---------------------------------");
        console.log("Error Name:", decodedError.name);
        console.log("Error Args:", decodedError.args);
        console.log("---------------------------------\n");
    } catch (e) {
        console.log("\n❌ Error selector '0xa05e34b0' not found in this contract's ABI.");
        console.log("If this contract calls another external contract, the error might be bubbling up from there.");
    }
}

// Hardhat recommended pattern to run async scripts and handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });