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
        <nav className="sticky top-0 z-10 bg-background flex gap-4 overflow-x-auto whitespace-nowrap border-b px-4 py-1 text-sm sm:px-6 [&>a]:py-2">
          <Link href="/">Accounts</Link>
          <Link href="/transactions">Transactions</Link>
          <Link href="/investments">Investments</Link>
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
