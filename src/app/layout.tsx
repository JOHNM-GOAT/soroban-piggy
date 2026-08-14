import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soroban PiggyBank | Gamified Timelock Savings Vault",
  description: "Lock your XLM safely on-chain with Soroban Rust smart contracts. Earn XP, unlock achievement badges, and play interactive arcade mini-games.",
  openGraph: {
    title: "Soroban PiggyBank | Gamified Timelock Savings Vault",
    description: "Lock your XLM safely on-chain with Soroban Rust smart contracts. Earn XP, unlock achievement badges, and play interactive arcade mini-games.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
