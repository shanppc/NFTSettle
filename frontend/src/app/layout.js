import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "../../context/Web3Context.jsx";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "NFT Settle — Sepolia NFT Marketplace",
  description: "Decentralized NFT marketplace and auction platform on Ethereum Sepolia testnet",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-indigo-500 selection:text-white">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
