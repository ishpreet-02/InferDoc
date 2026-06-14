import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { MyProductsNav, MyProductsNavFallback } from "@/app/components/MyProductsNav";
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
  title: "AcmeMobility Support",
  description:
    "Product support platform with an AI Diagnostic Assistant powered by Moss retrieval.",
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
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-sm text-white">
                A
              </span>
              <span>AcmeMobility</span>
              <span className="hidden text-zinc-400 sm:inline">Support</span>
            </Link>
            <nav className="-mr-1 flex items-center gap-0.5 overflow-x-auto text-sm sm:gap-1">
              <Link
                href="/"
                className="shrink-0 rounded-md px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:px-3"
              >
                Catalog
              </Link>
              <Suspense fallback={<MyProductsNavFallback />}>
                <MyProductsNav />
              </Suspense>
              <Link
                href="/company/dashboard"
                className="shrink-0 rounded-md px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:px-3"
              >
                <span className="sm:hidden">Company</span>
                <span className="hidden sm:inline">Company Dashboard</span>
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
