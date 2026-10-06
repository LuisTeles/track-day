# Track Day — Project Plan

> A web app to record and study track knowledge — corners, reference points, speeds, gears — per car, so learning a new track (or a new car on a known track) has a structured starting point.

Example track used throughout: **Autódromo José Carlos Pace (Interlagos)**.

---

## 1. Goals & non-goals

**Goals (v1)**

- Create tracks quickly, with AI-assisted data entry via copy/paste JSON (no API keys, no paid services).
- Break a track into corners/segments, each with its own driving notes.
- Store car-specific guidance (an F1 car and a Miata drive Interlagos very differently), per sim.
- Run 100% in the browser, deployable for free, with data that survives refreshes and can be exported.
- Be a proper open-source project: typed, tested, linted, CI'd, documented, versioned.

**Non-goals (v1)**

- Telemetry ingestion, automatic lap analysis, "perfect lap" generation.
- User accounts, sync, multi-user sharing (beyond exporting/importing JSON files).
- Any backend.
- Video import (v2) — v1 prompts work from map images and screenshots.

The architecture must make adding those later a matter of _adding_ code, not rewriting it.

---

## 2. Architecture

### 2.1 Stack

| Concern            | Choice                                         | Why                                                                             |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Framework          | **Next.js (App Router) + TypeScript (strict)** | Static export (`output: "export"`) → free static hosting; no server ([ADR-003]) |
| Routing            | Next.js App Router                             | Static routes; record ids in query params (`/tracks/view?id=…`)                 |
| Server/async state | TanStack Query                                 | Same hooks work against IndexedDB now and HTTP later                            |
| Validation         | **Zod 4**                                      | Single source of truth for types + runtime validation; native JSON Schema       |
| Local storage      | **Dexie (IndexedDB)**                          | Structured, queryable, stores images as Blobs ([ADR-002])                       |
| UI                 | Tailwind + shadcn/ui (Radix)                   | Accessible primitives, no heavy component lib                                   |
| Forms              | React Hook Form + Zod resolver                 | Reuses the same schemas                                                         |
| Tests              | Vitest + Testing Library, Playwright (e2e)     | Unit / component / flow                                                         |
| Hosting            | Cloudflare Pages                               | Free, preview per PR, deploy from CI                                            |

[ADR-002]: adr/002-indexeddb-via-dexie.md
[ADR-003]: adr/003-nextjs-static-export.md

### 2.2 Repository layout (pnpm monorepo)

```
track-day/
├─ apps/
│  └─ web/                  # Next.js app (static export)
│     ├─ e2e/               # Playwright
│     └─ src/
│        ├─ app/            # routes, layout, providers
│        ├─ features/       # tracks/, corners/, cars/, guides/, import/, backup/
│        ├─ data/           # repository interfaces + implementations
│        │  ├─ repositories.ts      # interfaces (TrackRepository, CarRepository…)
│        │  ├─ local/               # Dexie implementations (v1)
│        │  └─ http/                # REST implementations (future)
│        └─ shared/         # ui components, utils
├─ packages/
│  ├─ schema/               # Zod schemas, inferred types, JSON Schema export, schemaVersion, migrations
│  └─ prompts/              # AI prompt templates (track import, car guide)
├─ examples/                # sample track JSON (the seed of the track library)
├─ docs/
│  ├─ adr/                  # Architecture Decision Records
│  └─ data-model.md
└─ .github/workflows/
```

Later: `apps/api/` (NestJS + Prisma) importing `@track-day/schema`.

### 2.3 Backend-ready rules

- **Repository pattern.** UI never touches Dexie directly. Features call `TrackRepository`, `CarRepository`, etc. v1 binds the `local/` implementation; later a config flag binds `http/`.
- **All repository methods are async.**
- **Client-generated UUIDs** (`crypto.randomUUID()`), so records created offline keep their IDs when synced.
- **`createdAt` / `updatedAt` / `deletedAt` (soft delete) on every entity** — enough for last-write-wins sync later (backup "merge" import already uses it).
- **Schemas live in `packages/schema`** and are the API contract.
- **`schemaVersion` on every export/import payload**, with migration functions between versions.
- **Images stored as Blobs with an `assetId`**, so they can later move to object storage (S3/R2).

---

## 3. Data model

See [data-model.md](data-model.md) for the field-level reference.

```
Track 1──* Layout 1──* Corner
                 1──* Segment (straights / sections between corners)
                 1──* CornerComplex (groups, e.g. Senna S = T1+T2)

CarClass 1──* Car

Guide (Layout × (Car | CarClass) × Sim?) 1──* CornerGuide (per Corner)
```

**Units:** speeds are km/h only for now. Field names carry the unit (`entrySpeedKmh`) so a unit preference can be added later without a data migration.

**Sims:** tracks list the sims they exist in, cars can belong to a sim, and guides are keyed by sim (`null` = any sim). Supported: real world, Assetto Corsa, ACC, AC EVO, iRacing, Le Mans Ultimate, rFactor 2, Automobilista 2, Gran Turismo 7, F1 (EA), other.

**Guide fallback rule** ([ADR-004](adr/004-guides-keyed-by-sim.md)): for a car in a sim, use the first that exists:

1. guide for this car, this sim
2. guide for this car, any sim
3. guide for the car's class, this sim
4. guide for the car's class, any sim

A guide for a _different_ sim is never used.

**Provenance:** AI-generated speeds and brake points are estimates. Everything coming from the AI import is `source: "ai"` and shown with a text badge until confirmed/edited after driving.

---

## 4. Feature 1 — Track creation with AI-assisted import

No API integration: the app hands you a prompt, you use any AI chat you like, you paste the result back.

1. **New track → "Import with AI".**
2. App generates a prompt (`packages/prompts`) with task instructions, the **JSON Schema** generated from the Zod schema (`z.toJSONSchema`), an Interlagos example, and rules (JSON only, `null` when unsure, never invent names).
3. **Copy prompt**, paste into ChatGPT/Claude/Gemini with the track map image or screenshots.
4. Paste the JSON back.
5. App validates and shows errors by field path (`corners[3].direction`), a preview before saving, and runs a lenient pre-pass (strips code fences, prose, trailing commas, smart quotes).
6. Save → upload the map image and drag corner markers into place.

Two templates: **track structure** (image → Track + Layout + Corners + Segments + Complexes) and **car guide** (track JSON + car specs + sim → Guide + CornerGuides, all `source: "ai"`).

The same format is the **backup and sharing** format.

## 5. Feature 2 — Corners

- Corner list in lap order + interactive map with numbered markers.
- Corner detail page: static info + the guide for the currently selected car/sim.
- Complex view with the complex-level note.
- Map editor: upload image, click to place/move markers (normalized coordinates).

## 6. Feature 3 — Cars

- CRUD for car classes and cars.
- **Global "driving with" selector** (car + sim) in the header, persisted per session.
- Compare view: same corner, two cars side by side.
- Seed data: Formula, GT3, GT4, Road car, Drift.

## 7. Feature 4 — Telemetry (future, out of scope)

- Needs a local companion app (Node/Python) or file import from existing tools.
- Future `Lap` / `TelemetrySample` entities referencing `layoutId` + `carId`; CornerGuide already accepts `source: "telemetry"`.
- "Perfect lap" = best-per-corner composite across your own laps.

## 8. Feature 5 — Open source & engineering practices

- MIT; TypeScript strict + `noUncheckedIndexedAccess`.
- ESLint + Prettier via Husky + lint-staged; Conventional Commits (commitlint) → release-please.
- Trunk-based; `main` protected; PRs require green CI.
- CI: install → format check → typecheck → lint → unit tests (coverage) → build → Playwright e2e on the static export.
- CD: Cloudflare Pages preview per PR, production on merge to `main`.
- Docs: README, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, ADRs.
- Accessibility: keyboard navigable, Radix primitives, AI badges have text, not just color.

---

## 9. Roadmap

### M0 — Foundation

- [x] pnpm monorepo (`apps/web`, `packages/schema`, `packages/prompts`)
- [x] Next.js (static export) + TS strict
- [x] ESLint, Prettier, Husky, lint-staged, commitlint
- [x] Vitest + Playwright setup
- [x] GitHub Actions CI
- [x] Deploy workflow (Cloudflare Pages — needs repository secrets)
- [x] README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT
- [x] ADR-001 frontend-only + repository pattern
- [x] ADR-002 IndexedDB via Dexie
- [x] ADR-003 Next.js static export
- [x] ADR-004 guides keyed by sim

### M1 — Data core

- [x] Zod schemas for all v1 entities
- [x] JSON Schema export script
- [x] Repository interfaces
- [x] Dexie implementations
- [x] Export/import full database as JSON (replace or merge)
- [x] Schema version + migration runner
- [x] Lenient JSON parser + field-path errors
- [x] Guide fallback rule (car/class × sim)

### M1.5 — Track view

Full-screen map of a layout ([ADR-005](adr/005-track-geometry.md)), pulled ahead of M2 so tracks can be explored as soon as they exist.

- [x] Outline, path positions and racing line in the schema
- [x] Track and guide import services (transactional)
- [x] Sample tracks from OpenStreetMap (Interlagos, Suzuka) + `scripts/osm-outline`
- [x] Layout shell: full-viewport canvas, side panel / bottom sheet
- [x] Track render with auto-fit, rotation, pan/zoom, reset
- [x] Corner markers with collision handling and leader lines
- [x] Speed/gear chips from the guide, with a toggle
- [x] Racing line layer

### M1.6 — Practice mode ([ADR-006](adr/006-practice-mode.md))

One corner per screen for a phone/tablet/second monitor next to the rig.

- [x] P0 — Guide fields (brake pressure, cue, downshift), prompt, sample data
- [x] P1 — Practice card
- [x] P2 — Navigation (keys, taps, swipes, corner/complex steps)
- [x] P3 — Rig ergonomics (wake lock, fullscreen, font scale)
- [x] P4 — Corner diagram from real geometry
- [x] P5 — Wheel button binding (experimental); spike result pending a check on the sim PC (ADR-006)
- [x] P6 — Offline (PWA), pulled forward from M5

### M2 — Tracks & corners

- [x] shadcn/ui setup
- [ ] Track/layout CRUD
- [ ] Corner CRUD + ordering
- [ ] Segments and complexes
- [ ] Cascade soft-delete (track → layouts → corners…)
- [ ] Map image upload
- [ ] Corner marker placement

### M3 — AI import

- [x] Track structure prompt template
- [x] Copy-prompt screen
- [x] Paste + lenient parse
- [x] Validation errors by field path
- [x] Preview before save
- [x] Interlagos fixture
- [x] Interlagos e2e test

### M4 — Cars & guides

- [ ] Car class / car CRUD + seed data
- [ ] Global car + sim selector
- [ ] Guide + CornerGuide editor
- [ ] Car → class fallback in the UI
- [x] Car guide prompt template
- [ ] AI-estimate badges + confirm action
- [ ] Two-car compare view

### M5 — Polish & v1.0.0

- [x] PWA (offline + installable) — done in M1.6 P6
- [ ] Responsive layout (second screen / tablet next to the rig)
- [ ] Sample track library in `/examples`
- [ ] First release via release-please

### v2 / Later

- [ ] Video import (frames or timestamped corner list from onboard video)
- [ ] In-app OpenStreetMap outline import (Overpass from the browser, checked against `lengthMeters`)
- [ ] Assetto Corsa `fast_lane.ai` import: racing line and outline in real meters, from a user-dropped file
- [ ] User-selectable speed units
- [ ] Backend (`apps/api`, NestJS + Prisma) behind `http/` repositories
- [ ] Auth + sync (last-write-wins on `updatedAt`)
- [ ] Public shared track library
- [ ] Telemetry companion app + lap import
- [ ] Composite "perfect lap" benchmark

---

## 10. Decisions log (formerly open questions)

- **Speed units:** km/h only for v1.
- **Guides keyed by sim:** yes — see ADR-004.
- **Video import:** deferred to v2.
- **Framework:** Next.js with static export instead of Vite — see ADR-003.
