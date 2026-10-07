# Edit corner notes, car guidance and line in the app — design

- Date: 2026-10-07
- Roadmap: parts of M2 (corner editing) and M4 (car + guide editor), pulled forward
- Status: Approved in conversation, pending spec review

## Intent

Today corner notes, car-specific values and line points only arrive through import, so what the user learns on track can't be written down. The user wants to record, per corner, notes that hold for any car and notes and values for the car they're driving, mark the line they want to take, and see all of it in practice mode.

- **For:** a single user, editing and practising on the same device.
- **Success:** on a track, pick or add a car → edit a corner's notes and the car's speeds, gear, brake point, cue and notes → place turn-in, apex and exit on the map and see a line drawn through them → open practice mode and see the values, notes and line on that corner's card; jot a quick note from practice and find it back in the track view.
- **Decisions made in conversation:**
  - **No backend.** Editing and practice happen on one device, so IndexedDB plus the existing JSON backup is enough. ADR-001's repository layer keeps the door open.
  - **Line from points (approach A).** The user picks where along the track turn-in, apex and exit are; the app puts them on the correct side of the track automatically and draws a smooth line. No freehand drawing, no sideways dragging.
  - **Two kinds of notes**, both editable and both shown in practice: corner notes (any car) and car notes for that corner.
  - **Cars:** start one from scratch in the app, or start from an AI guide and edit it.
  - **Where to edit:** a full editor in the track view; practice mode only gets a quick-note button.

## Out of scope

- A backend, accounts or sync.
- Freehand line drawing, or dragging line points sideways across the track (a later extension of approach A: one lateral offset per point).
- Adding, removing or reordering corners; editing segments and complexes.
- Car class management beyond picking or naming one in the Add car dialog; car specs (power, weight…).
- Two-car compare view.

## Architecture

```
packages/schema/
  src/entities.ts               CornerGuide.notes (optional, default "")
apps/web/src/features/
  track-view/
    track-view-page.tsx         Edit toggle (?edit=1), car picker + "Add car"
    edit/
      corner-notes-form.tsx     corner notes + common mistakes
      corner-guide-form.tsx     car values + car notes, create-on-first-save
      line-points.tsx           Set turn-in / apex / exit, clear, order check
      add-car-dialog.tsx        name, sim, class; start empty or paste AI guide
      use-corner-mutations.ts   React Query mutations over the repositories
    geometry/
      corner-line.ts            cornerLine(): points → generated racing line
      nearest.ts                nearestFraction(): map point → path position
  practice/
    practice-card.tsx           notes area
    quick-note.tsx              Note button + sheet
docs/adr/007-line-from-points.md
```

All writes go through `useRepositories()` (ADR-001); the repositories already have `create` and `update`, so no new repository methods are needed.

### Schema: `CornerGuide.notes`

`notes: z.string().optional().default("")` — free text for the car at this corner. Optional so stored records, backups and guide payloads without it still parse: no schema version bump, no migration, no Dexie index change (same precedent as `Layout.outlineSource`). The guide import payload accepts it too, so the AI prompt may fill it later.

### `cornerLine()`

```ts
cornerLine(input: {
  path: TrackPath;
  unitsPerMeter: number;
  corners: { direction: "left" | "right" | null; turnIn: number | null; apex: number | null; exit: number | null }[];
}): { points: Point[]; estimated: boolean } | null
```

- Each set position is a point on the centerline, moved along the track's normal by half a **nominal 12 m width** (6 m × `unitsPerMeter`): turn-in and exit to the outside, apex to the inside. Outside is the opposite side of the corner's `direction`. The outline runs in the driving direction (ADR-005), so the left/right normal comes from the path's tangent alone.
- One extra outside point 40 m before turn-in and one 40 m after exit so the line joins the edge, then a centripetal Catmull-Rom curve through all points.
- Only the apex set: turn-in and exit are estimated at 60 m before and 50 m after it, and `estimated: true`.
- No apex, or no `direction`: returns `null` (markers still draw, no line).
- Several corners (a complex in practice): one curve through all their points in lap order.
- Fractions are unwrapped so a corner across the start/finish line works.

### Which line is drawn

Where the selected car has points for a corner, its generated line is drawn for that corner; elsewhere the layout's imported `racingLine` is drawn as today. Applies to the track view's racing line layer and to the practice diagram. `cornerDiagram` receives the generated points and keeps its slicing and orientation logic unchanged.

## Flow and UI

### Track view, edit mode

- Toolbar **Edit** toggle, kept in the URL (`?edit=1`) like `guide`. Off: the view is unchanged.
- The toolbar's guide dropdown is the car picker, with **+ Add car** at the bottom.
- The side panel (bottom sheet on a phone) shows two cards for the selected corner, each with Save and Cancel:
  - **Corner notes (all cars):** notes textarea; common mistakes, one per row, add and remove.
  - **"<car> · T4":** entry, minimum and exit speed (km/h); gear and downshift; brake reference text and board meters; pressure (none/light/firm/heavy) and %; cue with a counter against `CUE_MAX_LENGTH` (160); throttle notes; trail-brake notes; car notes. All optional; an empty field saves `null` (or `""` for notes). With no `CornerGuide` for this corner yet, the first save creates one.
  - Values are validated with the schema's Zod types before saving; errors show next to the field.
  - Saving a guide whose `source` is `"ai"` sets it to `"manual"` and clears `confidence`, removing the AI estimate badge for that corner.
- **Line points** (in the car card): **Set turn-in**, **Set apex**, **Set exit**. Press one, then click or tap the map: the point snaps to the nearest position on the outline (`nearestFraction`, accounting for the zoom transform), saves to `line.turnInAt` / `apexAt` / `exitAt`, and the markers and line redraw. A "×" clears a point. Turn-in → apex → exit must run in lap order (unwrapped across start/finish); out of order shows a warning and does not save. A point more than 300 m from the corner's `pathPosition` gets a soft "are you sure" warning. The car's apex is separate from the corner's `pathPosition`, which only positions the corner label. Without an outline the buttons are disabled with a hint to add a map from OpenStreetMap.

### Add car

A dialog with:

- **Name** (required), **sim** (the schema's `SIMS`, or "any"), **class**: pick an existing class or type a new name (defaults to "Other"); `Car.classId` is required by the schema.
- **Start empty** creates the `Car` and a `Guide` (`target: { carId }`, `source: "manual"`) for this layout and selects it.
- **Start from an AI guide** shows the existing car guide prompt from `@track-day/prompts` and a paste box (reusing the import feature's prompt and paste steps), then calls `GuideImportService.importGuide` with `target: { carId }`. Imported values carry the AI badge until edited.

### Practice mode

- Below the cue, a **Notes** area: car notes first, then corner notes, clamped to a few lines; tap to expand. Common mistakes appear only expanded. Text follows `--practice-scale`.
- The diagram shows the generated line when the car has points.
- A **Note** button opens a one-field sheet. Saving appends `YYYY-MM-DD: <text>` on a new line to the car's notes for the current corner (creating the `CornerGuide` if needed). With no car selected it appends to the corner notes, and the sheet says so. While the sheet is open, keyboard, swipe and wheel-button navigation are paused.

## Errors and edge cases

- **Save fails** (IndexedDB error, quota): the form keeps the input and shows an inline error with Retry. Each save is one repository call, so nothing is half-written.
- **Validation:** speeds positive, gear and downshift 1–10, brake % 0–100, cue ≤ 160 characters — the schema's limits.
- **Unsaved edits:** switching corner, car or leaving edit mode asks first.
- **Quick note fails:** the sheet stays open with the text.
- **Backups:** `notes` is exported and imported with the rest; older backups import with `""`.
- **Layout without an outline:** notes and values are editable; line points are disabled.

## Testing

Existing setup: Vitest with fake-indexeddb, Testing Library, Playwright against the built app.

- `cornerLine`: left and right corners, on clockwise and anticlockwise fixtures, apex only (estimated), missing direction or apex (null), a corner across start/finish, a two-corner complex.
- `nearestFraction` and the order check, including wrap across start/finish.
- Schema: `CornerGuide` with and without `notes`; backup round-trip keeps it; guide payload accepts it.
- Components: corner notes form; corner guide form (save, cancel, validation, create on first save, `ai` → `manual`); line points (set, clear, out-of-order warning); Add car (empty and from AI guide); practice notes area; quick-note sheet (append with date, no-car fallback, navigation paused).
- E2E on Interlagos: add a car, fill T1 values and a note, place turn-in, apex and exit, open practice, check values, note and diagram line; add a quick note and find it in the track view.

## Docs

- `docs/data-model.md`: `CornerGuide.notes`.
- ADR-007: racing line from points with automatic sides and a nominal width.
- `docs/PLAN.md`: add "Corner notes editing" under M2 (Corner CRUD stays open) and tick the Guide + CornerGuide editor under M4; add to the decisions log that the backend stays deferred while editing and practice happen on one device.
