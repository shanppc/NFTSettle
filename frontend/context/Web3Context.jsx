"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { SEPOLIA_CHAIN_ID, MARKETPLACE_ADDRESS } from "../lib/constants.js";
import {
  getMarketplaceContract,
  requestSepoliaSwitch,
  formatEth,
} from "../lib/web3.js";

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("0");
  const [pendingWithdrawal, setPendingWithdrawal] = useState(0n);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  const refreshUserData = useCallback(async (addr, prov) => {
    if (!addr || !prov) return;
    try {
      const bal = await prov.getBalance(addr);
      setBalance(formatEth(bal));
      const market = getMarketplaceContract(prov);
      try {
        const pending = await market.pendingWithdrawls(addr);
        setPendingWithdrawal(pending || 0n);
      } catch {
        setPendingWithdrawal(0n);
      }
    } catch (err) {
      console.error("refreshUserData error:", err);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("No Ethereum wallet found! Please install MetaMask.");
      return;
    }
    try {
      setIsConnecting(true);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const network = await browserProvider.getNetwork();
      const walletSigner = await browserProvider.getSigner();

      const addr = accounts[0];
      const cid = Number(network.chainId);

      setProvider(browserProvider);
      setSigner(walletSigner);
      setAccount(addr);
      setChainId(cid);
      await refreshUserData(addr, browserProvider);
    } catch (err) {
      console.error("connectWallet error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshUserData]);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setBalance("0");
    setPendingWithdrawal(0n);
  }, []);

  const switchToSepolia = useCallback(async () => {
    try {
      await requestSepoliaSwitch();
      if (window.ethereum) {
        const prov = new ethers.BrowserProvider(window.ethereum);
        const net = await prov.getNetwork();
        setChainId(Number(net.chainId));
        setProvider(prov);
      }
    } catch (err) {
      console.error("switchToSepolia error:", err);
    }
  }, []);

  // Auto-detect already connected account & listen for events
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
      } else {
        const prov = new ethers.BrowserProvider(window.ethereum);
        const walletSigner = await prov.getSigner();
        const net = await prov.getNetwork();
        setProvider(prov);
        setSigner(walletSigner);
        setAccount(accounts[0]);
        setChainId(Number(net.chainId));
        await refreshUserData(accounts[0], prov);
      }
    };

    const handleChainChanged = async () => {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const net = await prov.getNetwork();
      setChainId(Number(net.chainId));
      setProvider(prov);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Auto-reconnect if already authorised
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts && accounts.length > 0) connectWallet();
      })
      .catch(() => {});

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [connectWallet, disconnectWallet, refreshUserData]);

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        isSepolia,
        balance,
        pendingWithdrawal,
        signer,
        provider,
        isConnecting,
        marketplaceAddress: MARKETPLACE_ADDRESS,
        connectWallet,
        disconnectWallet,
        switchToSepolia,
        refreshUserData: () => refreshUserData(account, provider),
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used inside Web3Provider");
  return ctx;
}
