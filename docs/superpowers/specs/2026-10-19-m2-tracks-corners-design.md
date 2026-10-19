# M2 — Tracks & corners (design, 2026-10-19)

## Why

Today a track can only come from the AI import, the samples or a backup. Once it exists you can edit notes and car values, but not the track itself: a wrong corner number, a missing corner, a marker in the wrong place, a second layout, or a complex the AI forgot all mean editing JSON and re-importing. M2 closes that gap so a track can be built and fixed entirely in the app.

## Goals

- Create a track by hand (name, place, first layout) without the AI import.
- Edit the track's details and sims; add, edit and delete layouts.
- Add, edit, delete and reorder corners; place a corner's marker on the map.
- Add, edit and delete complexes and segments.
- Attach a reference map image to a layout.

## Non-goals

- Drawing or editing an outline by hand (outlines still come from OpenStreetMap or an import).
- Dragging markers; placement is click-to-place, like line points.
- Car and car-class management (M4).
- Undo. Deletes are soft deletes behind a confirm, and a backup restores them.

## Constraints

- No backend; everything goes through the repository interfaces (ADR-001).
- No change to entity schemas or the backup format: every field already exists (`Layout.mapAssetId`, `Corner.order`, `Segment`, `CornerComplex`). Map images are assets, which the backup already carries.
- ADR-008 design and accessibility: forms follow the existing edit forms (save / cancel, "Unsaved changes", Cmd/Ctrl+Enter, `role=alert` errors), touch targets ≥ 44 px on coarse pointers, a11y suite stays clean.
- Every editing surface plugs into the track view's unsaved-edits guard (`onDirtyChange`).

## Design

### Where things live

| What                                      | Where                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| New track                                 | `/tracks/new/` page, "New track" button on the home page            |
| Track details, sims, layouts, map image   | Track view, More menu → **Track details** (`panel=track`)           |
| Corner facts (number, name, type…), place | Corner panel in edit mode, above the existing notes form            |
| Add / reorder / delete corners            | Corner list (`panel=corners`) in edit mode                          |
| Complexes and segments                    | Track view, More menu → **Complexes & segments** (`panel=sections`) |

Panels are read-only outside edit mode and show forms in edit mode, like the car setup panel.

### New track

Form: track name (required), short name/alias, city, country, first layout name (default "Full circuit"), lap length in metres (optional), direction (optional). Creates the track and its layout, then opens the track view in edit mode with the corner list open, so the next step is "Add corner".

### Track details panel

- Track form: name, aliases (comma-separated), city, country, sims (checkbox per sim; the sim's own track id is kept for sims already listed, empty for new ones).
- Layouts list, each with an edit form: name, lap length, direction, rotation (degrees). "Add layout" creates an empty layout and switches to it. "Delete layout" asks first and soft-deletes the layout with its corners, segments, complexes, guides, corner guides and map image, in one transaction. The last layout cannot be deleted (delete the track instead).
- Map image for the current layout: pick a file (PNG/JPEG/WebP), downscaled in the browser to at most 1600 px on the longest side, stored as an asset. Replace and remove. Shown as a thumbnail that opens full size, and in the no-outline view. It is a reference picture only: geometry stays on the outline (ADR-005).

### Corners

- **Facts form** (edit mode, selected corner): number, name, direction, type, elevation, camber, distance from start. The number must be a positive integer, unique in the layout. Distance must be below the lap length when the length is known.
- **Place on map**: a "Place on map" button (needs an outline) arms a pick; the next click on the track sets `pathPosition`. Escape cancels. "Clear position" sets it back to null (the marker then falls back to the distance, or disappears).
- **Add corner**: creates the next number (highest + 1) at the end of the lap order, selects it and leaves the facts form open.
- **Reorder**: up/down buttons per row in the edit-mode list; saves through `corners.reorder`. Numbers are never renumbered automatically.
- **Delete corner**: asks first, then in one transaction soft-deletes the corner and its corner guides, removes it from complexes (soft-deleting a complex left with fewer than two corners), clears it from segments' from/to, and drops its marks from reference videos.

### Complexes and segments

One panel, two lists. Read-only: name, corners (`T1 + T2`), notes. Edit mode: per item an inline form; complexes pick corners with checkboxes (at least two), segments pick a from and a to corner (either may be empty). Add and delete (asks first).

### Data layer

- `CornerDeletionService.deleteCorner(cornerId)` and `LayoutDeletionService.deleteLayout(layoutId)`, Dexie implementations sharing the cascade helper with `LocalTrackDeletionService`.
- All other writes use the existing repository `create` / `update` / `remove` / `reorder`.
- Mutations invalidate `queryKeys.all` when they touch more than one track's view (create, delete) and `queryKeys.tracks()` otherwise, so the home list picks up renames.

## Left to the builder

Exact copy, layout within panels, how the map image is resized (canvas `drawImage` + `toBlob`), and test split, following the existing patterns.

## Calls made without asking (user skipped the questions)

1. Map image is a reference picture only, not a geometry source, because ADR-005 removed image coordinates.
2. Marker placement is click-to-place on the outline, not dragging.
3. Corner numbers are never renumbered automatically after a delete or reorder.
4. The last layout of a track can't be deleted.
5. Deleting a corner drops its corner guides and video marks rather than keeping orphans.
