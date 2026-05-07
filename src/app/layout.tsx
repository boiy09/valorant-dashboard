import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Valorant Dashboard",
  description: "발로란트 서버 대시보드",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/valosegi-icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/valosegi-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0f1923] text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
