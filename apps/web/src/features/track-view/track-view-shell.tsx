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
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
        <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
          {topBar}
        </div>
      </header>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 md:justify-start">
        <div
          role="toolbar"
          aria-label="Map controls"
          className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-sm backdrop-blur"
        >
          {controls}
        </div>
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
      className={`rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-pressed:bg-foreground aria-pressed:text-background ${className}`}
      {...props}
    />
  );
}
