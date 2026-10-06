# AI track import (M3) — design

- Date: 2026-10-06
- Milestone: M3 — AI import, plus the M2 item "shadcn/ui setup"
- Status: Approved in conversation, pending spec review

## Intent

Let the user add a track they actually drive without hand-writing JSON: copy a prompt, paste a map into any AI chat, paste the JSON answer back, see clear errors or a preview, save, and land on a page that shows the imported corners.

**In scope:** track-structure import only, shadcn/ui setup, a corner-list fallback in the track view, and an Interlagos e2e test.

**Out of scope:** guide import. It needs a car or car class as its target, and car CRUD arrives in M4, so the guide-import screen ships with M4. Map image upload and marker placement stay in M2.

## What already exists

| Piece                                                                                   | Where                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `buildTrackPrompt(known)` with known-facts section                                      | `packages/prompts/src/track.ts`              |
| `parseImport(raw, schema)`: lenient parse → migration → Zod, field-path issues          | `packages/schema/src/issues.ts`              |
| `TrackImportPayload` schema                                                             | `packages/schema`                            |
| `trackImport.importTrack(payload)`: transactional save, returns `{ trackId, layoutId }` | `apps/web/src/data/local/import-services.ts` |
| `IssueList` for field-path errors                                                       | `apps/web/src/shared/ui/issue-list.tsx`      |
| Interlagos sample                                                                       | `examples/interlagos.track.json`             |

The new work is mostly UI wiring on top of tested code.

## Screen: `/tracks/import/`

One page under the `(main)` layout with three numbered steps, all visible at once, so the prompt stays in view while the user fixes errors with the AI.

1. **Prompt**
   - Optional known-facts fields: track name, layout name, lap length (m), direction (clockwise / anticlockwise / unknown), corner count, sim (from the existing sim list, or none).
   - A collapsible preview of the generated prompt, updated as the fields change.
   - **Copy prompt** button. A short instruction: "Paste it into any AI chat together with a track map image."
2. **Paste**
   - Textarea for the AI's answer and a **Check JSON** button.
   - Errors show below it via `IssueList`. Editing the textarea clears a stale result (errors or preview).
3. **Preview** (only once the JSON is valid)
   - Read-only summary of what will be saved. **Save track** saves and navigates to the track view.

### Entry points

- An **Import with AI** link in the track list header (shown when tracks exist).
- An **Import with AI** button in the track list empty state, next to "Load sample tracks".
- The empty-state copy changes to mention importing your own track.

## Components

All in `apps/web/src/features/import/` unless noted.

| Unit                                | Responsibility                                                                                                                | Depends on                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `app/(main)/tracks/import/page.tsx` | Route; renders `TrackImportPage`                                                                                              | —                            |
| `track-import-page.tsx`             | Holds page state (facts, raw text, parse result, save status); lays out the three steps                                       | the units below              |
| `known-facts-form.tsx`              | Controlled fields → `KnownTrackFacts`. Empty or invalid fields are left out, not sent as `undefined` strings or `NaN`         | `@track-day/schema` sim list |
| `prompt-step.tsx`                   | `buildTrackPrompt(facts)`, prompt preview, copy with fallback                                                                 | `@track-day/prompts`         |
| `paste-step.tsx`                    | Textarea, `parseImport(raw, TrackImportPayload)`, `IssueList`                                                                 | `@track-day/schema`          |
| `track-preview.tsx`                 | Summary of a valid `TrackImportPayload`; duplicate-name warning                                                               | existing tracks (passed in)  |
| `use-import-track.ts`               | TanStack mutation around `trackImport.importTrack`; invalidates `queryKeys.all`; navigates to `/tracks/view/?track=<trackId>` | repositories, router         |

### Preview contents

- Track: name, aliases, country, city, sims.
- Layout: name, length in meters, direction.
- Corners in lap order: number, name (or "—"), direction, type, distance from start.
- Complexes (name → corner numbers) and segments (name, from → to corner).
- A text label "From AI — estimates until confirmed" (text, not only color).
- Duplicate warning, non-blocking: "You already have a track named …. Saving creates a separate track." Name match is case-insensitive and trimmed.

## Track view: corner list without an outline

AI-imported layouts have no `outlinePath` (the prompt tells the AI to leave geometry out). Today `track-view-page.tsx` then shows only "This layout has no outline yet" with no panel.

Change: when there is no outline, the canvas area shows the layout's corners in lap order (number, name, direction — the existing `CornerList`), with a short line saying the map appears once an outline is added. Selecting a corner opens the existing side panel with its details, since the panel is reused as-is. The top bar (track name, layout picker) stays as it is.

## shadcn/ui setup

- Run `shadcn init` in `apps/web` (Tailwind v4), aliases pointing at `@/shared/ui` for components and `@/shared/lib/utils` for `cn()`.
- Dependencies: `clsx`, `tailwind-merge`, `class-variance-authority`, and the Radix packages the added components need.
- **Keep the existing palette.** Map shadcn's token names onto the existing variables in `globals.css` (for example `--primary: var(--accent)`, `--primary-foreground: var(--accent-foreground)`, `--destructive: var(--danger)`, `--input: var(--border)`, `--ring: var(--accent)`), rather than adopting shadcn's default theme. Two shadcn names clash with existing tokens and are not aliased: `accent` (here the brand red, in shadcn a subtle hover background) and `muted` (here a text color, in shadcn a background). Components are written against the project's tokens (`hover:bg-surface`, `text-muted`), and anything added later with `shadcn add` must be adapted the same way. Light, dark and `[data-theme="practice"]` must look the same as before.
- Components added: `button`, `textarea`, `label`, `input`.
- Replace the custom `Button` (`src/shared/ui/button.tsx`) at its call sites with the shadcn one. `primary` → `default`, `secondary` → `outline`, matching the current look. `IssueList` stays.

## Errors and edge cases

| Case                                                   | Behavior                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Not JSON (stage `parse`)                               | `IssueList` titled "This isn't valid JSON"                                         |
| Unsupported `schemaVersion` (stage `version`)          | `IssueList` titled "This JSON is from an unsupported version"                      |
| Schema mismatch (stage `validate`)                     | `IssueList` titled "The JSON doesn't match the track format", issues by field path |
| Valid but `kind` isn't `"track"` (e.g. a guide pasted) | Covered by validation; no special case                                             |
| Save throws                                            | Alert with the message; transaction rolled back; pasted text kept for retry        |
| Duplicate track name                                   | Non-blocking warning in the preview                                                |
| Clipboard API missing or rejected                      | Select the prompt text and show "Press Ctrl/Cmd+C to copy"                         |
| Empty textarea                                         | **Check JSON** is disabled                                                         |

## Testing

**Unit / component (Vitest + Testing Library)**

- `KnownFactsForm`: empty fields are left out; lap length and corner count become numbers; invalid numbers are left out.
- `PromptStep`: the prompt includes the known lap length; copy calls the clipboard; the fallback message appears when the clipboard rejects.
- `PasteStep`: invalid JSON shows the parse title; a schema error shows its field path; the Interlagos sample wrapped in a code fence with prose produces a valid result.
- `TrackPreview`: lists corners in order; shows the duplicate warning only when the name matches.
- Track view: a layout without an outline renders its corner list.

**E2E (Playwright, `apps/web/e2e/import.spec.ts`)**

1. Open the app → **Import with AI**.
2. Enter lap length 4309 → the prompt preview contains "4309 m"; **Copy prompt** works (clipboard permission granted in the test context).
3. Paste the Interlagos sample with geometry removed (`outlinePath`, `racingLinePath`, `rotation`, corner `pathPosition`/`labelOffset`), wrapped in a ```json fence with prose before and after.
4. **Check JSON** → preview lists "S do Senna".
5. **Save track** → the URL is the track view, and the corner list shows T1 "S do Senna".
6. A second case pastes invalid JSON and checks that an error with a field path appears.

The existing smoke, track-view, practice and offline e2e tests must still pass (they cover the Button replacement and theme mapping).

## Docs

- `docs/PLAN.md`: tick "shadcn/ui setup" (M2) and the M3 items "Copy-prompt screen", "Paste + lenient parse", "Validation errors by field path", "Preview before save" and "Interlagos e2e test".
- `README.md` already describes the AI import; no change.
