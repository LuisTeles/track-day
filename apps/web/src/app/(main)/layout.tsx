import Link from "next/link";
import type { ReactNode } from "react";

/** Standard pages: header navigation and a centered content column. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
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
    </>
  );
}
