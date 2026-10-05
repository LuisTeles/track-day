"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { useManualNavigator } from "./navigation/use-manual-navigator";
import { buildSteps, stepGuide, stepIndexOf, type StepMode } from "./navigation/steps";
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
  const router = useRouter();
  const pathname = usePathname();
  const session = usePracticeSession(trackId, params.get("layout"), params.get("guide"));
  const mode: StepMode = params.get("step") === "complex" ? "complex" : "corner";

  const steps = useMemo(
    () => (session.data ? buildSteps(session.data.corners, session.data.complexes, mode) : []),
    [session.data, mode],
  );
  // The current corner lives in state; the URL follows it. Reading it back
  // from the URL would lose fast presses (URL updates land asynchronously).
  const [cornerNumber, setCornerNumber] = useState(() => Number(params.get("corner")) || 0);
  const current = stepIndexOf(steps, cornerNumber);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      // Native replaceState (synced with useSearchParams by Next.js): no
      // history entry per corner, and no soft navigation per key press.
      window.history.replaceState(null, "", `${pathname}?${next}`);
    },
    [params, pathname],
  );

  const goToStep = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      const number = step.corners[0]!.number;
      setCornerNumber(number);
      setParams({ corner: String(number) });
    },
    [steps, setParams],
  );

  const exitHref = session.data?.layout
    ? `/tracks/view/?${new URLSearchParams({ track: trackId, layout: session.data.layout.id })}`
    : "/";
  const exit = useCallback(() => router.push(exitHref), [router, exitHref]);

  const { navigator, surfaceProps } = useManualNavigator({
    count: steps.length,
    current,
    onChange: goToStep,
    onExit: exit,
  });

  if (session.isPending) return <Screen>Loading…</Screen>;
  if (session.error) return <Screen>Could not load the track: {session.error.message}</Screen>;
  if (!session.data?.layout) return <Screen>This track has no layout to practice.</Screen>;
  if (steps.length === 0) return <Screen>This layout has no corners yet.</Screen>;

  const { track, layout } = session.data;
  const step = steps[current]!;
  const nextStep = steps[(current + 1) % steps.length]!;
  const hasComplexes = session.data.complexes.length > 0;

  return (
    <PracticeShell
      surfaceProps={surfaceProps}
      controls={
        <>
          <span className="mr-auto truncate text-muted">
            {track.aliases[0] ?? track.name} · {layout.name}
            {session.guideLabel && ` · ${session.guideLabel}`}
          </span>
          <span className="text-muted tabular-nums">
            {current + 1}/{steps.length}
          </span>
          <ControlButton onClick={navigator.prev} aria-label="Previous corner">
            ‹ Prev
          </ControlButton>
          <ControlButton onClick={navigator.next} aria-label="Next corner">
            Next ›
          </ControlButton>
          {hasComplexes && (
            <ControlButton
              aria-pressed={mode === "complex"}
              onClick={() =>
                setParams({
                  step: mode === "complex" ? null : "complex",
                  corner: String(step.corners[0]!.number),
                })
              }
            >
              By complex
            </ControlButton>
          )}
          <Link href={exitHref} className="rounded-lg px-3 py-1.5 font-medium hover:bg-surface">
            Exit
          </Link>
        </>
      }
    >
      <PracticeCard
        title={titleOf(step.corners)}
        name={step.complex?.name ?? step.corners[0]!.name}
        direction={directionText(step.corners)}
        guide={session.guide ? stepGuide(step, session.guideFor) : null}
        guideLabel={session.guideLabel}
        next={{
          title: titleOf(nextStep.corners),
          name: nextStep.complex?.name ?? nextStep.corners[0]!.name,
          direction: directionText(nextStep.corners),
          brakeAt: brakeAtText(stepGuide(nextStep, session.guideFor)),
        }}
      />
    </PracticeShell>
  );
}

function ControlButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-lg px-3 py-1.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent aria-pressed:bg-foreground aria-pressed:text-background"
      {...props}
    />
  );
}

export function PracticeShell({
  controls,
  children,
  surfaceProps,
}: {
  controls: ReactNode;
  children: ReactNode;
  /** Tap zones and swipes (see useManualNavigator). */
  surfaceProps?: HTMLAttributes<HTMLElement>;
}) {
  return (
    <div
      data-theme="practice"
      className="fixed inset-0 flex flex-col bg-background text-foreground"
    >
      <div data-no-nav className="flex flex-wrap items-center gap-1 px-4 pt-3 text-sm">
        {controls}
      </div>
      <main {...surfaceProps} className="min-h-0 flex-1 touch-pan-y p-4 pt-2 select-none">
        {children}
      </main>
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
