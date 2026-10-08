"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  // "/" is current only on the home page; other links also own their sub-pages.
  const current = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="focus-ring inline-flex h-10 items-center rounded-lg px-3 text-muted hover:bg-surface hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:font-medium pointer-coarse:h-11"
    >
      {children}
    </Link>
  );
}
