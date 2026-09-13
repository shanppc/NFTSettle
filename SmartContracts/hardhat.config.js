require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { vars } = require("hardhat/config");

module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      evmVersion: "cancun",
    },
  },

networks: {
  sepolia: {
    url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 11155111,
    accounts: [vars.get("PRIVATE_KEY")],
  },
  base: {
    url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 8453,
    accounts: [vars.get("PRIVATE_KEY")],
  },
},

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
    },
  },
};