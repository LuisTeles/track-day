"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { brakeAtText, directionText, titleOf } from "./format";
import { PracticeCard } from "./practice-card";
import { usePracticeSession } from "./use-practice-session";

/** `?track=&layout=&guide=&corner=<number>` (ADR-006). */
export function PracticePage() {
  const params = useSearchParams();
  const trackId = params.get("track");
  if (!trackId) return <Screen>No track selected.</Screen>;
  return <Practice trackId={trackId} />;
}

function Practice({ trackId }: { trackId: string }) {
  const params = useSearchParams();
  const session = usePracticeSession(trackId, params.get("layout"), params.get("guide"));

  if (session.isPending) return <Screen>Loading…</Screen>;
  if (session.error) return <Screen>Could not load the track: {session.error.message}</Screen>;
  if (!session.data?.layout) return <Screen>This track has no layout to practice.</Screen>;

  const { track, layout, corners } = session.data;
  if (corners.length === 0) return <Screen>This layout has no corners yet.</Screen>;

  const requested = Number(params.get("corner"));
  const index = Math.max(
    0,
    corners.findIndex((c) => c.number === requested),
  );
  const corner = corners[index]!;
  const nextCorner = corners[(index + 1) % corners.length]!;

  const exitHref = `/tracks/view/?${new URLSearchParams({ track: track.id, layout: layout.id })}`;

  return (
    <PracticeShell
      controls={
        <>
          <span className="truncate text-muted">
            {track.aliases[0] ?? track.name} · {layout.name}
            {session.guideLabel && ` · ${session.guideLabel}`}
          </span>
          <Link href={exitHref} className="rounded-lg px-3 py-1.5 font-medium hover:bg-surface">
            Exit
          </Link>
        </>
      }
    >
      <PracticeCard
        title={titleOf([corner])}
        name={corner.name}
        direction={directionText([corner])}
        guide={session.guide ? session.guideFor(corner.id) : null}
        guideLabel={session.guideLabel}
        next={{
          title: titleOf([nextCorner]),
          name: nextCorner.name,
          direction: directionText([nextCorner]),
          brakeAt: brakeAtText(session.guideFor(nextCorner.id)),
        }}
      />
    </PracticeShell>
  );
}

export function PracticeShell({
  controls,
  children,
}: {
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-theme="practice"
      className="fixed inset-0 flex flex-col bg-background text-foreground"
    >
      <div className="flex items-center justify-end gap-2 px-4 pt-3 text-sm">{controls}</div>
      <main className="min-h-0 flex-1 p-4 pt-2">{children}</main>
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="practice"
      className="fixed inset-0 grid place-items-center bg-background p-6 text-center text-muted"
    >
      <div className="space-y-3">
        <p>{children}</p>
        <Link href="/" className="text-sm underline">
          Back to tracks
        </Link>
      </div>
    </div>
  );
}
