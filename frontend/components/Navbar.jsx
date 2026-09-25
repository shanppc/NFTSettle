"use client";

import React, { useState } from "react";
import { useWeb3 } from "../context/Web3Context.jsx";
import {
  Wallet, AlertTriangle, CheckCircle2, Copy, Check,
  Coins, LogOut, ExternalLink,
} from "lucide-react";
import { shortAddress, formatEth } from "../lib/web3.js";
import { SEPOLIA_EXPLORER_URL, MARKETPLACE_ADDRESS } from "../lib/constants.js";

export function Navbar({ onOpenWithdrawModal }) {
  const {
    account, balance, isSepolia, pendingWithdrawal,
    isConnecting, connectWallet, disconnectWallet, switchToSepolia,
  } = useWeb3();

  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg font-bold text-white text-lg">
            💎
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              NFT Settle
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
              Sepolia
            </span>
          </div>
        </div>

        {/* Contract badge */}
        <div className="hidden md:flex items-center">
          <a
            href={`${SEPOLIA_EXPLORER_URL}/address/${MARKETPLACE_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition font-mono"
          >
            Contract: {shortAddress(MARKETPLACE_ADDRESS)}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Right area */}
        <div className="flex items-center gap-3">
          {/* Outbid refund badge */}
          {pendingWithdrawal > 0n && (
            <button
              onClick={onOpenWithdrawModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition animate-pulse"
            >
              <Coins className="w-3.5 h-3.5" />
              Refund: {formatEth(pendingWithdrawal, 4)} ETH
            </button>
          )}

          {/* Network check */}
          {account && (
            isSepolia ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Sepolia
              </div>
            ) : (
              <button
                onClick={switchToSepolia}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Switch to Sepolia
              </button>
            )
          )}

          {/* Wallet connect / info */}
          {!account ? (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 transition active:scale-95 disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <div className="hidden sm:flex items-center px-2 py-1 text-xs font-medium text-zinc-300">
                {balance} ETH
              </div>
              <button
                onClick={copyAddress}
                title="Click to copy address"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
              >
                {shortAddress(account)}
                {copied
                  ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                  : <Copy className="w-3 h-3 text-zinc-400" />}
              </button>
              <a
                href={`${SEPOLIA_EXPLORER_URL}/address/${account}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition"
                title="View on Sepolia Explorer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={disconnectWallet}
                title="Disconnect Wallet"
                className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
