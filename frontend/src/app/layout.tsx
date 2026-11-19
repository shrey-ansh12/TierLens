import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TierLens | Application Performance & Device Intelligence Platform",
  description: "Test, compare, diagnose, and optimize web and Android apps across real device tiers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080C14] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
