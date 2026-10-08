"use client";

import { cornerLine } from "@/features/track-view/geometry/corner-line";
import { ChevronLeft, ChevronRight, NotebookPen, Settings2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
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
import { Button } from "@/shared/ui/button";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { CornerDiagram } from "./corner-diagram";
import { cornerDiagram, schematicDiagram, type CornerPositions } from "./diagram-geometry";
import { brakeAtText, directionText, titleOf } from "./format";
import { PracticeCard } from "./practice-card";
import { QuickNote } from "./quick-note";
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
  const [noting, setNoting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
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
    paused: noting || optionsOpen,
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
    onAction: (action) => {
      if (noting) return;
      if (action === "next") navigator.next();
      else navigator.prev();
    },
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
      const hasCarPoints = s.corners.some((_, i) => {
        const l = guides[i]?.line;
        return l != null && (l.turnInAt ?? l.apexAt ?? l.exitAt) != null;
      });
      const generated = hasCarPoints
        ? cornerLine({
            path: outline,
            lengthMeters: layout.lengthMeters,
            corners: s.corners.map((c, i) => ({
              direction: c.direction,
              turnIn: positions[i]!.turnIn ?? null,
              apex: positions[i]!.apex,
              exit: positions[i]!.exit ?? null,
            })),
          })
        : null;
      const diagram = cornerDiagram({
        path: outline,
        lengthMeters: layout.lengthMeters,
        corners: positions,
        brakeMeters: guides[0]?.brakeMarkerMeters ?? null,
        racingLine: racingPath,
        line: generated?.points ?? null,
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
          <span className="mr-auto min-w-0 truncate text-muted max-md:hidden">
            {track.aliases[0] ?? track.name} · {layout.name}
            {session.guideLabel && ` · ${session.guideLabel}`}
          </span>
          <span className="rounded-full bg-surface px-3 py-1 tabular-nums max-md:mr-auto">
            {current + 1}/{steps.length}
          </span>
          <ControlButton onClick={() => setNoting(true)}>
            <NotebookPen aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Note</span>
          </ControlButton>
          <ControlButton onClick={navigator.prev} aria-label="Previous corner">
            <ChevronLeft aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Prev</span>
          </ControlButton>
          <ControlButton onClick={navigator.next} aria-label="Next corner">
            <span className="max-sm:sr-only">Next</span>
            <ChevronRight aria-hidden className="size-4" />
          </ControlButton>
          <PracticeOptions
            open={optionsOpen}
            onOpenChange={setOptionsOpen}
            hasComplexes={hasComplexes}
            mode={mode}
            onToggleMode={() =>
              setParams({
                step: mode === "complex" ? null : "complex",
                corner: String(step.corners[0]!.number),
              })
            }
            fontSize={fontSize}
            onFontSize={setFontSize}
            fullscreen={fullscreen}
            wakeLock={wakeLock}
            wheel={
              gamepadSupported ? (
                <WheelButtonSettings
                  bindings={bindings}
                  capturing={capturing}
                  onCapture={setCapturing}
                  onCancel={() => setCapturing(null)}
                  onClear={() => updateBindings({ next: null, prev: null })}
                />
              ) : null
            }
          />
          <ControlButton asChild>
            <Link href={exitHref}>
              <X aria-hidden className="size-4" />
              <span className="max-sm:sr-only">Exit</span>
            </Link>
          </ControlButton>
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
        notes={{
          car: step.corners
            .map((c) => (session.guide ? (session.guideFor(c.id)?.notes ?? "") : ""))
            .filter(Boolean)
            .join("\n"),
          corner: step.corners
            .map((c) => c.notes)
            .filter(Boolean)
            .join("\n"),
          mistakes: step.corners.flatMap((c) => c.commonMistakes),
        }}
        next={{
          title: titleOf(nextStep.corners),
          name: nextStep.complex?.name ?? nextStep.corners[0]!.name,
          direction: directionText(nextStep.corners),
          brakeAt: brakeAtText(stepGuide(nextStep, session.guideFor)),
        }}
      />
      <QuickNote
        trackId={trackId}
        corner={step.corners[0]!}
        guideId={session.guide?.id ?? null}
        existing={session.guide ? (session.guideFor(step.corners[0]!.id) ?? undefined) : undefined}
        open={noting}
        onOpenChange={setNoting}
      />
    </PracticeShell>
  );
}

const FONT_SIZES = ["S", "M", "L"] as const;
export type FontSize = (typeof FONT_SIZES)[number];
const FONT_SCALE: Record<FontSize, number> = { S: 0.85, M: 1, L: 1.2 };

export function PracticeOptions({
  open,
  onOpenChange,
  hasComplexes,
  mode,
  onToggleMode,
  fontSize,
  onFontSize,
  fullscreen,
  wakeLock,
  wheel,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  hasComplexes: boolean;
  mode: StepMode;
  onToggleMode(): void;
  fontSize: FontSize;
  onFontSize(size: FontSize): void;
  fullscreen: { enabled: boolean; active: boolean; toggle(): void | Promise<void> };
  wakeLock: WakeLockStatus;
  /** Wheel button settings, or null when no gamepad API. */
  wheel: ReactNode | null;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ControlButton>
          <Settings2 aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Options</span>
        </ControlButton>
      </PopoverTrigger>
      {/* Portaled to <body>, outside the practice shell: carry the theme along. */}
      <PopoverContent
        aria-label="Practice options"
        data-theme="practice"
        className="w-72 space-y-4"
      >
        {hasComplexes && (
          <ControlButton
            className="w-full justify-start"
            aria-pressed={mode === "complex"}
            onClick={onToggleMode}
          >
            Step by complex
          </ControlButton>
        )}
        <div className="flex items-center justify-between gap-3">
          <span id="practice-text-size" className="text-muted">
            Text size
          </span>
          <div
            role="radiogroup"
            aria-labelledby="practice-text-size"
            className="flex rounded-lg border border-border p-0.5"
          >
            {FONT_SIZES.map((size) => (
              <label
                key={size}
                className="relative grid size-11 cursor-pointer place-items-center rounded-md font-medium text-muted has-checked:bg-surface has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="practice-font-size"
                  value={size}
                  checked={fontSize === size}
                  onChange={() => onFontSize(size)}
                  aria-label={size}
                  className="sr-only"
                />
                <span aria-hidden>{size}</span>
              </label>
            ))}
          </div>
        </div>
        {fullscreen.enabled && (
          <ControlButton
            className="w-full justify-start"
            aria-pressed={fullscreen.active}
            onClick={() => void fullscreen.toggle()}
          >
            Fullscreen
          </ControlButton>
        )}
        <WakeLockIndicator status={wakeLock} />
        {wheel}
      </PopoverContent>
    </Popover>
  );
}

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
    <div className="text-muted" data-testid="wake-lock" data-status={status}>
      <span aria-hidden className={status === "active" ? "text-success" : "text-estimate"}>
        ●
      </span>{" "}
      {text}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** 44px everywhere in practice: it is used on a rig at arm's length. */
function ControlButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-11 gap-2 rounded-xl px-4 aria-pressed:bg-foreground aria-pressed:text-background",
        className,
      )}
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
      <div data-no-nav className="flex items-center gap-2 pt-safe-3 pr-safe-4 pl-safe-4 text-sm">
        {controls}
      </div>
      <main
        {...surfaceProps}
        className="min-h-0 flex-1 touch-pan-y pt-2 pr-safe-4 pb-safe-4 pl-safe-4 select-none"
      >
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
