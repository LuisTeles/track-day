# Track Learning Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three small M6 items that need no data-model change: a car setup screen, elevation and camber markers on the map, and a printable cheat sheet.

**Architecture:** All three read data the app already stores (`Guide.setupNotes`, `Corner.elevation` / `Corner.camber`, corners plus the car's corner guides). No schema change, no backup format bump. New UI is reached from the track view's map toolbar (More menu and Layers menu) and follows ADR-008.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind 4.3, Radix primitives in `src/shared/ui`, TanStack Query, Vitest + Testing Library, Playwright + axe.

**Spec:** `docs/ideas/2026-10-08-track-learning.md` (the "Extras" table rows for setup, elevation markers and cheat sheet).

## Global Constraints

- All work in `apps/web`. No changes to `packages/*`, the Dexie schema, or `CURRENT_SCHEMA_VERSION`.
- Data access only through `useRepositories()` and TanStack Query hooks; never import Dexie in features.
- UI uses the shared primitives (`Button`, `IconButton`, `Textarea`, `DropdownMenu*`, `SidePanel`) and tokens only — no raw palette colours.
- Controls `h-10`, `pointer-coarse:h-11`; text ≥ 12px; every new page passes axe (add it to `e2e/a11y.spec.ts`).
- Every navigation or panel change from the track view goes through the existing unsaved-edits guard (`leaveEdits` / `guardLink` in `track-view-page.tsx`).
- Keep existing accessible names used by tests ("Zoom in", "Layers", "More map actions", "Edit", "Corners", "Reset view", "Redo map", "Keyboard shortcuts", "Speed & gear", "Racing line").
- Conventional Commits, scope `web`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Read `apps/web/AGENTS.md` before using Next.js APIs (this Next.js differs from training data).
- Verify with `pnpm --filter web test`, `typecheck`, `lint`, then `pnpm --filter web build && pnpm test:e2e`.

## Review Focus

1. **Unsaved setup edits** — leaving the setup panel (close, Escape, marker click, More → Cheat sheet, back link) with a dirty textarea asks first, like corner edits.
2. **Car without a guide** — a layout with no car: "Car setup" is disabled with a reason, the cheat sheet still prints corners with blank car columns.
3. **Layout without an outline** — the cheat sheet prints without a map (no crash), and the More menu (now always shown) hides map-only items.
4. **Print in dark mode** — the cheat sheet prints black on white even when the app is in dark theme.
5. **Marker labels crowding** — with Speed & gear and Elevation & camber both on, labels still stay inside the viewport (the existing `expectAllMarkersInViewport` e2e must pass with both layers on).

---

### Task 1: Car setup panel

**Files:**

- Create: `src/features/track-view/car-setup.tsx`, `src/features/track-view/car-setup.test.tsx`
- Modify: `src/features/track-view/edit/use-edit-mutations.ts`, `src/features/track-view/map-toolbar.tsx` (+ test), `src/features/track-view/track-view-page.tsx` (+ test), `e2e/editing.spec.ts`

**Interfaces:**

- Produces: `useSaveGuideSetup(trackId: string)` → mutation `({ guideId, setupNotes }) => repos.guides.update(guideId, { setupNotes })`, invalidating the same key `useSaveCorner` invalidates (check `query-keys.ts` that it covers `trackView`).
- Produces: `CarSetup({ guide, label, editing, trackId, onDirtyChange })`.
- Produces: `MapToolbarProps.carSetup: { available: boolean; open(): void }`. The More menu renders for every layout; map-only items (Reset view, Redo map, zoom items) stay conditional on `hasMap`.

- [ ] **Step 1: Failing component tests** (`car-setup.test.tsx`, stub `guides.update` via `RepositoriesProvider` as other tests do):
  - read mode shows the notes with line breaks kept; empty notes show "No setup notes for {label} yet." and, when not editing, "Turn on Edit to add them.";
  - edit mode shows a `Textarea` labelled "Setup notes" prefilled; typing marks "Unsaved changes"; Save (button "Save setup") calls `guides.update(id, { setupNotes })`; Ctrl/Cmd+Enter saves; a second Ctrl+Enter while pending does not save twice; `onDirtyChange(true)` while dirty and `false` on unmount.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement** `CarSetup` with the same save-bar pattern as `edit/corner-notes-form.tsx` (sticky bar, `-mx-3 px-3` if inside a `p-3` card, "Unsaved changes", `isPending` guard). Read mode: `whitespace-pre-line`.
- [ ] **Step 4: Wire into the track view.** URL `panel=setup` opens a `SidePanel` titled `Setup · {guide label}` showing `CarSetup` (editing when `edit=1`). The More menu gets "Car setup" (lucide `Wrench`), disabled with `title="Add a car first"` when there is no guide. Opening and closing go through `leaveEdits`; dirtiness reports under a new `dirty.setup` key so the existing guard covers it. Opening setup clears `corner`; selecting a corner clears `panel`.
- [ ] **Step 5: Tests:** toolbar test for the new item (enabled/disabled, `open` called); page tests: More → Car setup opens the panel; dirty setup + marker click asks "Discard unsaved changes?" and Keep editing keeps the text; e2e in `editing.spec.ts`: Edit → More → Car setup → type → Save → reload → text still there.
- [ ] **Step 6: Verify and commit** `feat(web): car setup panel for each car's baseline setup notes`.

### Task 2: Elevation and camber markers

**Files:**

- Create: `src/features/track-view/terrain.ts`, `src/features/track-view/terrain.test.ts`
- Modify: `src/features/track-view/corner-markers.tsx` (+ test), `src/features/track-view/map-toolbar.tsx` (+ test), `src/features/track-view/track-view-page.tsx`, `e2e/track-view.spec.ts`

**Interfaces:**

- Produces: `terrainOf(corner: Pick<Corner, "elevation" | "camber">): { text: string; description: string } | null`. Elevation words: uphill "Uphill", downhill "Downhill", crest "Crest", compression "Compression", flat → nothing. Camber: off-camber "Off-camber", positive "Banked", flat → nothing. `text` joins present words with " · "; `description` is the same in lower case for the marker's accessible name ("crest, off-camber"). Null when nothing to show.
- Produces: `CornerMarkers` prop `terrain?: boolean`; `estimateLabelSize(name, chip, terrain?: string | null)`.
- Produces: `MapToolbarProps.terrain: { on: boolean; disabled: boolean; toggle(): void }` → Layers checkbox "Elevation & camber".

- [ ] **Step 1: Failing tests:** `terrain.test.ts` covers every enum value, both-null → null, flat+flat → null, combined text. `corner-markers.test.tsx`: with `terrain` on, a corner with `elevation: "crest"` shows a "Crest" chip and its button name includes "crest"; with it off, no chip; `estimateLabelSize` grows with a terrain string.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** Terrain chip styled distinct from the speed chip (`bg-surface text-muted border-border`, `text-xs`), placed after the speed chip. Persist the toggle with `useStoredToggle("track-view:terrain", false)`; disable it when no corner on the layout has terrain. Add a Layers `DropdownMenuCheckboxItem` "Elevation & camber".
- [ ] **Step 4: e2e** in `track-view.spec.ts`: Layers → Elevation & camber → a marker shows a terrain word that the sample data actually has (check `examples/*.track.json` for a corner with `elevation` set and assert that word); then run `expectAllMarkersInViewport` with Speed & gear and Elevation & camber both on (Review Focus 5). If labels leave the viewport, fix placement (e.g. `edge`), never loosen the test.
- [ ] **Step 5: Verify and commit** `feat(web): show elevation and camber on the map`.

### Task 3: Printable cheat sheet

**Files:**

- Create: `src/app/tracks/print/page.tsx`, `src/features/cheat-sheet/cheat-sheet-page.tsx`, `src/features/cheat-sheet/print-map.tsx`, `src/features/cheat-sheet/rows.ts`, `src/features/cheat-sheet/rows.test.ts`, `src/features/cheat-sheet/cheat-sheet-page.test.tsx`
- Modify: `src/app/globals.css` (print rules), `src/features/track-view/map-toolbar.tsx` (+ test), `src/features/track-view/track-view-page.tsx`, `e2e/a11y.spec.ts`, new `e2e/cheat-sheet.spec.ts`

**Interfaces:**

- Consumes: `usePracticeSession(trackId, layoutId, guideId)` (track, layout, corners, guide, `guideFor`, `guideLabel`); `useTrackGeometry`, `fitToViewport`, `cornerFraction`; `brakeAtText`, `isEstimate`.
- Produces: route `/tracks/print/?track=&layout=&guide=` (Suspense wrapper like `tracks/view/page.tsx`, metadata title "Cheat sheet · Track Day").
- Produces: `cheatSheetRows(corners: Corner[], guideFor: (id: string) => CornerGuide | null): CheatSheetRow[]` with `{ number, name, direction, gear, brake, minSpeed, cue, estimate }` as display strings ("—" when empty; gear "3 ↓2" when downshift differs).
- Produces: `MapToolbarProps.cheatSheetHref: string` → More menu item "Cheat sheet" (lucide `Printer`) rendered as a link (`DropdownMenuItem asChild` + `Link`) whose click goes through `guardLink`.

- [ ] **Step 1: Failing tests:** `rows.test.ts` (empty guide → dashes; downshift text; estimate flag; brake text uses `brakeAtText`); `cheat-sheet-page.test.tsx` with a stub repository: heading shows track and layout, car label line, one table row per corner with "T1", no map when `outlinePath` is null, setup notes section only when the guide has them.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement the page.** Screen toolbar (`print:hidden`): "Back to track" link and a "Print" button calling `window.print()`. Sheet: title block (alias or name, layout, car, lap length in km); `PrintMap` — a static SVG (no zoom) of the rotated outline with numbered corner circles, fitted into a fixed `viewBox`, `role="img"` and `aria-label="Map of {track}, {layout}"`; the corner table (`<table>` with `<th scope="col">`, tabular numbers, rows `break-inside: avoid`, "est." suffix on estimate rows); the car's setup notes if any; OSM attribution when `outlineSource === "osm"`. The sheet is always light: wrap it in an element with `color-scheme: light` (the tokens use `light-dark()`, so this resolves them to light) and a white background.
- [ ] **Step 4: Print CSS** in `globals.css`: `@page { size: A4; margin: 12mm }`; `@media print` hides everything marked `print:hidden`, removes shadows, sets body background white, base font 10pt for the table. Aim for about 20 corners on one page.
- [ ] **Step 5: Entry point** in the More menu (works for layouts with and without a map). The href carries the current `track`, `layout` and `guide`.
- [ ] **Step 6: e2e** `cheat-sheet.spec.ts`: from Interlagos, More → Cheat sheet → table has a "T1" row and the map image; `page.emulateMedia({ media: "print", colorScheme: "dark" })` → sheet background computes to white and the Print button is hidden; add a `"print"` page to `a11y.spec.ts` (light and dark).
- [ ] **Step 7: Verify and commit** `feat(web): printable cheat sheet for a track and car`.

### Task 4: Docs

- [ ] Tick the three items in `docs/PLAN.md` M6, add one line each to `docs/data-model.md` only if a field's usage note changes (none expected), and commit `docs: mark the M6 quick wins done`.
