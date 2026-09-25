"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../../context/Web3Context.jsx";
import { Navbar } from "../../components/Navbar.jsx";
import { ListingsSection } from "../../components/ListingsSection.jsx";
import { AuctionsSection } from "../../components/AuctionsSection.jsx";
import { TransactionToast } from "../../components/TransactionToast.jsx";
import {
  ListNFTModal,
  CreateAuctionModal,
  WithdrawModal,
} from "../../components/ActionModals.jsx";
import {
  Tag,
  Gavel,
  User,
  ShieldCheck,
  Coins,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  fetchAllActiveListings,
  fetchAllActiveAuctions,
  formatEth,
} from "../../lib/web3.js";

export default function Home() {
  const {
    account,
    signer,
    pendingWithdrawal,
    refreshUserData,
  } = useWeb3();

  // Active Tab: "listings" | "auctions" | "my-activity"
  const [activeTab, setActiveTab] = useState("listings");

  // On-chain state
  const [listings, setListings] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingAuctions, setLoadingAuctions] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [isAuctionModalOpen, setIsAuctionModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  // Toast feedback state
  const [txState, setTxState] = useState(null);

  // Load active listings directly from Sepolia on-chain events
  const loadListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const liveListings = await fetchAllActiveListings();
      setListings(liveListings);
    } catch (err) {
      console.error("Error loading listings from on-chain:", err);
    } finally {
      setLoadingListings(false);
    }
  }, []);

  // Load active auctions directly from Sepolia on-chain events
  const loadAuctions = useCallback(async () => {
    setLoadingAuctions(true);
    try {
      const liveAuctions = await fetchAllActiveAuctions();
      setAuctions(liveAuctions);
    } catch (err) {
      console.error("Error loading auctions from on-chain:", err);
    } finally {
      setLoadingAuctions(false);
    }
  }, []);

  // Sync both on-chain datasets
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadListings(), loadAuctions()]);
    if (account) {
      await refreshUserData();
    }
    setIsRefreshing(false);
  }, [loadListings, loadAuctions, account, refreshUserData]);

  // Initial load on mount
  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      try {
        const [liveListings, liveAuctions] = await Promise.all([
          fetchAllActiveListings(),
          fetchAllActiveAuctions(),
        ]);
        if (isMounted) {
          setListings(liveListings);
          setAuctions(liveAuctions);
          setLoadingListings(false);
          setLoadingAuctions(false);
        }
      } catch (err) {
        console.error("Error loading initial marketplace data:", err);
        if (isMounted) {
          setLoadingListings(false);
          setLoadingAuctions(false);
        }
      }
    }
    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle listing created
  const handleListingCreated = (newListing) => {
    setListings((prev) => {
      const filtered = prev.filter(
        (x) =>
          !(
            x.nftAddress.toLowerCase() === newListing.nftAddress.toLowerCase() &&
            x.tokenId.toString() === newListing.tokenId.toString()
          )
      );
      return [newListing, ...filtered];
    });
    setActiveTab("listings");
    if (account) refreshUserData();
  };

  // Handle listing cancelled or bought
  const handleRemoveListing = (itemToRemove) => {
    setListings((prev) =>
      prev.filter(
        (x) =>
          !(
            x.nftAddress.toLowerCase() === itemToRemove.nftAddress.toLowerCase() &&
            x.tokenId.toString() === itemToRemove.tokenId.toString()
          )
      )
    );
    if (account) refreshUserData();
  };

  // Handle auction created
  const handleAuctionCreated = (newAuction) => {
    setAuctions((prev) => {
      const filtered = prev.filter(
        (x) =>
          !(
            x.nftAddress.toLowerCase() === newAuction.nftAddress.toLowerCase() &&
            x.tokenId.toString() === newAuction.tokenId.toString()
          )
      );
      return [newAuction, ...filtered];
    });
    setActiveTab("auctions");
    if (account) refreshUserData();
  };

  // Handle auction updated (new bid)
  const handleAuctionUpdate = (updatedAuction) => {
    setAuctions((prev) =>
      prev.map((a) =>
        a.nftAddress.toLowerCase() === updatedAuction.nftAddress.toLowerCase() &&
        a.tokenId.toString() === updatedAuction.tokenId.toString()
          ? updatedAuction
          : a
      )
    );
    if (account) refreshUserData();
  };

  // Handle auction ended
  const handleAuctionEnded = (endedAuction) => {
    setAuctions((prev) =>
      prev.filter(
        (x) =>
          !(
            x.nftAddress.toLowerCase() === endedAuction.nftAddress.toLowerCase() &&
            x.tokenId.toString() === endedAuction.tokenId.toString()
          )
      )
    );
    if (account) refreshUserData();
  };

  // Filter for user activity
  const myListings = listings.filter(
    (item) => account && item.seller.toLowerCase() === account.toLowerCase()
  );
  const myAuctions = auctions.filter(
    (item) => account && item.seller.toLowerCase() === account.toLowerCase()
  );

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Navbar */}
      <Navbar onOpenWithdrawModal={() => setIsWithdrawModalOpen(true)} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Banner */}
        <div className="relative rounded-3xl overflow-hidden border border-zinc-800 bg-gradient-to-r from-zinc-900 via-indigo-950/30 to-zinc-900 p-6 sm:p-8 shadow-2xl">
          <div className="max-w-2xl space-y-3">
            <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Sepolia Marketplace
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Trade & Settle NFTs on Sepolia
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Buy, list, make offers, and participate in live English auctions with automated escrow,
              outbid refunds, and low 2.5% protocol fees.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setIsListModalOpen(true)}
                disabled={!signer}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition flex items-center gap-2 active:scale-95 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>List NFT for Sale</span>
              </button>
              <button
                onClick={() => setIsAuctionModalOpen(true)}
                disabled={!signer}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs shadow-lg shadow-amber-500/25 transition flex items-center gap-2 active:scale-95 disabled:opacity-40"
              >
                <Gavel className="w-4 h-4" />
                <span>Create Auction</span>
              </button>
            </div>
          </div>

          {/* Quick sync button */}
          <div className="absolute top-6 right-6">
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Refresh all active listings and auctions from Sepolia blockchain"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sync Blockchain</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-3">
          <button
            onClick={() => setActiveTab("listings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "listings"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Active Listings</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "listings" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {listings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("auctions")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "auctions"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/25"
                : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800"
            }`}
          >
            <Gavel className="w-3.5 h-3.5" />
            <span>Live Auctions</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "auctions" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {auctions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("my-activity")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "my-activity"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/25"
                : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>My Items</span>
            {account && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === "my-activity" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {myListings.length + myAuctions.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "listings" && (
          <ListingsSection
            listings={listings}
            loading={loadingListings}
            userAddress={account}
            signer={signer}
            onOpenListModal={() => setIsListModalOpen(true)}
            onCancelListing={handleRemoveListing}
            onRefresh={loadListings}
          />
        )}

        {activeTab === "auctions" && (
          <AuctionsSection
            auctions={auctions}
            loading={loadingAuctions}
            userAddress={account}
            signer={signer}
            onOpenCreateAuctionModal={() => setIsAuctionModalOpen(true)}
            onAuctionUpdate={handleAuctionUpdate}
            onEndAuctionSuccess={handleAuctionEnded}
            onRefresh={loadAuctions}
          />
        )}

        {activeTab === "my-activity" && (
          <div className="space-y-6">
            {!account ? (
              <div className="py-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40">
                <User className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
                <h4 className="text-base font-bold text-white mb-1">Wallet Not Connected</h4>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Connect your MetaMask or Web3 wallet to manage your listed items, auctions, and outbid refunds.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Outbid Refund Card */}
                {pendingWithdrawal > 0n && (
                  <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <Coins className="w-5 h-5 text-amber-400" />
                        You have Outbid Auction Funds to Claim!
                      </h4>
                      <p className="text-xs text-zinc-300 mt-1">
                        Another bidder outbid your previous bid. The contract holds{" "}
                        <strong className="text-amber-300">{formatEth(pendingWithdrawal)} ETH</strong> ready for
                        withdrawal.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsWithdrawModalOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition whitespace-nowrap active:scale-95"
                    >
                      Withdraw {formatEth(pendingWithdrawal)} ETH
                    </button>
                  </div>
                )}

                {/* My Active Listings */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">
                    My Fixed-Price Listings ({myListings.length})
                  </h3>
                  {myListings.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">You have no active listings at this time.</p>
                  ) : (
                    <ListingsSection
                      listings={myListings}
                      loading={false}
                      userAddress={account}
                      signer={signer}
                      onOpenListModal={() => setIsListModalOpen(true)}
                      onCancelListing={handleRemoveListing}
                      onRefresh={loadListings}
                    />
                  )}
                </div>

                {/* My Auctions */}
                <div className="border-t border-zinc-800 pt-6">
                  <h3 className="text-lg font-bold text-white mb-4">
                    My Active Auctions ({myAuctions.length})
                  </h3>
                  {myAuctions.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">You have no active auctions at this time.</p>
                  ) : (
                    <AuctionsSection
                      auctions={myAuctions}
                      loading={false}
                      userAddress={account}
                      signer={signer}
                      onOpenCreateAuctionModal={() => setIsAuctionModalOpen(true)}
                      onAuctionUpdate={handleAuctionUpdate}
                      onEndAuctionSuccess={handleAuctionEnded}
                      onRefresh={loadAuctions}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-6 mt-12 bg-zinc-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 NFT Settle. Sepolia NFT Marketplace.</p>
          <p className="font-mono text-zinc-500">Contract: 0xb049...4f3</p>
        </div>
      </footer>

      {/* Creation & Global Modals */}
      <ListNFTModal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        signer={signer}
        onTxSuccess={handleListingCreated}
        setTxState={setTxState}
      />

      <CreateAuctionModal
        isOpen={isAuctionModalOpen}
        onClose={() => setIsAuctionModalOpen(false)}
        signer={signer}
        onTxSuccess={handleAuctionCreated}
        setTxState={setTxState}
      />

      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        pendingWithdrawal={pendingWithdrawal}
        signer={signer}
        onTxSuccess={() => {
          if (account) refreshUserData();
        }}
        setTxState={setTxState}
      />

      {/* Global Transaction Toast */}
      {txState && (
        <TransactionToast
          state={txState}
          onClose={() => setTxState(null)}
        />
      )}
    </div>
  );
}
