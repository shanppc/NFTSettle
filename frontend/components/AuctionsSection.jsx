"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  Gavel,
  Clock,
  ExternalLink,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Trophy,
} from "lucide-react";
import { shortAddress, getMarketplaceContract, parseContractError } from "../lib/web3.js";
import { SEPOLIA_EXPLORER_URL } from "../lib/constants.js";
import { PlaceBidModal } from "./ActionModals.jsx";
import TransactionToast from "./TransactionToast.jsx";

// Countdown timer helper component
function CountdownTimer({ endTime }) {
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    function calculate() {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setTimeLeft({ hours, minutes, seconds, isExpired: false });
    }

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-xs">
        <Clock className="w-3 h-3" /> Ended
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-xs font-mono">
      <Clock className="w-3 h-3" />
      {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:
      {String(timeLeft.seconds).padStart(2, "0")}
    </span>
  );
}

export function AuctionsSection({
  auctions,
  loading,
  userAddress,
  signer,
  onOpenCreateAuctionModal,
  onAuctionUpdate,
  onEndAuctionSuccess,
  onRefresh,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [endingKey, setEndingKey] = useState(null);
  const [bidTarget, setBidTarget] = useState(null);
  const [txState, setTxState] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const updateTime = () => setCurrentTime(Math.floor(Date.now() / 1000));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter auctions
  const filteredAuctions = auctions.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.tokenId.toString().includes(term) ||
      item.nftAddress.toLowerCase().includes(term) ||
      item.seller.toLowerCase().includes(term)
    );
  });

  // End Auction (seller finalizes)
  const handleEndAuction = async (auction) => {
    if (!signer) return;
    const key = `${auction.nftAddress}-${auction.tokenId}`;
    try {
      setEndingKey(key);
      setTxState({
        status: "pending",
        message: `Finalizing auction for token #${auction.tokenId}…`,
      });

      const market = getMarketplaceContract(signer);
      const tx = await market.endAuction(auction.nftAddress, auction.tokenId);

      setTxState({ status: "pending", message: "Transaction sent to Sepolia…", txHash: tx.hash });
      await tx.wait();

      setTxState({
        status: "success",
        message: `Auction for token #${auction.tokenId} settled successfully!`,
        txHash: tx.hash,
      });

      onEndAuctionSuccess(auction);
    } catch (err) {
      console.error("End auction error:", err);
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setEndingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm">Loading auctions from Sepolia blockchain…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {txState && (
        <TransactionToast state={txState} onClose={() => setTxState(null)} />
      )}

      {/* Top Bar: Search & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Token ID or Address…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onRefresh}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition flex items-center gap-1.5"
            title="Refresh auctions from blockchain"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {onOpenCreateAuctionModal && (
            <button
              type="button"
              onClick={onOpenCreateAuctionModal}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Auction</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Auctions */}
      {filteredAuctions.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center mb-3">
            <Gavel className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-white mb-1">No Active Auctions</h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-4">
            There are currently no active auctions on Sepolia. Start one with any NFT you own!
          </p>
          {onOpenCreateAuctionModal && (
            <button
              onClick={onOpenCreateAuctionModal}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-black transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Auction Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAuctions.map((item) => {
            const key = `${item.nftAddress}-${item.tokenId}`;
            const isSeller = userAddress && item.seller.toLowerCase() === userAddress.toLowerCase();
            const isHighestBidder =
              userAddress &&
              item.highestBidder &&
              item.highestBidder.toLowerCase() === userAddress.toLowerCase();

            const isExpired = currentTime > 0 && currentTime >= item.endTime;
            const isEnding = endingKey === key;

            return (
              <div
                key={key}
                className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-amber-500/5 flex flex-col"
              >
                {/* Visual Header */}
                <div className="h-44 bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-900 relative p-4 flex flex-col justify-between border-b border-zinc-800/80">
                  <div className="flex justify-between items-start">
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-bold text-amber-300 backdrop-blur-sm">
                      #{item.tokenId}
                    </span>

                    {/* Timer badge */}
                    <div className="px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 backdrop-blur-sm">
                      <CountdownTimer endTime={item.endTime} />
                    </div>
                  </div>

                  {/* Icon Center */}
                  <div className="text-center my-auto">
                    <div className="text-3xl select-none transform group-hover:scale-110 transition duration-300">
                      ⚡
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
                      {shortAddress(item.nftAddress)}
                    </span>
                  </div>

                  {/* Bidding Summary Bar */}
                  <div className="flex items-center justify-between bg-zinc-950/80 backdrop-blur-md rounded-xl p-2 border border-zinc-800/60">
                    <div>
                      <span className="text-[10px] text-zinc-400 block leading-tight">Starting</span>
                      <span className="text-xs font-semibold text-zinc-200">
                        {item.formattedStartingPrice} ETH
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-zinc-400 block leading-tight">Highest Bid</span>
                      <span className="text-sm font-extrabold text-amber-400">
                        {item.highestBid > 0n ? `${item.formattedHighestBid} ETH` : "No bids"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Details & Actions */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Seller:</span>
                      <a
                        href={`${SEPOLIA_EXPLORER_URL}/address/${item.seller}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-zinc-300 hover:text-amber-400 flex items-center gap-1"
                      >
                        {shortAddress(item.seller)}
                        {isSeller && <span className="text-[10px] text-amber-400">(You)</span>}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-400">Top Bidder:</span>
                      {item.highestBidder && item.highestBidder !== ethers.ZeroAddress ? (
                        <a
                          href={`${SEPOLIA_EXPLORER_URL}/address/${item.highestBidder}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-zinc-300 hover:text-amber-400 flex items-center gap-1"
                        >
                          {shortAddress(item.highestBidder)}
                          {isHighestBidder && <span className="text-[10px] text-emerald-400 font-bold">(You)</span>}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-500">None yet</span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-zinc-800 space-y-2">
                    {!isExpired ? (
                      <div>
                        {!isSeller ? (
                          <button
                            onClick={() => setBidTarget(item)}
                            disabled={!userAddress}
                            className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-40"
                          >
                            <Gavel className="w-3.5 h-3.5" />
                            <span>Place a Bid</span>
                          </button>
                        ) : (
                          <div className="py-2 px-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50 text-center text-xs text-zinc-400 font-medium">
                            Your auction is live
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {isSeller ? (
                          <button
                            onClick={() => handleEndAuction(item)}
                            disabled={isEnding}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                          >
                            {isEnding ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trophy className="w-3.5 h-3.5" />
                            )}
                            <span>End Auction & Settle</span>
                          </button>
                        ) : (
                          <div className="py-2 px-3 rounded-xl bg-zinc-800/40 border border-zinc-800 text-center text-xs text-zinc-500 font-medium">
                            Auction ended. Awaiting seller settlement.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Place Bid Modal */}
      <PlaceBidModal
        isOpen={!!bidTarget}
        onClose={() => setBidTarget(null)}
        auction={bidTarget}
        signer={signer}
        userAddress={userAddress}
        onTxSuccess={(updatedAuction) => {
          if (onAuctionUpdate) onAuctionUpdate(updatedAuction);
          setBidTarget(null);
        }}
        setTxState={setTxState}
      />
    </div>
  );
}

export default AuctionsSection;
