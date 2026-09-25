"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, X } from "lucide-react";
import { SEPOLIA_EXPLORER_URL } from "../lib/constants.js";

export function TransactionToast({ status, message, txHash, onClose, state }) {
  const currentStatus = status || state?.status;
  const currentMessage = message || state?.message;
  const currentTxHash = txHash || state?.txHash;

  if (!currentStatus) return null;

  const isPending = currentStatus === "pending";
  const isSuccess = currentStatus === "success";
  const isError = currentStatus === "error";

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div
        className={`p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-start gap-3 transition-all ${
          isPending
            ? "bg-amber-950/90 border-amber-500/40 text-amber-100"
            : isSuccess
            ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-100"
            : "bg-rose-950/90 border-rose-500/40 text-rose-100"
        }`}
      >
        <div className="mt-0.5 flex-shrink-0">
          {isPending && <Loader2 className="w-5 h-5 animate-spin text-amber-400" />}
          {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
        </div>

        <div className="flex-1 text-sm">
          <p className="font-semibold text-white">
            {isPending && "Transaction in Progress"}
            {isSuccess && "Transaction Confirmed!"}
            {isError && "Transaction Failed"}
          </p>
          <p className="text-xs opacity-90 mt-1 leading-relaxed break-words">{currentMessage}</p>

          {currentTxHash && (
            <a
              href={`${SEPOLIA_EXPLORER_URL}/tx/${currentTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 underline mt-2"
            >
              View on Sepolia Explorer
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default TransactionToast;
