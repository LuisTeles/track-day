# Add a map from OpenStreetMap — design

- Date: 2026-10-06
- Roadmap: v2 "In-app OpenStreetMap outline import", pulled forward
- Status: Approved in conversation, pending spec review

## Intent

An AI-imported track has corners but no outline, so the track view shows only a corner list and practice mode has no corner diagrams. The user wants to add the real track shape from inside the deployed app: find the circuit, preview the outline with their corners on it, and save.

- **For:** anyone who imported a track. It runs in the browser on the static site, with no server and no API keys (ADR-001, ADR-003).
- **Success:** on the corners-only view, **Add map from OpenStreetMap** → search the circuit → pick it → preview → save → the full map view and practice diagrams work.
- **Decisions made in conversation:**
  - Find the circuit by **searching its name** (Nominatim). There is no paste-a-link fallback.
  - **Keep the layout's corners.** Corners whose number OpenStreetMap tags get OSM's exact position. The others are placed from `distanceFromStartMeters` as today. OSM never adds or removes corners.
  - Approach A: the script's geometry logic moves into a **shared, tested package** used by both the CLI script and the app.

## Out of scope

- Replacing or editing an existing outline. The button only appears for layouts without one.
- Hand-editing the outline or dragging markers (M2).
- Adding corners from OSM, or OSM names overwriting the user's names.
- A paste-a-link or map-picker way to find the circuit.
- A racing line (the script's illustrative racing line stays script-only).

## Architecture

```
packages/osm-track/          new: pure geometry, no I/O, no console
  src/lib.ts                 moved from scripts/osm-outline/lib.ts
  src/build.ts               buildTrackGeometry() + helpers moved from scripts/osm-outline/index.ts
  test/fixtures/             cached Overpass responses (Interlagos, Suzuka, Monaco), ODbL attribution
scripts/osm-outline/         thin CLI: fetch + cache, call the package, add names/segments/complexes, write examples/
apps/web/src/features/osm-map/
  osm-client.ts              Nominatim search + Overpass fetch (timeouts, one retry, readable errors)
  add-map-panel.tsx          search → pick → preview → save
  map-preview.tsx            outline + corner markers, labelled by position source
  use-save-map.ts            mutation → layoutGeometry.saveOutline
apps/web/src/data/           new LayoutGeometryService (interface + local implementation)
packages/schema/             Layout.outlineSource (optional)
```

### `@track-day/osm-track`

The entry point is:

```ts
buildTrackGeometry(
  elements: OsmElement[],
  options: { lengthMeters: number; direction: "clockwise" | "anticlockwise"; loopIndex?: number },
): TrackGeometryResult | TrackGeometryFailure
```

`TrackGeometryResult`:

| Field              | Meaning                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outlinePath`      | SVG path in the app's space (ADR-005): longest side 1000, y down, starting at the start/finish line, in the driving direction                      |
| `loopLengthMeters` | Measured length of the chosen loop                                                                                                                 |
| `loops`            | Every candidate loop within ±15% of `lengthMeters` (`{ lengthMeters, taggedCorners }`), sorted best first; `loopIndex` picks one (default 0)       |
| `start`            | `"tagged"` (OSM finish/start line node), `"approximate"` (halfway between the last tagged corner and T1) or `"arbitrary"`                          |
| `direction`        | `"oneway-tags"` or `"layout"`: how the loop was oriented                                                                                           |
| `corners`          | OSM-tagged corners on the loop, in lap order: `{ number, name, position (0–1), direction }`. Out-of-order tags are dropped, as in the script today |
| `warnings`         | Human-readable notes, e.g. "Loop is 3.1% longer than the layout length"                                                                            |

`TrackGeometryFailure` is `{ ok: false, reason: "no-raceway" | "no-loop", loopsFound: number[] }`.

Candidate ranking keeps the script's rule: the most tagged corners on the loop first, then the smallest length error. The tolerance widens from 5% to ±15% so a wrong AI lap length still finds the circuit; the preview then offers to fix the length (see Preview).

The script keeps what only it needs (segments, complexes, inferred-from-curvature corners, the illustrative racing line, per-track `details`) and builds those on the package's output plus helpers the package exports (`geometryOf`, `sharpestBetween`, `nearestByDistance`).

### OSM client (`osm-client.ts`)

- `searchPlaces(query): Promise<Place[]>`: Nominatim `/search?format=jsonv2&limit=5&q=…`. A `Place` is `{ id, name, description, bbox: [s, w, n, e] }`.
- `fetchRaceways(bbox): Promise<OsmElement[]>`: Overpass `way["highway"="raceway"](bbox);out body;>;out body qt;`, the same query as the script.
- Timeouts: 15 s for Nominatim and 60 s for Overpass. On HTTP 429 or 504 it retries **once** after 5 s.
- Errors become an `OsmError` with a user-facing `message` and a `kind`: `"offline" | "busy" | "not-found" | "too-large" | "network"`.
- A bbox with a diagonal over 10 km is rejected before querying Overpass (`"too-large"`). That means the user picked a city, not the circuit.
- Requests go out only when the user presses a button. There is no search-as-you-type (Nominatim usage policy, at most 1 request/s). Browsers can't set `User-Agent`; requests carry the normal `Referer`, which the policy accepts.

### Data: `LayoutGeometryService`

```ts
interface LayoutGeometryService {
  /** Sets the outline (source "osm") and, for matched corners, their pathPosition — one transaction. */
  saveOutline(input: {
    layoutId: string;
    outlinePath: string;
    outlineSource: "osm";
    cornerPositions: { cornerId: string; pathPosition: number }[];
    lengthMeters?: number; // only when the user accepted OSM's length
  }): Promise<void>;
}
```

- It throws if the layout already has an outline, so a stale panel can't overwrite one.
- Corners not listed keep their `pathPosition` (normally null), so the view falls back to `distanceFromStartMeters / lengthMeters`.
- Matching OSM corners to layout corners by number happens in the panel, not in this service.

### Schema: `Layout.outlineSource`

- New optional field `outlineSource: "osm" | null` on `Layout`, and on `TrackImportPayload.layout` so imported files and the samples can carry it.
- Optional, so old data and backups still parse: no `schemaVersion` bump and no migration.
- `scripts/osm-outline` writes `"osm"`. The Interlagos and Suzuka examples are regenerated with it.
- The track canvas and the practice corner diagram show "Map data © OpenStreetMap contributors" (linked to the OSM copyright page) when the layout's `outlineSource` is `"osm"`. This is the ODbL attribution the samples lack today.

## Flow and UI

1. **Entry.** In the no-outline view (`no-outline.tsx`), above the corner list, an **Add map from OpenStreetMap** button. It is disabled when `navigator.onLine` is false, with the reason shown.
2. **Search.** The panel opens with a search field prefilled with `"<track name> <city>"` (empty parts left out) and a **Search** button. Up to 5 results appear, each showing the name and Nominatim's description.
3. **Pick → fetch → build.** Picking a result fetches raceways for its bbox and runs `buildTrackGeometry` with the layout's length and direction. It shows "Looking up the circuit…" while working.
4. **Preview.**
   - The outline is drawn at the panel's size with the layout's corners as numbered markers. Each corner is labelled in a list as **"Position from OpenStreetMap"** or **"Placed from distance"**. Corners with neither (no OSM tag and no distance) are listed as **"Not on the map"**.
   - It shows the loop length next to the layout length, the start-line status ("Start line from OpenStreetMap" or "Start line approximate"), and any warnings.
   - When more than one loop matched, a **Loop** select lists them ("4,309 m · 15 tagged corners"), and changing it re-runs the build with that `loopIndex`.
   - When the loop length differs from the layout length by more than 2%, a checkbox reads "Use OpenStreetMap's length (4,312 m) for this layout". It is unchecked by default.
5. **Save.** **Save map** calls `saveOutline`, invalidates the track queries, and closes the panel. The track view re-renders as the full map. The button is disabled while saving.

The panel replaces the corner list inside the no-outline card (full-height, scrollable), so it works on phones without stacking a second side panel.

## Errors and edge cases

| Case                               | Behavior                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Offline                            | The button is disabled: "Adding a map needs an internet connection."                      |
| Nominatim returns nothing          | "No places found for '…'. Try the circuit's official name or the city."                   |
| bbox too large                     | "That area is too large — pick the circuit itself, not the city."                         |
| No raceway ways in the bbox        | "OpenStreetMap has no circuit mapped here", plus a link to the place on openstreetmap.org |
| No loop within ±15%                | "No loop near 4,309 m. Loops found: 3,120 m, 4,950 m." with the list from `loopsFound`    |
| Overpass 429/504 after the retry   | "OpenStreetMap is busy — try again in a minute."                                          |
| Timeout or network failure         | "Couldn't reach OpenStreetMap." plus a **Try again** button                               |
| No start/finish node               | Start placed as `"approximate"`; preview says so                                          |
| OSM tags a number the layout lacks | Ignored                                                                                   |
| Layout gained an outline meanwhile | `saveOutline` throws; panel shows "This layout already has a map."                        |
| Save fails                         | Transaction rolled back; error shown in the panel; preview kept                           |

## Testing

**`packages/osm-track` (Vitest, Node), on committed fixtures:**

- Interlagos: the loop is within 2% of 4309 m, `start` is `"tagged"`, corner positions increase in lap order, and the direction comes from one-way tags.
- Suzuka: `start` is `"approximate"` (no start/finish node in OSM).
- Monaco (street circuit): **no complete raceway loop exists in OSM** (it's mapped as ordinary roads), so the result is `no-loop` with `loopsFound`. Checked against the cached data while writing the plan. This is a real limit: street circuits often can't be added this way.
- `loops` lists alternatives and `loopIndex` selects them.
- No raceways gives `no-raceway`. A length far from any loop gives `no-loop` with `loopsFound`.
- **Script parity:** on the cached Interlagos and Suzuka data, the package produces the same `outlinePath` and tagged-corner `pathPosition`s as today's `examples/*.track.json`. Regenerating both examples through the refactored CLI changes only the new `outlineSource` line.

**Web (Vitest + Testing Library), network faked:**

- `osm-client`: request URLs and query; one retry on 429; timeout → `"network"`; oversize bbox → `"too-large"` without a request.
- `LocalLayoutGeometryService.saveOutline`:
  - writes the outline, source, matched positions and optional length in one transaction;
  - leaves the other corners untouched;
  - throws when an outline exists.
- `AddMapPanel`: search → results → pick → preview labels (OSM / distance / not on map) → save calls the service with the right corner ids. Also the loop select, the length checkbox, and the error states from the table.
- Attribution is shown for `outlineSource: "osm"` and hidden otherwise.

**E2E (Playwright):** with `page.route` serving recorded Nominatim and Overpass responses (Interlagos fixture), import Interlagos without geometry → **Add map from OpenStreetMap** → search → pick → preview shows "Position from OpenStreetMap" → **Save map** → the map renders with markers and the attribution. No live API calls in CI.

## Docs

- ADR-005: note that outlines can now come from the in-app OSM import, and the new `outlineSource`.
- `docs/PLAN.md`: tick the v2 item "In-app OpenStreetMap outline import" and add a note that it was pulled forward.
- `docs/data-model.md`: document `outlineSource`.
- `examples/ATTRIBUTION.md`: mention the test fixtures in `packages/osm-track/test/fixtures/`.
