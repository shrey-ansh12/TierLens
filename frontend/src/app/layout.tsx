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
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
