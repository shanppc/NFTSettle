"use client";

import React, { useState, useCallback } from "react";
import { ExternalLink, Tag, X, RefreshCw, Loader2, Package, Handshake, Plus, Search } from "lucide-react";
import { shortAddress, fetchActiveOffersForListing, getMarketplaceContract, parseContractError } from "../lib/web3.js";
import { SEPOLIA_EXPLORER_URL } from "../lib/constants.js";
import {
  BuyModal, MakeOfferModal, OffersModal,
} from "./ActionModals.jsx";
import TransactionToast from "./TransactionToast.jsx";

export function ListingsSection({
  listings,
  loading,
  userAddress,
  signer,
  onOpenListModal,
  onCancelListing,
  onRefresh,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [txState, setTxState] = useState(null);

  // Modal states
  const [buyTarget, setBuyTarget] = useState(null);
  const [offerTarget, setOfferTarget] = useState(null);
  const [offersTarget, setOffersTarget] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  const openOffersModal = useCallback(async (listing) => {
    setOffersTarget(listing);
    setOffers([]);
    setLoadingOffers(true);
    try {
      const result = await fetchActiveOffersForListing(listing.nftAddress, listing.tokenId);
      setOffers(result);
    } catch (err) {
      console.error("Error loading offers:", err);
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  const handleCancelListing = async (listing) => {
    try {
      setTxState({ status: "pending", message: `Cancelling listing for token #${listing.tokenId}…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.cancelListing(listing.nftAddress, listing.tokenId);
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Listing for token #${listing.tokenId} cancelled.`, txHash: tx.hash });
      onCancelListing(listing);
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    }
  };

  const filteredListings = listings.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.tokenId.toString().includes(term) ||
      item.nftAddress.toLowerCase().includes(term) ||
      item.seller.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Loading listings from Sepolia blockchain…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {txState && (
        <TransactionToast state={txState} onClose={() => setTxState(null)} />
      )}

      {/* Top Bar: Search & Action */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Token ID or Address…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onRefresh}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition flex items-center gap-1.5"
            title="Refresh listings from blockchain"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {onOpenListModal && (
            <button
              type="button"
              onClick={onOpenListModal}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>List NFT for Sale</span>
            </button>
          )}
        </div>
      </div>

      {filteredListings.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
            <Package className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-white mb-1">No Active Listings</h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-4">
            There are currently no active listings. List any NFT you own for sale!
          </p>
          {onOpenListModal && (
            <button
              onClick={onOpenListModal}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>List NFT Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((listing) => {
            const isOwner = userAddress && listing.seller.toLowerCase() === userAddress.toLowerCase();
            return (
              <div
                key={`${listing.nftAddress}-${listing.tokenId}`}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 shadow-lg transition-all duration-300 hover:shadow-indigo-500/5 flex flex-col justify-between gap-4"
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-indigo-400" />
                        <span className="font-bold text-white text-base">Token #{listing.tokenId}</span>
                        {isOwner && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">You</span>
                        )}
                      </div>
                      <a
                        href={`${SEPOLIA_EXPLORER_URL}/address/${listing.nftAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-zinc-500 text-xs font-mono hover:text-zinc-300 transition mt-1"
                      >
                        {shortAddress(listing.nftAddress)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-400 block">Price</span>
                      <span className="text-indigo-400 font-extrabold text-lg">{listing.formattedPrice}</span>
                      <span className="text-zinc-400 text-xs ml-1">ETH</span>
                    </div>
                  </div>

                  {/* Seller info */}
                  <div className="flex items-center justify-between text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800/80">
                    <span>Seller:</span>
                    <a
                      href={`${SEPOLIA_EXPLORER_URL}/address/${listing.seller}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-zinc-300 hover:text-indigo-400 flex items-center gap-1"
                    >
                      {shortAddress(listing.seller)}
                      {isOwner && <span className="text-[10px] text-indigo-400">(You)</span>}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-zinc-800">
                  {isOwner ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openOffersModal(listing)}
                        className="flex-1 py-2 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition flex items-center justify-center gap-1.5"
                      >
                        <Handshake className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Offers</span>
                      </button>
                      <button
                        onClick={() => handleCancelListing(listing)}
                        className="flex-1 py-2 text-xs font-semibold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBuyTarget(listing)}
                        disabled={!userAddress}
                        className="flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-40 shadow-md shadow-indigo-600/20 active:scale-95"
                      >
                        Buy Now
                      </button>
                      <button
                        onClick={() => setOfferTarget(listing)}
                        disabled={!userAddress}
                        className="flex-1 py-2 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <Handshake className="w-3.5 h-3.5 text-purple-400" />
                        <span>Make Offer</span>
                      </button>
                    </div>
                  )}
                  {!userAddress && (
                    <p className="text-center text-[10px] text-zinc-600 mt-2">Connect wallet to trade</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <BuyModal
        isOpen={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        listing={buyTarget}
        signer={signer}
        onTxSuccess={(l) => {
          onCancelListing(l);
          setBuyTarget(null);
        }}
        setTxState={setTxState}
      />
      <MakeOfferModal
        isOpen={!!offerTarget}
        onClose={() => setOfferTarget(null)}
        listing={offerTarget}
        signer={signer}
        onTxSuccess={() => setOfferTarget(null)}
        setTxState={setTxState}
      />
      <OffersModal
        isOpen={!!offersTarget}
        onClose={() => setOffersTarget(null)}
        listing={offersTarget}
        offers={offers}
        loadingOffers={loadingOffers}
        signer={signer}
        userAddress={userAddress}
        onTxSuccess={({ action, listing }) => {
          if (action === "accepted") onCancelListing(listing);
          setOffersTarget(null);
        }}
        setTxState={setTxState}
      />
    </div>
  );
}

export default ListingsSection;
