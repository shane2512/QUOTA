import type { Metadata, Viewport } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SmoothScroll from "@/components/SmoothScroll";

const sans = Inter_Tight({ subsets: ["latin"], display: "swap", variable: "--f-inter" });
const display = Archivo({ subsets: ["latin"], display: "swap", axes: ["wdth"], variable: "--f-archivo" });

export const metadata: Metadata = {
  title: "QUOTA: private rate limits for AI agents",
  description: "Anonymous, deposit-backed rate limits for AI-agent traffic on Monad. No issuer, no accounts, no tracking.",
};

export const viewport: Viewport = { themeColor: "#0a0b0b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <SmoothScroll />
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
