import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { NavLink } from "./nav-link";

/** Standard pages: sticky header navigation and a centered content column. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="focus-ring sr-only z-50 rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-safe-0 backdrop-blur">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 text-sm pl-safe-4 pr-safe-4"
        >
          <Link href="/" className="focus-ring mr-3 rounded-lg font-semibold tracking-tight">
            Track Day
          </Link>
          <NavLink href="/">Tracks</NavLink>
          <NavLink href="/backup/">Backup</NavLink>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 pt-8 pb-safe-12 outline-none pl-safe-4 pr-safe-4"
      >
        {children}
      </main>
    </>
  );
}
