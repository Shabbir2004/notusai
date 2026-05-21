import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NotusAI — AI-drafted GST notice replies for Indian CA firms",
  description:
    "Draft ASMT-10 / DRC-01 / GST notice replies in 24 hours. With CGST Act citations, CBIC circulars, and HC/CESTAT case-law references. First one free.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 text-ink-900">{children}</body>
    </html>
  );
}
