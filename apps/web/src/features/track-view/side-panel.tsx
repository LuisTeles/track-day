"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/shared/ui/icon-button";

interface SidePanelProps {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  /** Extra controls between the title and the close button. */
  headerActions?: ReactNode;
}

/**
 * Non-modal panel over the map: a right-hand sidebar from `md` up, a bottom
 * sheet below. Escape closes it; focus moves into it on open and returns to
 * whatever was focused before (usually a marker) on close.
 */
export function SidePanel({ open, title, onClose, children, headerActions }: SidePanelProps) {
  const [expanded, setExpanded] = useState(false);
  // Reopen collapsed: reset while rendering the close, not in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setExpanded(false);
  }
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = returnFocus.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="side-panel"
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border border-border bg-background pb-safe-0 shadow-2xl md:inset-x-auto md:top-20 md:right-3 md:bottom-3 md:max-h-none md:w-[400px] md:rounded-2xl ${expanded ? "max-h-[85dvh]" : "max-h-[45dvh]"}`}
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
      <div className="sticky top-0 flex items-center gap-2 border-b border-border px-4 py-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="flex-1 truncate text-base font-semibold outline-none"
        >
          {title}
        </h2>
        {headerActions}
        <IconButton
          label={expanded ? "Collapse panel" : "Expand panel"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="md:hidden"
        >
          {expanded ? <ChevronDown /> : <ChevronUp />}
        </IconButton>
        <IconButton label="Close panel" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe-4">{children}</div>
    </aside>
  );
}
