"use client";

import {
  buildTrackGeometry,
  type OsmElement,
  type TrackGeometryResult,
} from "@track-day/osm-track";
import type { Corner, Layout, Track } from "@track-day/schema";
import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { OsmAttribution } from "@/shared/ui/osm-attribution";
import { MapPreview } from "./map-preview";
import { cornerPositionsToSave, matchCorners, type PositionSource } from "./match-corners";
import { OsmError, osmClient, type OsmClient, type Place } from "./osm-client";
import { useSaveMap } from "./use-save-map";

const SOURCE_LABEL: Record<PositionSource, string> = {
  osm: "Position from OpenStreetMap",
  distance: "Placed from distance",
  none: "Not on the map",
};

const START_LABEL: Record<TrackGeometryResult["start"], string> = {
  tagged: "Start line from OpenStreetMap",
  approximate: "Start line estimated — tap the outline to correct it",
  arbitrary: "Start line unknown — tap the start/finish line on the outline",
  chosen: "Start line set by you — tap again to adjust",
};

const meters = (n: number) => `${n.toLocaleString("en-US")} m`;

interface Problem {
  message: string;
  hint?: string;
  link?: string;
  /** Repeats the request that failed. */
  retry?: () => void;
}

const messageOf = (e: unknown) =>
  e instanceof OsmError ? e.message : "Couldn’t reach OpenStreetMap.";

export function AddMapPanel({
  track,
  layout,
  corners,
  onClose,
  client = osmClient,
}: {
  track: Track;
  layout: Layout;
  corners: Corner[];
  onClose(): void;
  client?: OsmClient;
}) {
  const id = useId();
  const [query, setQuery] = useState([track.name, track.city].filter(Boolean).join(" "));
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingPick, setLoadingPick] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [picked, setPicked] = useState<{ place: Place; elements: OsmElement[] } | null>(null);
  const [loopIndex, setLoopIndex] = useState(0);
  const [useOsmLength, setUseOsmLength] = useState(false);
  /** Where the user put the start line, as a lap fraction of the loop as built from OSM. */
  const [startAt, setStartAt] = useState<number | null>(null);
  // Only the latest pick may show its result.
  const pickToken = useRef(0);
  /** Aborts the raceway lookup in flight (Cancel lookup, or a newer search or pick). */
  const lookup = useRef<AbortController | null>(null);
  const save = useSaveMap(onClose);

  const lengthMeters = layout.lengthMeters;
  const base = useMemo(
    () =>
      picked && lengthMeters
        ? buildTrackGeometry(picked.elements, {
            lengthMeters,
            direction: layout.direction ?? "clockwise",
            loopIndex,
          })
        : null,
    [picked, lengthMeters, layout.direction, loopIndex],
  );
  // Same loop, restarted where the user put the start line.
  const result = useMemo(
    () =>
      base?.ok && picked && lengthMeters && startAt !== null
        ? buildTrackGeometry(picked.elements, {
            lengthMeters,
            direction: layout.direction ?? "clockwise",
            loopIndex,
            startAt,
          })
        : base,
    [base, picked, lengthMeters, layout.direction, loopIndex, startAt],
  );

  if (!lengthMeters) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          This layout has no lap length, so its circuit can’t be matched in OpenStreetMap.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  async function handleSearch() {
    // A new search supersedes any pick still loading.
    pickToken.current++;
    lookup.current?.abort();
    setLoadingPick(false);
    setSearching(true);
    setProblem(null);
    setPicked(null);
    try {
      setPlaces(await client.searchPlaces(query.trim()));
    } catch (e) {
      setPlaces(null);
      setProblem({ message: messageOf(e), retry: () => void handleSearch() });
    } finally {
      setSearching(false);
    }
  }

  async function handlePick(place: Place) {
    const token = ++pickToken.current;
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setLoadingPick(true);
    setProblem(null);
    setPicked(null);
    setLoopIndex(0);
    setUseOsmLength(false);
    setStartAt(null);
    try {
      const elements = await client.fetchRaceways(place.bbox, { signal: controller.signal });
      if (token !== pickToken.current) return;
      setPicked({ place, elements });
    } catch (e) {
      if (token !== pickToken.current) return;
      setProblem({ message: messageOf(e), retry: () => void handlePick(place) });
    } finally {
      if (token === pickToken.current) setLoadingPick(false);
    }
  }

  function cancelLookup() {
    pickToken.current++;
    lookup.current?.abort();
    setLoadingPick(false);
  }

  const failure =
    result && !result.ok
      ? result.reason === "no-raceway"
        ? {
            message: "OpenStreetMap has no circuit mapped here.",
            link: `https://www.openstreetmap.org/${picked!.place.id}`,
          }
        : {
            message: `No loop near ${meters(lengthMeters)}.${
              result.loopsFound.length > 0
                ? ` Loops found: ${result.loopsFound
                    .slice()
                    .sort((a, b) => Math.abs(a - lengthMeters) - Math.abs(b - lengthMeters))
                    .slice(0, 4)
                    .sort((a, b) => a - b)
                    .map(meters)
                    .join(", ")}.`
                : ""
            }`,
            hint: "Street circuits are often mapped as ordinary roads, not raceways.",
          }
      : null;
  const shown = problem ?? failure;

  const preview = result?.ok ? result : null;
  // OSM's own start line is trusted; an estimated or unknown one can be set by tapping.
  const startAdjustable = base?.ok === true && base.start !== "tagged";
  const needsStart = base?.ok === true && base.start === "arbitrary" && startAt === null;
  const finalLength = preview && useOsmLength ? preview.loopLengthMeters : lengthMeters;
  const matched = preview ? matchCorners(corners, preview.corners, finalLength) : [];
  const lengthOff =
    preview && Math.abs(preview.loopLengthMeters - lengthMeters) / lengthMeters > 0.02;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearch();
        }}
      >
        <Label htmlFor={`${id}-q`}>Circuit</Label>
        <div className="flex gap-2">
          <Input id={`${id}-q`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" disabled={searching || query.trim() === ""}>
            Search
          </Button>
        </div>
      </form>

      {places && (
        <ul aria-label="Places" className="space-y-1">
          {places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void handlePick(p)}
                aria-pressed={picked?.place.id === p.id}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface aria-pressed:border-foreground"
              >
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-muted">{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="text-sm text-muted">
        {searching && <p>Searching…</p>}
        {loadingPick && (
          <div className="flex flex-wrap items-center gap-3">
            <p>Fetching the circuit from OpenStreetMap — this can take a minute or two.</p>
            <Button variant="outline" onClick={cancelLookup}>
              Cancel lookup
            </Button>
          </div>
        )}
      </div>

      {shown && (
        <div role="alert" className="rounded-lg border border-danger/40 p-3 text-sm">
          <p className="text-danger">{shown.message}</p>
          {"hint" in shown && shown.hint && <p className="mt-1 text-muted">{shown.hint}</p>}
          {"link" in shown && shown.link && (
            <a
              href={shown.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline"
            >
              Open in OpenStreetMap
            </a>
          )}
          {"retry" in shown && shown.retry && (
            <Button variant="outline" className="mt-2" onClick={shown.retry}>
              Try again
            </Button>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <MapPreview
            outlinePath={preview.outlinePath}
            matched={matched}
            label={`Preview of ${track.name} from OpenStreetMap`}
            onPickStart={
              startAdjustable
                ? // The tap is measured on the outline as shown, which may already be restarted.
                  (f) => setStartAt(((((startAt ?? 0) + f) % 1) + 1) % 1)
                : undefined
            }
          />
          <OsmAttribution />
          <p className="text-sm">
            Loop {meters(preview.loopLengthMeters)} · layout {meters(lengthMeters)} ·{" "}
            {START_LABEL[preview.start]}
          </p>
          {startAdjustable && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-start`}>Start line position</Label>
              <input
                id={`${id}-start`}
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={(startAt ?? 0) * 100}
                onChange={(e) => setStartAt(Number(e.target.value) / 100)}
                className="w-full accent-accent"
              />
            </div>
          )}
          {preview.loops.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-loop`}>Loop</Label>
              <select
                id={`${id}-loop`}
                value={loopIndex}
                onChange={(e) => {
                  setLoopIndex(Number(e.target.value));
                  setStartAt(null);
                }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {preview.loops.map((l, i) => (
                  <option key={i} value={i}>
                    {meters(l.lengthMeters)} · {l.taggedCorners} tagged corners
                  </option>
                ))}
              </select>
            </div>
          )}
          {lengthOff && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOsmLength}
                onChange={(e) => setUseOsmLength(e.target.checked)}
              />
              Use OpenStreetMap&apos;s length ({meters(preview.loopLengthMeters)}) for this layout
            </label>
          )}
          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <ol
            aria-label="Corner positions"
            className="divide-y divide-border rounded-lg border border-border text-sm"
          >
            {matched.map(({ corner, source }) => (
              <li key={corner.id} className="flex justify-between px-3 py-1.5">
                <span>
                  T{corner.number}
                  {corner.name && <span className="text-muted"> · {corner.name}</span>}
                </span>
                <span className="text-muted">{SOURCE_LABEL[source]}</span>
              </li>
            ))}
          </ol>
          {save.error && (
            <p role="alert" className="text-sm text-danger">
              Could not save the map: {save.error.message}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        {preview && (
          <Button
            disabled={save.isPending || save.isSuccess || needsStart}
            onClick={() =>
              save.mutate({
                layoutId: layout.id,
                outlinePath: preview.outlinePath,
                outlineSource: "osm",
                cornerPositions: cornerPositionsToSave(matched),
                ...(useOsmLength && lengthOff && { lengthMeters: preview.loopLengthMeters }),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save map"}
          </Button>
        )}
      </div>
    </div>
  );
}
