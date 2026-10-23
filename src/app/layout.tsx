import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, Inter_Tight, JetBrains_Mono, Lexend } from "next/font/google";
import "./globals.css";

/* Five self-hosted families: Inter for reading, Lexend for product headlines, Inter Tight and an italic serif for the shop, a mono for numbers. */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: { default: "CatalogForge", template: "%s · CatalogForge" },
  description: "Messy supplier sheets in, store-ready multi-language catalog out.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${lexend.variable} ${interTight.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
