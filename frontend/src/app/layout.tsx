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
      <body className="min-h-screen bg-[#F5F3EE] text-[#252525] antialiased selection:bg-[#F8E9DF] selection:text-[#B95E32]">
        {children}
      </body>
    </html>
  );
}
