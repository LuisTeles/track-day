"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useStoredChoice } from "@/shared/hooks/use-stored-choice";
import { readLastSession, writeLastSession } from "./last-session";
import type { Bindings, NavAction } from "./rig/gamepad";
import { useFullscreen } from "./rig/use-fullscreen";
import { useGamepadButtons } from "./rig/use-gamepad-buttons";
import { readBindings, WheelButtonSettings, writeBindings } from "./rig/wheel-buttons";
import { useWakeLock, type WakeLockStatus } from "./rig/use-wake-lock";
import { useManualNavigator } from "./navigation/use-manual-navigator";
import {
  buildSteps,
  stepGuide,
  stepIndexOf,
  type PracticeStep,
  type StepMode,
} from "./navigation/steps";
import { createTrackPath } from "@/features/track-view/geometry/path";
import { cornerFraction } from "@/features/track-view/geometry/anchors";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { CornerDiagram } from "./corner-diagram";
import { cornerDiagram, schematicDiagram, type CornerPositions } from "./diagram-geometry";
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
  const layoutParam = params.get("layout");
  // Last guide/corner on this layout, used when the link doesn't say.
  const [remembered] = useState(() => readLastSession(layoutParam));
  const session = usePracticeSession(
    trackId,
    layoutParam,
    params.get("guide") ?? remembered?.guide ?? null,
  );
  const wakeLock = useWakeLock();
  const fullscreen = useFullscreen();
  const [fontSize, setFontSize] = useStoredChoice("practice:font-size", FONT_SIZES, "M");
  const mode: StepMode = params.get("step") === "complex" ? "complex" : "corner";

  const steps = useMemo(
    () => (session.data ? buildSteps(session.data.corners, session.data.complexes, mode) : []),
    [session.data, mode],
  );
  // The current corner lives in state; the URL follows it. Reading it back
  // from the URL would lose fast presses (URL updates land asynchronously).
  const [cornerNumber, setCornerNumber] = useState(
    () => Number(params.get("corner")) || remembered?.corner || 0,
  );
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

  // Path parsing is the costly part of the diagram; do it once per layout.
  const outlinePath = session.data?.layout?.outlinePath ?? null;
  const racingLinePath = session.data?.layout?.racingLine?.path ?? null;
  const outline = useMemo(() => (outlinePath ? createTrackPath(outlinePath) : null), [outlinePath]);
  const racingPath = useMemo(
    () => (racingLinePath ? createTrackPath(racingLinePath) : null),
    [racingLinePath],
  );

  const layoutId = session.data?.layout?.id;
  const guideId = session.guide?.id ?? null;
  const currentNumber = steps[current]?.corners[0]?.number ?? null;
  useEffect(() => {
    if (layoutId) writeLastSession(layoutId, { guide: guideId, corner: currentNumber });
  }, [layoutId, guideId, currentNumber]);

  const { navigator, surfaceProps } = useManualNavigator({
    count: steps.length,
    current,
    onChange: goToStep,
    onExit: exit,
  });

  // Optional wheel/gamepad button (experimental, desktop second monitor).
  const [bindings, setBindings] = useState<Bindings>(readBindings);
  const [capturing, setCapturing] = useState<NavAction | null>(null);
  const updateBindings = (next: Bindings) => {
    setBindings(next);
    writeBindings(next);
  };
  const { supported: gamepadSupported } = useGamepadButtons({
    bindings,
    capturing: capturing !== null,
    onAction: (action) => (action === "next" ? navigator.next() : navigator.prev()),
    onCapture: (binding) => {
      if (capturing) updateBindings({ ...bindings, [capturing]: binding });
      setCapturing(null);
    },
  });

  if (session.isPending) return <Screen>Loading…</Screen>;
  if (session.error) return <Screen>Could not load the track: {session.error.message}</Screen>;
  if (!session.data?.layout) return <Screen>This track has no layout to practice.</Screen>;
  if (steps.length === 0) return <Screen>This layout has no corners yet.</Screen>;

  const { track, layout } = session.data;
  const step = steps[current]!;
  const nextStep = steps[(current + 1) % steps.length]!;
  const hasComplexes = session.data.complexes.length > 0;

  function diagramFor(s: PracticeStep) {
    const guides = s.corners.map((c) => (session.guide ? session.guideFor(c.id) : null));
    const brakeLabel = brakeAtText(guides[0] ?? null);
    const apexLabels = s.corners.map((c) => `T${c.number}`);
    const positions = s.corners.flatMap((c, i): CornerPositions[] => {
      const apex = cornerFraction(c, layout);
      if (apex === null) return [];
      const line = guides[i]?.line;
      return [
        { apex: line?.apexAt ?? apex, turnIn: line?.turnInAt ?? null, exit: line?.exitAt ?? null },
      ];
    });
    if (outline && layout.lengthMeters && positions.length === s.corners.length) {
      const diagram = cornerDiagram({
        path: outline,
        lengthMeters: layout.lengthMeters,
        corners: positions,
        brakeMeters: guides[0]?.brakeMarkerMeters ?? null,
        racingLine: racingPath,
      });
      return (
        // The diagram fills the space left after the credit line, so the
        // credit is never clipped by the card's height cap.
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <CornerDiagram diagram={diagram} apexLabels={apexLabels} brakeLabel={brakeLabel} />
          </div>
          {layout.outlineSource === "osm" && <OsmAttribution className="shrink-0 text-center" />}
        </div>
      );
    }
    const first = s.corners[0]!;
    return (
      <CornerDiagram
        diagram={schematicDiagram(first.type, first.direction)}
        apexLabels={apexLabels.slice(0, 1)}
        brakeLabel={null}
      />
    );
  }

  return (
    <PracticeShell
      surfaceProps={surfaceProps}
      scale={FONT_SCALE[fontSize]}
      controls={
        <>
          <span className="mr-auto truncate text-muted max-sm:hidden">
            {track.aliases[0] ?? track.name} · {layout.name}
            {session.guideLabel && ` · ${session.guideLabel}`}
          </span>
          <span className="text-muted tabular-nums max-sm:mr-auto">
            {current + 1}/{steps.length}
          </span>
          <ControlButton onClick={navigator.prev} aria-label="Previous corner">
            ‹ Prev
          </ControlButton>
          <ControlButton onClick={navigator.next} aria-label="Next corner">
            Next ›
          </ControlButton>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-1.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              Options
            </summary>
            <div className="absolute top-full right-0 z-10 mt-1 flex w-64 flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3 shadow-xl">
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
              <label className="flex items-center gap-2 px-3 text-muted">
                Text size
                <select
                  aria-label="Text size"
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value as FontSize)}
                  className="rounded-md border border-border bg-background px-1 py-1 text-foreground"
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              {fullscreen.enabled && (
                <ControlButton
                  aria-pressed={fullscreen.active}
                  onClick={() => void fullscreen.toggle()}
                >
                  Fullscreen
                </ControlButton>
              )}
              <WakeLockIndicator status={wakeLock} />
              {gamepadSupported && (
                <WheelButtonSettings
                  bindings={bindings}
                  capturing={capturing}
                  onCapture={setCapturing}
                  onCancel={() => setCapturing(null)}
                  onClear={() => updateBindings({ next: null, prev: null })}
                />
              )}
            </div>
          </details>
          <Link href={exitHref} className="rounded-lg px-3 py-1.5 font-medium hover:bg-surface">
            Exit
          </Link>
        </>
      }
    >
      <PracticeCard
        diagram={diagramFor(step)}
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

const FONT_SIZES = ["S", "M", "L"] as const;
type FontSize = (typeof FONT_SIZES)[number];
const FONT_SCALE: Record<FontSize, number> = { S: 0.85, M: 1, L: 1.2 };

function WakeLockIndicator({ status }: { status: WakeLockStatus }) {
  const text = {
    active: "Screen stays on",
    released: "Screen may sleep",
    error: "Screen may sleep",
    unsupported: "Screen may sleep",
  }[status];
  const hint =
    status === "unsupported"
      ? "Keeping the screen on needs HTTPS and a supporting browser."
      : status === "error"
        ? "The browser refused to keep the screen on (e.g. battery saver)."
        : undefined;
  return (
    <span className="px-3 text-muted" title={hint} data-testid="wake-lock" data-status={status}>
      <span aria-hidden className={status === "active" ? "text-emerald-400" : "text-estimate"}>
        ●
      </span>{" "}
      {text}
    </span>
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
  scale = 1,
}: {
  controls: ReactNode;
  children: ReactNode;
  /** Text size multiplier (S/M/L), applied through --practice-scale. */
  scale?: number;
  /** Tap zones and swipes (see useManualNavigator). */
  surfaceProps?: HTMLAttributes<HTMLElement>;
}) {
  return (
    <div
      data-theme="practice"
      className="fixed inset-0 flex flex-col bg-background text-foreground"
      style={{ "--practice-scale": scale } as CSSProperties}
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
