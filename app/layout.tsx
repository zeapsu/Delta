import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Delta",
  description: "Personal finance dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-4 border-b px-6 py-3 text-sm">
          <Link href="/">Accounts</Link>
          <Link href="/transactions">Transactions</Link>
          <Link href="/spending">Spending</Link>
          <Link href="/net-worth">Net worth</Link>
          <Link href="/recurring">Recurring</Link>
          <Link href="/budgets">Budgets</Link>
          <Link href="/chat">Chat</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
