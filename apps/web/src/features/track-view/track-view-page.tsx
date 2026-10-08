"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDetails, CornerList, cornerTitle } from "./corner-details";
import { CornerMarkers } from "./corner-markers";
import { DeleteTrackButton } from "./delete-track-button";
import { AddMapPanel } from "@/features/osm-map/add-map-panel";
import { NoOutline } from "./no-outline";
import { AddCarDialog } from "./edit/add-car-dialog";
import { CornerGuideForm } from "./edit/corner-guide-form";
import { CornerNotesForm } from "./edit/corner-notes-form";
import { CarLinesLayer, carLines } from "./edit/car-lines";
import { LinePoints, useLinePointPick } from "./edit/line-points";
import type { LinePoint } from "./geometry/nearest";
import { getRacingLine, RacingLineLayer } from "./racing-line";
import { cornerFraction } from "./geometry/anchors";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { Select } from "@/shared/ui/select";
import { MapToolbar } from "./map-toolbar";
import { SidePanel } from "./side-panel";
import { TrackCanvas, type TrackCanvasHandle } from "./track-canvas";
import { TrackViewShell } from "./track-view-shell";
import { useStoredToggle } from "@/shared/hooks/use-stored-toggle";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { CornerGuideSection } from "./corner-guide-section";
import { chipsFor, guideLabel } from "./guides";
import { useCornerGuides, useTrackView } from "./use-track-view";

const DISCARD = {
  title: "Discard unsaved changes?",
  description: "Your edits to this corner haven’t been saved.",
  confirmLabel: "Discard changes",
  cancelLabel: "Keep editing",
  destructive: true,
} as const;

/** `?track=<id>&layout=<id>&corner=<id>`; `panel=corners` opens the list. */
export function TrackViewPage() {
  const params = useSearchParams();
  const trackId = params.get("track");
  if (!trackId) return <Message>No track selected.</Message>;
  return <TrackView trackId={trackId} />;
}

function TrackView({ trackId }: { trackId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canvas = useRef<TrackCanvasHandle>(null);
  const { data, isPending, error } = useTrackView(trackId, params.get("layout"));
  const [showChips, toggleChips] = useStoredToggle("track-view:chips", true);
  const [showRacingLine, toggleRacingLine] = useStoredToggle("track-view:racing-line", true);
  const [redoingMap, setRedoingMap] = useState(false);
  const editing = params.get("edit") === "1";
  const [picking, setPicking] = useState<LinePoint | null>(null);
  const [addingCar, setAddingCar] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  const onCornerDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.corner === value ? d : { ...d, corner: value })),
    [setDirty],
  );
  const onGuideDirty = useCallback(
    (value: boolean) => setDirty((d) => (d.guide === value ? d : { ...d, guide: value })),
    [setDirty],
  );
  const confirm = useConfirm();
  const isDirty = () => Object.values(dirtyRef.current).some(Boolean);
  const clearEdits = () => {
    setDirty({});
    setPicking(null);
    setPickError(null);
  };
  /**
   * Runs `then` once dropping unsaved edits is fine: right away when there are
   * none (so a clean click acts in the same event, as before), otherwise only
   * after the user picks "Discard changes".
   */
  const confirmDiscard = (then: () => void) => {
    if (!isDirty()) return then();
    void confirm(DISCARD).then((ok) => ok && then());
  };
  /** Asks before dropping unsaved edits; on yes, clears the edit state first. */
  const leaveEdits = (then: () => void) =>
    confirmDiscard(() => {
      clearEdits();
      then();
    });
  /**
   * For links: a clean click navigates as usual. A dirty one is held back while
   * the dialog asks, then navigates on "Discard changes". Modified clicks open
   * a new tab or window, which leaves this page and its edits alone.
   */
  const guardLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isDirty()) return clearEdits();
    e.preventDefault();
    leaveEdits(() => router.push(href));
  };

  // Until the global car picker exists (M4), the layout's guides are picked here.
  const guide = data?.guides.find((g) => g.id === params.get("guide")) ?? data?.guides[0] ?? null;
  const { data: cornerGuides } = useCornerGuides(guide?.id ?? null);
  const chips = useMemo(() => (cornerGuides ? chipsFor(cornerGuides) : null), [cornerGuides]);

  const cornerId = params.get("corner");
  const listOpen = params.get("panel") === "corners";

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const selectCorner = (id: string) => {
    leaveEdits(() => setParams({ corner: id, panel: null }));
  };
  const closePanel = () => {
    leaveEdits(() => setParams({ corner: null, panel: null }));
  };
  const toggleEdit = () => {
    leaveEdits(() => setParams({ edit: editing ? null : "1" }));
  };

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A dialog over the pick (discard, far point, Add car) owns this Escape.
      if (document.querySelector("[role=alertdialog][data-state=open]")) return;
      // Capture phase + preventDefault: cancelling a pick must not also close the panel.
      e.preventDefault();
      setPicking(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [picking]);

  // Keep the selected corner out from under the side panel / bottom sheet.
  // Edit mode, its loaded form and a pick change the sheet's height on a
  // phone, so re-measure then too.
  const guidesLoaded = cornerGuides !== undefined;
  const selectedCorner = data?.corners.find((c) => c.id === cornerId);
  const selectedFraction =
    selectedCorner && data?.layout ? cornerFraction(selectedCorner, data.layout) : null;
  useEffect(() => {
    if (selectedFraction === null) return;
    const frame = requestAnimationFrame(() => {
      const panel = document.querySelector("[data-testid=side-panel]")?.getBoundingClientRect();
      if (!panel) return;
      const sheet = panel.width >= window.innerWidth - 1; // bottom sheet spans the full width
      canvas.current?.ensureVisible(
        selectedFraction,
        sheet
          ? { top: 64, bottom: window.innerHeight - panel.top }
          : { top: 64, right: window.innerWidth - panel.left },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedFraction, editing, picking, guidesLoaded]);

  const selectedGuide = cornerGuides?.find((g) => g.cornerId === cornerId);
  const pick = useLinePointPick({
    guideId: guide?.id ?? "",
    cornerId: cornerId ?? "",
    guide: selectedGuide,
    cornerFraction: selectedFraction,
    lengthMeters: data?.layout?.lengthMeters ?? null,
    point: picking ?? "apex",
    onDone: () => {
      setPicking(null);
      setPickError(null);
    },
    onError: setPickError,
  });
  const lines = useMemo(
    () =>
      data?.layout?.outlinePath && cornerGuides
        ? carLines({
            outlinePath: data.layout.outlinePath,
            lengthMeters: data.layout.lengthMeters,
            corners: data.corners,
            cornerGuides,
          })
        : [],
    [data, cornerGuides],
  );

  if (isPending) return <Message>Loading track…</Message>;
  if (error) return <Message>Could not load the track: {error.message}</Message>;
  if (!data) return <Message>This track doesn’t exist (it may have been deleted).</Message>;

  const { track, layouts, layout, corners, complexes, guides } = data;
  const racingLine = layout ? getRacingLine(layout) : null;
  const currentGuideLabel = guide
    ? guideLabel(guide, data.carClasses ?? [], data.cars ?? [])
    : null;
  const selected = corners.find((c) => c.id === cornerId) ?? null;
  const topPracticeHref = layout
    ? practiceHref(track.id, layout.id, params.get("guide"), selectedCorner?.number ?? null)
    : null;

  const topBar = (
    <>
      <Button asChild size="icon" variant="ghost">
        <Link
          href="/"
          onClick={(e) => guardLink(e, "/")}
          aria-label="Back to tracks"
          title="Back to tracks"
        >
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <h1 className="max-w-[40vw] truncate text-sm font-semibold">
        {track.aliases[0] ?? track.name}
        {layout && layouts.length === 1 && (
          <span className="font-normal text-muted"> · {layout.name}</span>
        )}
      </h1>
      {layouts.length > 1 && (
        <Select
          aria-label="Layout"
          value={layout?.id}
          onChange={(e) => {
            const layoutId = e.target.value;
            leaveEdits(() => setParams({ layout: layoutId, corner: null }));
          }}
          className="h-9 w-auto"
        >
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      )}
      {topPracticeHref && (
        <Button asChild size="sm" variant="secondary">
          <Link href={topPracticeHref} onClick={(e) => guardLink(e, topPracticeHref)}>
            <Play aria-hidden />
            Practice
          </Link>
        </Button>
      )}
      <DeleteTrackButton trackId={track.id} trackName={track.name} />
    </>
  );

  if (!layout) {
    return (
      <TrackViewShell
        topBar={topBar}
        canvas={<Message>This track has no layouts yet.</Message>}
        controls={null}
        panel={null}
      />
    );
  }

  const carPicker = (
    <Select
      aria-label="Car"
      value={guide?.id ?? "__none__"}
      onChange={(e) => {
        const value = e.target.value;
        if (value === "__add__") {
          // Opens after the discard dialog has closed, so the two never overlap.
          confirmDiscard(() => setAddingCar(true));
          return;
        }
        leaveEdits(() => setParams({ guide: value }));
      }}
      className="h-10 w-auto max-w-44 max-sm:max-w-28 pointer-coarse:h-11"
    >
      {guides.length === 0 && (
        <option value="__none__" disabled>
          No car yet
        </option>
      )}
      {guides.map((g) => (
        <option key={g.id} value={g.id}>
          {guideLabel(g, data.carClasses ?? [], data.cars ?? [])}
        </option>
      ))}
      <option value="__add__">+ Add car…</option>
    </Select>
  );

  const toggleList = () => {
    leaveEdits(() => setParams({ panel: listOpen ? null : "corners", corner: null }));
  };
  const toolbar = (
    <MapToolbar
      hasMap={layout.outlinePath !== null}
      onZoomIn={() => canvas.current?.zoomBy(1.5)}
      onZoomOut={() => canvas.current?.zoomBy(1 / 1.5)}
      onReset={() => canvas.current?.reset()}
      chips={{ on: showChips, disabled: !guide, toggle: toggleChips }}
      racingLine={{
        on: showRacingLine && (racingLine !== null || lines.length > 0),
        disabled: !racingLine && lines.length === 0,
        toggle: toggleRacingLine,
      }}
      editing={editing}
      onToggleEdit={toggleEdit}
      carPicker={carPicker}
      listOpen={listOpen}
      onToggleList={toggleList}
      redoMap={{
        available: layout.outlineSource === "osm",
        active: redoingMap,
        open: () => {
          leaveEdits(() => setRedoingMap(true));
        },
      }}
    />
  );

  const cornerPracticeHref = selected
    ? practiceHref(track.id, layout.id, params.get("guide"), selected.number)
    : "";
  const panel = (
    <>
      <SidePanel
        open={selected !== null || listOpen}
        title={selected ? cornerTitle(selected) : "Corners"}
        onClose={closePanel}
      >
        {selected ? (
          <CornerDetails
            corner={selected}
            complexes={complexes}
            allCorners={corners}
            onSelect={selectCorner}
            actions={
              <Button asChild variant="secondary" className="w-full">
                <Link href={cornerPracticeHref} onClick={(e) => guardLink(e, cornerPracticeHref)}>
                  <Play aria-hidden />
                  Practice from T{selected.number}
                </Link>
              </Button>
            }
            hideNotes={editing}
            guide={
              editing ? (
                <div className="space-y-4">
                  <CornerNotesForm
                    key={selected.id}
                    trackId={track.id}
                    corner={selected}
                    onDirtyChange={onCornerDirty}
                  />
                  {guide && currentGuideLabel && !cornerGuides ? (
                    // The form's draft starts from the stored values: wait for them.
                    <p className="text-sm text-muted">Loading…</p>
                  ) : guide && currentGuideLabel ? (
                    <CornerGuideForm
                      key={`${guide.id}:${selected.id}`}
                      guideId={guide.id}
                      cornerId={selected.id}
                      label={`${currentGuideLabel} · T${selected.number}`}
                      guide={selectedGuide}
                      onDirtyChange={onGuideDirty}
                    >
                      <LinePoints
                        guideId={guide.id}
                        cornerId={selected.id}
                        guide={selectedGuide}
                        cornerFraction={selectedFraction}
                        lengthMeters={layout.lengthMeters}
                        hasOutline={layout.outlinePath !== null}
                        picking={picking}
                        onPickStart={(p) => {
                          setPickError(null);
                          setPicking(p);
                        }}
                        onPickEnd={() => setPicking(null)}
                        onError={setPickError}
                      />
                      {pickError && (
                        <p role="status" className="text-sm text-danger">
                          {pickError}
                        </p>
                      )}
                    </CornerGuideForm>
                  ) : (
                    <section className="space-y-2 rounded-lg border border-dashed border-border p-3 text-muted">
                      <p>Add a car to record its values for this corner.</p>
                      <Button type="button" variant="outline" onClick={() => setAddingCar(true)}>
                        Add car
                      </Button>
                    </section>
                  )}
                </div>
              ) : (
                guide &&
                currentGuideLabel && (
                  <CornerGuideSection guide={selectedGuide} label={currentGuideLabel} />
                )
              )
            }
          />
        ) : (
          <CornerList corners={corners} onSelect={selectCorner} />
        )}
      </SidePanel>
      {addingCar && (
        <AddCarDialog
          open
          onOpenChange={setAddingCar}
          track={track}
          layout={layout}
          corners={corners}
          carClasses={data.carClasses ?? []}
          onAdded={(guideId) => {
            setAddingCar(false);
            setDirty({});
            setPicking(null);
            setPickError(null);
            setParams({ guide: guideId });
          }}
        />
      )}
    </>
  );

  if (!layout.outlinePath) {
    return (
      <TrackViewShell
        topBar={topBar}
        canvas={
          <NoOutline track={track} layout={layout} corners={corners} onSelect={selectCorner} />
        }
        controls={toolbar}
        panel={panel}
      />
    );
  }

  return (
    <TrackViewShell
      topBar={topBar}
      canvas={
        <>
          <TrackCanvas
            ref={canvas}
            outlinePath={layout.outlinePath}
            rotation={layout.rotation}
            lengthMeters={layout.lengthMeters}
            trackLayers={() =>
              showRacingLine && (
                <>
                  {racingLine && <RacingLineLayer line={racingLine} dim={lines.length > 0} />}
                  <CarLinesLayer lines={lines} />
                </>
              )
            }
            onPick={
              editing && picking && cornerGuides
                ? (f) =>
                    void pick(f).catch((e: Error) => setPickError(`Could not save: ${e.message}`))
                : undefined
            }
            label={`Map of ${track.name}, ${layout.name} layout`}
            overlay={(ctx) => (
              <CornerMarkers
                ctx={ctx}
                layout={layout}
                corners={corners}
                selectedId={selected?.id ?? null}
                onSelect={selectCorner}
                chips={showChips ? chips : null}
              />
            )}
          />
          {layout.outlineSource === "osm" && (
            <OsmAttribution className="absolute right-2 bottom-1 z-10 rounded bg-background/80 px-1.5 max-md:bottom-16" />
          )}
        </>
      }
      controls={toolbar}
      panel={
        redoingMap ? (
          <SidePanel open title="Redo map from OpenStreetMap" onClose={() => setRedoingMap(false)}>
            <AddMapPanel
              track={track}
              layout={layout}
              corners={corners}
              onClose={() => setRedoingMap(false)}
              replace
            />
          </SidePanel>
        ) : (
          panel
        )
      }
    />
  );
}

function practiceHref(track: string, layout: string, guide: string | null, corner: number | null) {
  const q = new URLSearchParams({ track, layout });
  if (guide) q.set("guide", guide);
  if (corner !== null) q.set("corner", String(corner));
  return `/tracks/practice/?${q}`;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-canvas p-6 text-center text-muted">
      <div className="space-y-3">
        <p>{children}</p>
        <Link href="/" className="text-sm underline">
          Back to tracks
        </Link>
      </div>
    </div>
  );
}
