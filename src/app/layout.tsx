import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "fclan — Lap Analysis & AI Coaching",
  description:
    "Capture your Gran Turismo 7 telemetry data, analyze every lap with AI-powered insights, and become a faster driver.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
