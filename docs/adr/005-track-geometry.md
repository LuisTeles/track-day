# 005. Track geometry and coordinate conventions

- Status: Accepted
- Date: 2026-10-04

## Context

The track view draws a layout as a map with corner markers, speed/gear chips and an optional racing line. We need one coordinate convention that works for any track shape, survives zooming, and ties corner positions to the lap length the import already requires.

## Decision

- **Geometry lives on `Layout`** (each layout has its own shape): `outlinePath`, `rotation`, `racingLine`. Bounds are computed from the path at render time, never stored.
- **`outlinePath`** is SVG path data in a normalized space: longest side 1000 units, y down. It **starts at the start/finish line and runs in the driving direction**, so a fraction of the path's length equals a fraction of the lap.
- **Corners are positioned by `pathPosition`** (0–1, the apex). If it is missing, the view uses `distanceFromStartMeters / lengthMeters`. Corners with neither are listed but get no marker.
- **`labelOffset`** is in screen pixels (labels have a fixed screen size), and overrides automatic collision placement.
- **`rotation`** (degrees) is applied around the bounds center before fitting to the viewport.
- **`racingLine`** is `{ path, source }` in the same space. `source: "manual"` is the only value today; future sources (Assetto Corsa `fast_lane.ai`, telemetry) add a value and a producer function, and the renderer stays the same.
- **Pan/zoom uses `d3-zoom`**, because markers and collision checks need the zoom transform directly. Markers are HTML elements in a screen-space overlay, so they stay readable at any zoom and are keyboard-focusable.
- **Path math uses `svg-path-properties`**, which runs in Node, so the geometry is unit-tested without a browser.
- **Sample outlines come from OpenStreetMap** via `scripts/osm-outline` (ODbL; see `examples/ATTRIBUTION.md`). The script picks the raceway loop matching the official length, starts it at the tagged finish line, and orients it using OSM one-way tags.
- **Outlines can be added in the app** from OpenStreetMap (Nominatim search + Overpass, from the browser), using the same builder as the script (`packages/osm-track`). `Layout.outlineSource: "osm"` records the origin, and the views show the ODbL attribution for it. Only layouts without an outline can get one this way.

## Consequences

- Corner positions, distances and the lap length are consistent by construction.
- Imported geometry must follow the start/direction convention, or markers end up in the wrong places. The AI prompt tells the model to leave geometry out; it comes from map data or a future editor.
- `Corner.mapPosition` and `Layout.startFinish` (coordinates over a map image) were removed before release. The corner-guide line points became path fractions (`turnInAt`, `apexAt`, `exitAt`).
