"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface SidePanelProps {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
}

/**
 * Non-modal panel over the map: a right-hand sidebar from `md` up, a bottom
 * sheet below. Escape closes it; focus moves into it on open and returns to
 * whatever was focused before (usually a marker) on close.
 */
export function SidePanel({ open, title, onClose, children }: SidePanelProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = returnFocus.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="side-panel"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl md:inset-x-auto md:top-16 md:right-3 md:bottom-3 md:max-h-none md:w-96 md:rounded-2xl"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold outline-none"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="-m-1 rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  );
}
