import { ethers } from "ethers";
import { NFTMarketplaceABI } from "./NFTMarketplaceABI.js";
import { ERC721ABI } from "./ERC721ABI.js";
import {
  MARKETPLACE_ADDRESS,
  DEPLOYMENT_BLOCK,
  SEPOLIA_NETWORK_PARAMS,
  SEPOLIA_PUBLIC_RPC,
} from "./constants.js";

// ─── Custom error human-readable map ───────────────────────────────────────
const CUSTOM_ERRORS = {
  InvalidPrice: "Price must be greater than 0.",
  NotActive: "This NFT is not actively listed.",
  InvalidAmount: "Payment amount is incorrect. Send the exact listing price.",
  AlreadyListed: "This NFT is already listed for sale.",
  TransferFailed: "ETH transfer failed. Please try again.",
  AlreadyOffered: "You already have an active offer on this NFT. Cancel it first.",
  OfferNotAvailable: "No active offer found from this address.",
  NftNotAvailable: "NFT is not held by the marketplace contract.",
  invalidDuration: "Auction duration must be greater than 0.",
  AlreadyAuctioned: "This NFT already has an active auction.",
  AuctionNotexist: "No auction exists for this NFT.",
  LowBid: "Bid too low — must exceed starting price and current highest bid.",
  UnAuthorized: "Not authorized. Make sure you own this NFT and are not bidding on your own auction.",
  AuctionClosed: "This auction has already ended.",
  NotEnded: "Auction has not ended yet. Wait for the time to expire.",
};

// ─── Formatters ─────────────────────────────────────────────────────────────
export function shortAddress(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "None";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatEth(wei, decimals = 6) {
  if (wei === undefined || wei === null || wei === 0n || wei === 0) return "0";
  try {
    const etherStr = ethers.formatEther(wei);
    const n = parseFloat(etherStr);
    if (n === 0) return "0";
    if (n < 0.0001) {
      // Preserve small testnet values up to 6 decimals, trim trailing zeros
      return etherStr.slice(0, 10).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    }
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  } catch {
    return "0";
  }
}

/**
 * Safely parse an ETH string to BigInt Wei.
 * Handles empty strings, commas, and very small decimals.
 */
export function parseEthInput(value) {
  if (!value || value.toString().trim() === "") return 0n;
  const cleaned = value.toString().replace(",", ".").trim();
  if (isNaN(Number(cleaned)) || Number(cleaned) <= 0) return 0n;
  try {
    return ethers.parseEther(cleaned);
  } catch {
    return 0n;
  }
}

/**
 * Parse contract errors into user-friendly messages.
 */
export function parseContractError(error) {
  if (!error) return "An unknown error occurred.";
  if (
    error.code === "ACTION_REJECTED" ||
    error.code === 4001 ||
    error.message?.includes("user rejected")
  ) {
    return "Transaction was cancelled by user.";
  }
  if (
    error.code === "INSUFFICIENT_FUNDS" ||
    error.message?.includes("insufficient funds")
  ) {
    return "Insufficient ETH balance to cover price + gas fees.";
  }
  for (const [name, msg] of Object.entries(CUSTOM_ERRORS)) {
    if (
      error.message?.includes(name) ||
      error.info?.error?.message?.includes(name)
    ) {
      return msg;
    }
  }
  if (error.reason) return error.reason;
  if (error.shortMessage) return error.shortMessage;
  return error.message?.slice(0, 180) || "Transaction failed.";
}

// ─── Contract helpers ────────────────────────────────────────────────────────
export function getReadProvider() {
  return new ethers.JsonRpcProvider(SEPOLIA_PUBLIC_RPC);
}

export function getMarketplaceContract(providerOrSigner) {
  return new ethers.Contract(MARKETPLACE_ADDRESS, NFTMarketplaceABI, providerOrSigner);
}

export function getNFTContract(nftAddress, providerOrSigner) {
  return new ethers.Contract(nftAddress, ERC721ABI, providerOrSigner);
}

// ─── Switch to Sepolia ───────────────────────────────────────────────────────
export async function requestSepoliaSwitch() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask.");
  }
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_NETWORK_PARAMS.chainId }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SEPOLIA_NETWORK_PARAMS],
      });
    } else {
      throw switchError;
    }
  }
}

// ─── On-chain data loaders ───────────────────────────────────────────────────

/**
 * Load all active listings by:
 * 1. Getting all ListingCreated events from deployment block
 * 2. Verifying each against contract.listings(nft, tokenId) to confirm still active
 * Returns array of listing objects.
 */
export async function fetchAllActiveListings() {
  const provider = getReadProvider();
  const market = getMarketplaceContract(provider);

  const events = await market.queryFilter(
    market.filters.ListingCreated(),
    DEPLOYMENT_BLOCK,
    "latest"
  );

  // Deduplicate: keep only the latest event per (nft, tokenId) pair
  const seen = new Map();
  for (const e of events) {
    const key = `${e.args[1].toLowerCase()}-${e.args[2].toString()}`;
    seen.set(key, e);
  }

  const results = [];
  for (const [, e] of seen) {
    const [seller, nft, tokenId, price] = e.args;
    try {
      const listing = await market.listings(nft, tokenId);
      const livePrice = listing.price ?? listing[1];
      const liveSeller = listing.seller ?? listing[0];
      if (livePrice > 0n && liveSeller !== ethers.ZeroAddress) {
        results.push({
          nftAddress: nft,
          tokenId: tokenId.toString(),
          seller: liveSeller,
          price: livePrice,
          formattedPrice: formatEth(livePrice),
        });
      }
    } catch {
      // listing gone or error — skip
    }
  }
  return results;
}

/**
 * Load all active auctions by:
 * 1. Getting all AuctionCreated events from deployment block
 * 2. Verifying each against contract.auctions(nft, tokenId)
 * Returns array of auction objects.
 */
export async function fetchAllActiveAuctions() {
  const provider = getReadProvider();
  const market = getMarketplaceContract(provider);

  const events = await market.queryFilter(
    market.filters.AuctionCreated(),
    DEPLOYMENT_BLOCK,
    "latest"
  );

  const seen = new Map();
  for (const e of events) {
    const key = `${e.args[1].toLowerCase()}-${e.args[2].toString()}`;
    seen.set(key, e);
  }

  const results = [];
  for (const [, e] of seen) {
    const [seller, nft, tokenId] = e.args;
    try {
      const a = await market.auctions(nft, tokenId);
      const endTime = a.endTime ?? a[0];
      const liveSeller = a.seller ?? a[1];
      const highestBidder = a.highestBidder ?? a[2];
      const startingPrice = a.startingPrice ?? a[3];
      const highestBid = a.highestBid ?? a[4];

      if (startingPrice > 0n && liveSeller !== ethers.ZeroAddress) {
        results.push({
          nftAddress: nft,
          tokenId: tokenId.toString(),
          seller: liveSeller,
          highestBidder,
          startingPrice,
          highestBid,
          endTime: Number(endTime),
          formattedStartingPrice: formatEth(startingPrice),
          formattedHighestBid: formatEth(highestBid),
        });
      }
    } catch {
      // auction gone — skip
    }
  }
  return results;
}

/**
 * Fetch all active offers for a specific listing.
 * Queries OfferCreated events for (any buyer, nft) then verifies via contract.offers.
 * Returns array of { buyer, amount, formattedAmount }
 */
export async function fetchActiveOffersForListing(nftAddress, tokenId) {
  const provider = getReadProvider();
  const market = getMarketplaceContract(provider);

  // OfferCreated: indexed = buyer, nft. tokenId is NOT indexed.
  const events = await market.queryFilter(
    market.filters.OfferCreated(null, nftAddress),
    DEPLOYMENT_BLOCK,
    "latest"
  );

  const buyersSeen = new Set();
  const results = [];

  for (const e of events) {
    const [buyer, nft, evTokenId] = e.args;
    if (evTokenId.toString() !== tokenId.toString()) continue;
    if (buyersSeen.has(buyer.toLowerCase())) continue;
    buyersSeen.add(buyer.toLowerCase());

    try {
      const liveAmt = await market.offers(nft, evTokenId, buyer);
      if (liveAmt > 0n) {
        results.push({
          buyer,
          amount: liveAmt,
          formattedAmount: formatEth(liveAmt),
        });
      }
    } catch {
      // offer gone
    }
  }

  return results;
}
