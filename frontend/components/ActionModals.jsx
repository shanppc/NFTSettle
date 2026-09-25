"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  X, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Tag, Gavel, Coins,
} from "lucide-react";
import {
  getMarketplaceContract, getNFTContract, parseEthInput,
  formatEth, parseContractError, shortAddress,
} from "../lib/web3.js";
import { MARKETPLACE_ADDRESS, SEPOLIA_EXPLORER_URL } from "../lib/constants.js";

// ═══════════════════════════════════════════════════════
// SHARED: Two-step approval checker
// ═══════════════════════════════════════════════════════
function useApprovalCheck(nftAddress, tokenId, signer) {
  const [isApproved, setIsApproved] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    async function check() {
      if (!ethers.isAddress(nftAddress) || tokenId === "" || !signer) {
        setIsApproved(false);
        return;
      }
      setChecking(true);
      try {
        const userAddr = await signer.getAddress();
        const nft = getNFTContract(nftAddress, signer);
        const all = await nft.isApprovedForAll(userAddr, MARKETPLACE_ADDRESS);
        if (all) { setIsApproved(true); return; }
        const single = await nft.getApproved(tokenId);
        setIsApproved(single.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase());
      } catch {
        setIsApproved(false);
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [nftAddress, tokenId, signer]);

  return { isApproved, setIsApproved, checking };
}

// ═══════════════════════════════════════════════════════
// 1. LIST NFT MODAL
// ═══════════════════════════════════════════════════════
export function ListNFTModal({ isOpen, onClose, signer, onTxSuccess, setTxState }) {
  const [nftAddress, setNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [loading, setLoading] = useState(false);
  const { isApproved, setIsApproved, checking } = useApprovalCheck(nftAddress, tokenId, signer);

  if (!isOpen) return null;

  const handleApprove = async () => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: "Approving marketplace to transfer your NFT…" });
      const nft = getNFTContract(nftAddress, signer);
      const tx = await nft.approve(MARKETPLACE_ADDRESS, tokenId);
      setTxState({ status: "pending", message: "Waiting for approval confirmation…", txHash: tx.hash });
      await tx.wait();
      setIsApproved(true);
      setTxState({ status: "success", message: "NFT approved! Now set your price and confirm listing.", txHash: tx.hash });
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleList = async (e) => {
    e.preventDefault();
    const priceWei = parseEthInput(priceEth);
    if (priceWei === 0n) {
      setTxState({ status: "error", message: "Price must be greater than 0 ETH." });
      return;
    }
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Listing token #${tokenId} for ${priceEth} ETH…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.listNFT(nftAddress, tokenId, priceWei);
      setTxState({ status: "pending", message: "Transaction sent to Sepolia…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Token #${tokenId} listed for ${priceEth} ETH!`, txHash: tx.hash });
      onTxSuccess({ nftAddress, tokenId, seller: await signer.getAddress(), price: priceWei, formattedPrice: priceEth });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader icon={<Tag className="w-5 h-5" />} color="indigo" title="List NFT for Sale" desc="Fixed price — buyer pays your asking price" />
      <form onSubmit={handleList} className="space-y-4">
        <Field label="NFT Contract Address">
          <input type="text" placeholder="0x…" value={nftAddress}
            onChange={e => setNftAddress(e.target.value.trim())}
            required className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Token ID">
            <input type="number" min="0" placeholder="0" value={tokenId}
              onChange={e => setTokenId(e.target.value.trim())}
              required className={inputCls} />
          </Field>
          <Field label="Price (ETH)">
            <input type="number" step="any" min="0.000001" placeholder="0.05"
              value={priceEth} onChange={e => setPriceEth(e.target.value)}
              required className={inputCls} />
          </Field>
        </div>

        <ApprovalStatus checking={checking} isApproved={isApproved} show={ethers.isAddress(nftAddress) && tokenId !== ""} />

        {!isApproved ? (
          <ActionBtn onClick={handleApprove} loading={loading}
            disabled={!ethers.isAddress(nftAddress) || tokenId === ""}
            color="amber" icon={<ShieldCheck className="w-4 h-4" />}
            label="Step 1 — Approve Marketplace" />
        ) : (
          <ActionBtn type="submit" loading={loading} disabled={!priceEth}
            color="indigo" icon={<Tag className="w-4 h-4" />}
            label={`Step 2 — List for ${priceEth || "?"} ETH`} />
        )}
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 2. CREATE AUCTION MODAL
// ═══════════════════════════════════════════════════════
export function CreateAuctionModal({ isOpen, onClose, signer, onTxSuccess, setTxState }) {
  const [nftAddress, setNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [startPriceEth, setStartPriceEth] = useState("");
  const [durationVal, setDurationVal] = useState("1");
  const [durationUnit, setDurationUnit] = useState("3600");
  const [loading, setLoading] = useState(false);
  const { isApproved, setIsApproved, checking } = useApprovalCheck(nftAddress, tokenId, signer);

  if (!isOpen) return null;

  const handleApprove = async () => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: "Approving marketplace to transfer your NFT…" });
      const nft = getNFTContract(nftAddress, signer);
      const tx = await nft.approve(MARKETPLACE_ADDRESS, tokenId);
      setTxState({ status: "pending", message: "Waiting for approval…", txHash: tx.hash });
      await tx.wait();
      setIsApproved(true);
      setTxState({ status: "success", message: "Approved! Set your starting price and duration.", txHash: tx.hash });
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const startWei = parseEthInput(startPriceEth);
    if (startWei === 0n) {
      setTxState({ status: "error", message: "Starting price must be greater than 0 ETH." });
      return;
    }
    const durationSec = BigInt(Math.floor(Number(durationVal) * Number(durationUnit)));
    if (durationSec === 0n) {
      setTxState({ status: "error", message: "Duration must be greater than 0." });
      return;
    }
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Creating auction for token #${tokenId}…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.createAuction(nftAddress, tokenId, startWei, durationSec);
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Auction live for token #${tokenId}!`, txHash: tx.hash });
      const endTime = Math.floor(Date.now() / 1000) + Number(durationSec);
      onTxSuccess({
        nftAddress, tokenId,
        seller: await signer.getAddress(),
        startingPrice: startWei,
        highestBid: 0n,
        highestBidder: ethers.ZeroAddress,
        formattedStartingPrice: startPriceEth,
        formattedHighestBid: "0",
        endTime,
      });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader icon={<Gavel className="w-5 h-5" />} color="amber" title="Create Auction" desc="English auction — highest bidder wins" />
      <form onSubmit={handleCreate} className="space-y-4">
        <Field label="NFT Contract Address">
          <input type="text" placeholder="0x…" value={nftAddress}
            onChange={e => setNftAddress(e.target.value.trim())}
            required className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Token ID">
            <input type="number" min="0" placeholder="0" value={tokenId}
              onChange={e => setTokenId(e.target.value.trim())}
              required className={inputCls} />
          </Field>
          <Field label="Starting Price (ETH)">
            <input type="number" step="any" min="0.000001" placeholder="0.01"
              value={startPriceEth} onChange={e => setStartPriceEth(e.target.value)}
              required className={inputCls} />
          </Field>
        </div>
        <Field label="Duration">
          <div className="flex gap-2">
            <input type="number" min="1" value={durationVal}
              onChange={e => setDurationVal(e.target.value)}
              required className={`${inputCls} w-2/3`} />
            <select value={durationUnit} onChange={e => setDurationUnit(e.target.value)}
              className={`${inputCls} w-1/3`}>
              <option value="60">Minutes</option>
              <option value="3600">Hours</option>
              <option value="86400">Days</option>
            </select>
          </div>
        </Field>

        <ApprovalStatus checking={checking} isApproved={isApproved} show={ethers.isAddress(nftAddress) && tokenId !== ""} />

        {!isApproved ? (
          <ActionBtn onClick={handleApprove} loading={loading}
            disabled={!ethers.isAddress(nftAddress) || tokenId === ""}
            color="amber" icon={<ShieldCheck className="w-4 h-4" />}
            label="Step 1 — Approve Marketplace" />
        ) : (
          <ActionBtn type="submit" loading={loading} disabled={!startPriceEth}
            color="amber" icon={<Gavel className="w-4 h-4" />}
            label="Step 2 — Start Auction" />
        )}
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 3. BUY MODAL
// ═══════════════════════════════════════════════════════
export function BuyModal({ isOpen, onClose, listing, signer, onTxSuccess, setTxState }) {
  const [loading, setLoading] = useState(false);
  if (!isOpen || !listing) return null;

  const handleBuy = async () => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Purchasing token #${listing.tokenId} for ${listing.formattedPrice} ETH…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.buy(listing.nftAddress, listing.tokenId, { value: listing.price });
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Token #${listing.tokenId} is now yours!`, txHash: tx.hash });
      onTxSuccess(listing);
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} small>
      <h3 className="text-lg font-bold text-white mb-1">Buy NFT</h3>
      <p className="text-xs text-zinc-400 mb-4">Confirm your purchase from the seller.</p>
      <InfoRow label="Token ID" value={`#${listing.tokenId}`} />
      <InfoRow label="Contract" value={<AddressLink addr={listing.nftAddress} />} />
      <InfoRow label="Seller" value={<AddressLink addr={listing.seller} />} />
      <div className="flex justify-between items-center py-2 border-t border-zinc-800 mt-2 mb-4">
        <span className="text-sm text-zinc-300 font-medium">Total Price</span>
        <span className="text-indigo-400 font-extrabold text-lg">{listing.formattedPrice} ETH</span>
      </div>
      <ActionBtn onClick={handleBuy} loading={loading}
        color="indigo" label={`Pay ${listing.formattedPrice} ETH & Buy Now`} />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 4. MAKE OFFER MODAL
// ═══════════════════════════════════════════════════════
export function MakeOfferModal({ isOpen, onClose, listing, signer, onTxSuccess, setTxState }) {
  const [offerEth, setOfferEth] = useState("");
  const [loading, setLoading] = useState(false);
  if (!isOpen || !listing) return null;

  const handleOffer = async (e) => {
    e.preventDefault();
    const offerWei = parseEthInput(offerEth);
    if (offerWei === 0n) {
      setTxState({ status: "error", message: "Offer must be greater than 0 ETH." });
      return;
    }
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Placing offer of ${offerEth} ETH…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.makeOffer(listing.nftAddress, listing.tokenId, { value: offerWei });
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Offer of ${offerEth} ETH placed!`, txHash: tx.hash });
      onTxSuccess({ nftAddress: listing.nftAddress, tokenId: listing.tokenId, buyer: await signer.getAddress(), amount: offerWei, formattedAmount: offerEth });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} small>
      <h3 className="text-lg font-bold text-white mb-1">Make an Offer</h3>
      <p className="text-xs text-zinc-400 mb-4">
        Listing price is <strong className="text-white">{listing.formattedPrice} ETH</strong>.
        Your offer amount is held in escrow until accepted or cancelled.
      </p>
      <form onSubmit={handleOffer} className="space-y-4">
        <Field label="Offer Amount (ETH)">
          <input type="number" step="any" min="0.000001" placeholder="e.g. 0.04"
            value={offerEth} onChange={e => setOfferEth(e.target.value)}
            required className={inputCls} />
        </Field>
        <ActionBtn type="submit" loading={loading} disabled={!offerEth}
          color="purple" label="Deposit & Place Offer" />
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 5. OFFERS MODAL (seller + buyer views)
// ═══════════════════════════════════════════════════════
export function OffersModal({ isOpen, onClose, listing, offers, loadingOffers, signer, userAddress, onTxSuccess, setTxState }) {
  const [loading, setLoading] = useState(false);
  if (!isOpen || !listing) return null;

  const isSeller = userAddress && listing.seller.toLowerCase() === userAddress.toLowerCase();

  const handleAccept = async (buyerAddress, amountWei) => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Accepting offer of ${formatEth(amountWei)} ETH from ${shortAddress(buyerAddress)}…` });
      const market = getMarketplaceContract(signer);
      // Note: contract spells it "accpectOffer"
      const tx = await market.accpectOffer(listing.nftAddress, listing.tokenId, buyerAddress);
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `Offer accepted! NFT sent to ${shortAddress(buyerAddress)}.`, txHash: tx.hash });
      onTxSuccess({ action: "accepted", listing });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: "Cancelling offer and refunding ETH…" });
      const market = getMarketplaceContract(signer);
      const tx = await market.cancelOffer(listing.nftAddress, listing.tokenId);
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: "Offer cancelled and ETH refunded to your wallet!" , txHash: tx.hash });
      onTxSuccess({ action: "cancelled", buyerAddress: userAddress, listing });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-white mb-1">Active Offers</h3>
      <p className="text-xs text-zinc-400 mb-4">
        Token #{listing.tokenId} · {shortAddress(listing.nftAddress)}
        {isSeller && <span className="ml-2 text-indigo-400 font-semibold">(You are the seller)</span>}
      </p>

      {loadingOffers ? (
        <div className="py-8 flex items-center justify-center gap-2 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading offers from blockchain…
        </div>
      ) : offers.length === 0 ? (
        <div className="py-8 text-center text-zinc-500 text-sm">No active offers for this listing.</div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {offers.map((offer, i) => {
            const isMyOffer = userAddress && offer.buyer.toLowerCase() === userAddress.toLowerCase();
            return (
              <div key={i} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{offer.formattedAmount} ETH</span>
                    {isMyOffer && <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">You</span>}
                  </div>
                  <span className="text-zinc-500 font-mono text-[11px]">{shortAddress(offer.buyer)}</span>
                </div>
                <div>
                  {isSeller && (
                    <button onClick={() => handleAccept(offer.buyer, offer.amount)} disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition disabled:opacity-50">
                      Accept
                    </button>
                  )}
                  {isMyOffer && !isSeller && (
                    <button onClick={handleCancel} disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white font-semibold text-xs border border-rose-500/40 transition disabled:opacity-50">
                      Cancel & Refund
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 6. PLACE BID MODAL
// ═══════════════════════════════════════════════════════
export function PlaceBidModal({ isOpen, onClose, auction, signer, userAddress, onTxSuccess, setTxState }) {
  const [bidEth, setBidEth] = useState("");
  const [loading, setLoading] = useState(false);
  if (!isOpen || !auction) return null;

  const isSeller = userAddress && auction.seller.toLowerCase() === userAddress.toLowerCase();

  // Min bid: must exceed startingPrice AND highestBid
  const minBid = auction.highestBid > 0n ? auction.highestBid : auction.startingPrice;
  const minBidEth = formatEth(minBid, 6);

  const handleBid = async (e) => {
    e.preventDefault();
    const bidWei = parseEthInput(bidEth);
    if (bidWei === 0n) {
      setTxState({ status: "error", message: "Enter a valid bid amount." });
      return;
    }
    if (bidWei < auction.startingPrice) {
      setTxState({ status: "error", message: `Bid must be at least the starting price: ${auction.formattedStartingPrice} ETH` });
      return;
    }
    if (auction.highestBid > 0n && bidWei <= auction.highestBid) {
      setTxState({ status: "error", message: `Bid must be strictly greater than the current highest bid: ${auction.formattedHighestBid} ETH` });
      return;
    }
    try {
      setLoading(true);
      setTxState({ status: "pending", message: `Placing bid of ${bidEth} ETH…` });
      const market = getMarketplaceContract(signer);
      const tx = await market.placeBid(auction.nftAddress, auction.tokenId, { value: bidWei });
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `You are now the highest bidder at ${bidEth} ETH!`, txHash: tx.hash });
      onTxSuccess({ ...auction, highestBid: bidWei, formattedHighestBid: bidEth, highestBidder: userAddress });
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} small>
      <ModalHeader icon={<Gavel className="w-5 h-5" />} color="amber" title="Place a Bid" desc={`Live auction · Token #${auction.tokenId}`} />

      {isSeller ? (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium text-center">
          ⚠ You created this auction. Sellers cannot bid on their own auction.
        </div>
      ) : (
        <>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 mb-4 text-xs">
            <InfoRow label="Starting Price" value={`${auction.formattedStartingPrice} ETH`} />
            <InfoRow label="Current Highest Bid"
              value={<span className="text-amber-400 font-bold">{auction.highestBid > 0n ? `${auction.formattedHighestBid} ETH` : "No bids yet"}</span>} />
            <InfoRow label="Current Highest Bidder" value={shortAddress(auction.highestBidder)} />
          </div>
          <form onSubmit={handleBid} className="space-y-4">
            <Field label={`Your Bid (ETH) — minimum ${minBidEth} ETH`}>
              <input type="number" step="any" min={minBidEth}
                placeholder={minBidEth} value={bidEth}
                onChange={e => setBidEth(e.target.value)}
                required className={inputCls} />
            </Field>
            <ActionBtn type="submit" loading={loading} disabled={!bidEth}
              color="amber" icon={<Gavel className="w-4 h-4" />} label="Submit Bid" />
          </form>
        </>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// 7. WITHDRAW REFUND MODAL
// ═══════════════════════════════════════════════════════
export function WithdrawModal({ isOpen, onClose, pendingWithdrawal, signer, onTxSuccess, setTxState }) {
  const [loading, setLoading] = useState(false);
  if (!isOpen) return null;

  const handleWithdraw = async () => {
    try {
      setLoading(true);
      setTxState({ status: "pending", message: "Withdrawing outbid auction funds…" });
      const market = getMarketplaceContract(signer);
      const tx = await market.withdrawAuctionEth();
      setTxState({ status: "pending", message: "Transaction sent…", txHash: tx.hash });
      await tx.wait();
      setTxState({ status: "success", message: `${formatEth(pendingWithdrawal)} ETH withdrawn to your wallet!`, txHash: tx.hash });
      onTxSuccess();
      onClose();
    } catch (err) {
      setTxState({ status: "error", message: parseContractError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} small>
      <h3 className="text-lg font-bold text-white mb-2">Claim Outbid Refund</h3>
      <p className="text-xs text-zinc-400 mb-4">
        When someone outbids you in an auction, your ETH is safely held here by the contract until you withdraw it.
      </p>
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center mb-5">
        <span className="text-xs text-zinc-400 block mb-1">Available to Withdraw</span>
        <span className="text-2xl font-extrabold text-amber-400">{formatEth(pendingWithdrawal, 6)} ETH</span>
      </div>
      <ActionBtn onClick={handleWithdraw} loading={loading}
        disabled={pendingWithdrawal === 0n}
        color="amber" icon={<Coins className="w-4 h-4" />}
        label={`Withdraw ${formatEth(pendingWithdrawal, 5)} ETH`} />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// SHARED UI PRIMITIVES
// ═══════════════════════════════════════════════════════
const inputCls = "w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono";

function Modal({ children, onClose, small }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl ${small ? "max-w-sm" : "max-w-md"} w-full p-6 shadow-2xl relative`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon, color, title, desc }) {
  const colors = { indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", amber: "bg-amber-500/10 text-amber-400 border-amber-500/20", purple: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  return (
    <div className="flex items-center gap-2 mb-5">
      <div className={`p-2 rounded-lg border ${colors[color]}`}>{icon}</div>
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs text-zinc-400">{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ApprovalStatus({ checking, isApproved, show }) {
  if (!show) return null;
  return (
    <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between text-xs">
      <span className="text-zinc-400">Marketplace Approval:</span>
      {checking ? (
        <span className="text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking…</span>
      ) : isApproved ? (
        <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Approved ✓</span>
      ) : (
        <span className="text-amber-400 font-semibold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Needs Approval</span>
      )}
    </div>
  );
}

function ActionBtn({ onClick, type = "button", loading, disabled, color, icon, label }) {
  const colors = {
    indigo: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25",
    amber: "bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20",
    purple: "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20",
  };
  return (
    <button type={type} onClick={onClick} disabled={loading || disabled}
      className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 ${colors[color]}`}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-center text-xs py-1">
      <span className="text-zinc-400">{label}:</span>
      <span className="text-zinc-200 font-medium">{value}</span>
    </div>
  );
}

function AddressLink({ addr }) {
  return (
    <a href={`${SEPOLIA_EXPLORER_URL}/address/${addr}`} target="_blank" rel="noopener noreferrer"
      className="font-mono text-zinc-200 hover:text-indigo-400 transition">
      {shortAddress(addr)}
    </a>
  );
}


