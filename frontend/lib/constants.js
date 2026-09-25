export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

// Real deployed NFTMarketplace contract on Sepolia
export const MARKETPLACE_ADDRESS = "0xb049fF7cD8301A0fDa5CfF3B8621aa7F8306d4f3";

// Contract deployment block on Sepolia for event filtering
export const DEPLOYMENT_BLOCK = 11742838;

// Public Sepolia RPC URL for read-only queries even when wallet is not connected
export const SEPOLIA_PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const SEPOLIA_NETWORK_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: "Sepolia Test Network",
  nativeCurrency: {
    name: "Sepolia ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
  ],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
