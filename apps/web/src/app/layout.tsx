import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Track Day",
  description:
    "Record and study track knowledge — corners, reference points, speeds, gears — per car.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <header className="border-b border-border">
            <nav
              aria-label="Main"
              className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm"
            >
              <Link href="/" className="font-semibold tracking-tight">
                Track Day
              </Link>
              <Link href="/" className="text-muted hover:text-foreground">
                Tracks
              </Link>
              <Link href="/backup/" className="text-muted hover:text-foreground">
                Backup
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
