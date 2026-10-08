# Track learning features — feasibility study (2026-10-08)

Goal: take a driver from "never seen this track" to "I can drive it in my head with my eyes closed". Every item below fits the project rules (no backend, no keys or paid services, IndexedDB behind repositories, Zod schemas with a backup `schemaVersion` bump per format change, ADR-008 design and accessibility) unless marked otherwise.

Effort scale, in this project's plan-and-review workflow: **S** = one small plan, 3–5 tasks; **M** = 6–10 tasks with a schema change and new screens; **L** = 10–15 tasks.

Full report: https://claude.ai/artifact/BKX9M4jfXeKECDmrfQfPmN

## Must-haves

| Feature                         | Fits?       | Effort | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboard video synced to the map | With limits | L      | YouTube embed (no key) or a local file picked each session. Corner times are marked by hand ("tap at each apex", ~5 min/lap) — an AI can't watch video. Dot on the map interpolates between marked corners. A `VideoNavigator` drives practice mode through the ADR-006 seam. Needs internet for YouTube; new `ReferenceVideo` record (per car guide, falling back to the layout) and backup v2. |
| Corner card gaps                | Yes         | M      | Most fields exist. Missing: braking-reference photos on the corner (Blob assets, resized to ~1600 px; paste or pick), and kerb use (none/some/full at entry/apex/exit + note) per car.                                                                                                                                                                                                           |
| Corner priority                 | Yes         | M      | Suggested ranking from geometry (straight length after the corner, exit speed), shown as an estimate; per-car override; per-car sequence notes on complexes; focus view and marker sizing.                                                                                                                                                                                                       |
| Audio lap                       | With limits | M      | Web Speech API, no key. Script from cue/brake/gear. Timing from video marks, else reference lap time over corner distances, else a fixed gap. Voices vary by device; iPhone stops speech when the screen locks. Spoken text also shown on screen.                                                                                                                                                |
| Quiz, flashcards, corner order  | Yes         | L      | Questions generated from existing data (only what's filled in). Spaced repetition (Leitner or SM-2). Order mode with keyboard move up/down. Progress in IndexedDB (in the backup), not localStorage. Feeds "weak corners".                                                                                                                                                                       |

## Race-specific (one plan, M)

- Per corner: overtaking (none/possible/prime) with attack, defend and risk notes; track limits; wet line; tyre wear.
- Per layout: lap 1 / turn 1 plan, restarts, pit speed limit, pit entry/exit, penalties, rubbering.
- A "race mode" switch in the side panel and practice. Rules are notes, not checks. Pit lane drawing needs geometry we don't store — out of scope.

## Extras

| Feature                                 | Fits?               | Effort | Notes                                                                                                                       |
| --------------------------------------- | ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Elevation and camber markers on the map | Yes                 | S      | From the existing per-corner `elevation`/`camber`. A "blind corner" flag is a later schema addition.                        |
| Measured elevation/camber profile       | No usable free data | L      | Free elevation APIs are ~30 m resolution and rate-limited; no free camber source. Only with a user-supplied elevation file. |
| Baseline setup per car                  | Yes                 | S      | `Guide.setupNotes` already exists; needs a screen.                                                                          |
| One-day study plan                      | Yes                 | S      | Checklist linking video → cards → audio → quiz → weak corners. Build after video and quiz.                                  |
| Printable cheat sheet                   | Yes                 | S      | Print page per track/layout/car: map + corner table; print CSS forces light colours.                                        |

## Suggested order

1. Video synced to the map (L)
2. Audio lap (M)
3. Quiz, spaced repetition, corner order (L)
4. Corner card gaps: kerbs and photos (M)
5. Corner priority (M)
6. Race-specific knowledge (M)
7. Small items: setup screen, elevation markers, cheat sheet, study plan

Steps 4–6 can share one backup format bump if built back to back.

## Open decisions (before the video plan)

1. Reference video per car or per layout? (Recommended: per car, falling back to the layout's.)
2. YouTube only, or local files too?
3. Quiz progress in the backup? (Recommended: yes.)
4. Race rules per layout, or per layout and series?
