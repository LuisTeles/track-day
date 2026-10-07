"use client";

import type { CornerGuide } from "@track-day/schema";
import { useState, type ReactNode } from "react";
import { isEstimate } from "@/features/guides/estimate";
import { brakeAtText, pressureOf } from "./format";

export interface NextCorner {
  title: string;
  name: string | null;
  direction: string | null;
  brakeAt: string | null;
}

export interface PracticeCardProps {
  /** "T4" or, for a complex, "T1–T2". */
  title: string;
  name: string | null;
  /** "Left", or "Left → Right" for a complex. */
  direction: string | null;
  /** Guidance for this step; null when the guide has nothing for it. */
  guide: CornerGuide | null;
  guideLabel: string | null;
  next: NextCorner | null;
  diagram?: ReactNode;
  /** Car notes, corner notes and common mistakes for this step. */
  notes?: { car: string; corner: string; mistakes: string[] } | null;
}

const DASH = "—";

/**
 * One corner, readable at a glance. Purely presentational: every tile keeps
 * its size whether or not it has a value, so nothing jumps between corners.
 */
export function PracticeCard({
  title,
  name,
  direction,
  guide,
  guideLabel,
  next,
  diagram,
  notes,
}: PracticeCardProps) {
  const brakeAt = brakeAtText(guide);
  const pressure = pressureOf(guide);
  const estimate = guide !== null && isEstimate(guide);

  return (
    <section
      aria-live="polite"
      aria-label={[title, name, direction].filter(Boolean).join(", ")}
      data-testid="practice-card"
      className="flex h-full min-w-0 flex-col gap-[calc(0.75rem*var(--practice-scale,1))]"
    >
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[calc(clamp(2.5rem,9vmin,5.5rem)*var(--practice-scale,1))] leading-none font-bold tabular-nums">
          {title}
        </h1>
        <div className="min-w-0">
          <p className="truncate text-[calc(clamp(1.1rem,3.6vmin,2rem)*var(--practice-scale,1))] font-semibold">
            {name ?? "Unnamed corner"}
          </p>
          <p className="text-[calc(clamp(0.9rem,2.6vmin,1.4rem)*var(--practice-scale,1))] text-muted">
            {direction ?? DASH}
          </p>
        </div>
        {estimate && (
          <span className="ml-auto shrink-0 rounded-full border border-estimate px-3 py-1 text-sm font-semibold text-estimate">
            Estimate{guide?.confidence ? ` · ${guide.confidence} confidence` : ""}
          </span>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[calc(0.75rem*var(--practice-scale,1))] landscape:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[calc(0.75rem*var(--practice-scale,1))]">
          {guide === null ? (
            <p className="grid flex-1 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-[calc(1.25rem*var(--practice-scale,1))] text-muted">
              {guideLabel
                ? `No guide for this corner in “${guideLabel}”.`
                : "No guide for this layout yet."}
            </p>
          ) : (
            <>
              <dl className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-[calc(0.75rem*var(--practice-scale,1))] landscape:grid-cols-4 landscape:grid-rows-1">
                <Tile
                  term="Brake at"
                  value={brakeAt ?? DASH}
                  small={brakeAt !== null && brakeAt.length > 8}
                />
                <Tile
                  term="Pressure"
                  value={pressure?.label ?? DASH}
                  small
                  extra={
                    <div
                      className="mt-2 h-3 w-full overflow-hidden rounded-full bg-border"
                      role="meter"
                      aria-label="Brake pressure"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pressure?.pct ?? 0}
                      aria-valuetext={pressure?.label ?? "unknown"}
                    >
                      <div
                        className="h-full bg-pressure"
                        style={{ width: `${pressure?.pct ?? 0}%` }}
                      />
                    </div>
                  }
                />
                <Tile
                  term="Gear"
                  value={guide.gear == null ? DASH : String(guide.gear)}
                  extra={
                    guide.downshiftTo != null && guide.downshiftTo !== guide.gear ? (
                      <p className="text-[calc(1rem*var(--practice-scale,1))] text-muted">
                        ↓ {guide.downshiftTo} under braking
                      </p>
                    ) : null
                  }
                />
                <Tile
                  term="Min speed"
                  value={guide.minSpeedKmh == null ? DASH : String(Math.round(guide.minSpeedKmh))}
                  unit={guide.minSpeedKmh == null ? undefined : "km/h"}
                />
              </dl>
              <p
                className="line-clamp-2 min-h-[2lh] text-[calc(clamp(1.1rem,3.4vmin,1.9rem)*var(--practice-scale,1))] leading-snug font-medium"
                data-testid="practice-cue"
              >
                {guide.cue ?? <span className="text-muted">{DASH}</span>}
              </p>
            </>
          )}
          {/* Keyed so "More notes" collapses again on the next corner. */}
          <PracticeNotes key={title} notes={notes ?? null} />
        </div>
        {diagram && (
          <div className="min-h-0 min-w-0 basis-2/5 portrait:max-h-[35%] landscape:basis-[40%]">
            {diagram}
          </div>
        )}
      </div>

      <footer className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-[calc(clamp(0.95rem,2.8vmin,1.4rem)*var(--practice-scale,1))]">
        <span className="text-muted">Next</span>
        {next ? (
          <>
            <span className="shrink-0 font-bold tabular-nums">{next.title}</span>
            <span className="min-w-0 truncate">{next.name ?? "Unnamed"}</span>
            <span className="shrink-0 text-muted">{next.direction ?? ""}</span>
            <span className="ml-auto min-w-0 truncate text-muted max-sm:hidden">
              {next.brakeAt ? `Brake: ${next.brakeAt}` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted">{DASH}</span>
        )}
      </footer>
    </section>
  );
}

function Tile({
  term,
  value,
  unit,
  small,
  extra,
}: {
  term: string;
  value: string;
  unit?: string;
  small?: boolean;
  extra?: ReactNode;
}) {
  return (
    // Each tile is a size container: values scale with the tile's own width
    // (cqi), so four narrow tiles beside the diagram still fit their values.
    <div className="@container flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-2xl bg-surface p-[calc(0.9rem*var(--practice-scale,1))]">
      <dt className="text-[calc(clamp(0.8rem,2.2vmin,1.1rem)*var(--practice-scale,1))] font-medium tracking-wide text-muted uppercase">
        {term}
      </dt>
      <dd>
        <span
          className={`block leading-tight font-bold tabular-nums ${
            small
              ? "line-clamp-2 text-[calc(min(clamp(1.1rem,4vmin,2.4rem),15cqi)*var(--practice-scale,1))]"
              : "truncate text-[calc(min(clamp(2.4rem,10vmin,6rem),30cqi)*var(--practice-scale,1))]"
          }`}
        >
          {value}
          {unit && <span className="ml-1 text-[0.4em] font-semibold text-muted">{unit}</span>}
        </span>
        {extra}
      </dd>
    </div>
  );
}

function PracticeNotes({
  notes,
}: {
  notes: { car: string; corner: string; mistakes: string[] } | null;
}) {
  const [open, setOpen] = useState(false);
  if (!notes) return null;
  const parts = [notes.car.trim(), notes.corner.trim()].filter(Boolean);
  if (parts.length === 0 && notes.mistakes.length === 0) return null;
  return (
    <div
      data-testid="practice-notes"
      data-no-nav
      className="shrink-0 rounded-2xl bg-surface p-[calc(0.75rem*var(--practice-scale,1))] text-[calc(clamp(0.95rem,2.6vmin,1.4rem)*var(--practice-scale,1))]"
    >
      <div className={open ? "space-y-2" : "line-clamp-3 space-y-2"}>
        {parts.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
      {open && notes.mistakes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-muted">
          {notes.mistakes.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-1 text-sm text-muted underline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Fewer notes" : "More notes"}
      </button>
    </div>
  );
}
