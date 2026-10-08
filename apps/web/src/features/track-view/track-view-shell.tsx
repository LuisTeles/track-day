import type { ReactNode } from "react";

interface TrackViewShellProps {
  topBar: ReactNode;
  canvas: ReactNode;
  controls: ReactNode;
  panel: ReactNode;
}

/**
 * Full-viewport layout: the map fills the screen, the top bar and controls
 * float over it, and the side panel overlays it (so opening the panel never
 * resizes the canvas and re-fits the track).
 */
export function TrackViewShell({ topBar, canvas, controls, panel }: TrackViewShellProps) {
  return (
    <div className="fixed inset-0 bg-canvas">
      {canvas}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-safe-3 pl-safe-3 pr-safe-3">
        <div className="pointer-events-auto flex h-14 w-fit max-w-full items-center gap-2 rounded-2xl border border-border bg-background/90 px-2 shadow-lg backdrop-blur">
          {topBar}
        </div>
      </header>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-safe-3 pl-safe-3 pr-safe-3 md:justify-start">
        {controls}
      </div>
      {panel}
    </div>
  );
}

export function ToolButton({
  pressed,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`focus-ring inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap hover:bg-surface disabled:opacity-40 aria-pressed:bg-foreground aria-pressed:text-background pointer-coarse:h-11 ${className}`}
      {...props}
    />
  );
}
