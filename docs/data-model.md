# Data model

The source of truth is [`packages/schema/src/entities.ts`](../packages/schema/src/entities.ts). This page summarizes it.

All entities share `id` (UUID), `createdAt`, `updatedAt`, `deletedAt` (ISO 8601; `deletedAt` null unless soft-deleted). Unknown values are `null`.

| Entity            | Key fields                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**         | `name`, `aliases[]`, `country`, `city`, `sims[]` (`{ sim, trackId }`)                                                                                                                                                                                                                                                                                                                   |
| **Layout**        | `trackId`, `name`, `lengthMeters`, `direction` (clockwise/anticlockwise), `mapAssetId`, `outlinePath` (SVG path), `outlineSource` (`"osm"` or null; drives the OpenStreetMap attribution), `rotation`, `racingLine` (`{ path, source }`)                                                                                                                                                |
| **Corner**        | `layoutId`, `number`, `name`, `direction` (left/right), `type`, `elevation`, `camber`, `pathPosition` (0–1 along the outline), `labelOffset` (screen px), `order`, `distanceFromStartMeters`, `notes`, `commonMistakes[]`                                                                                                                                                               |
| **Segment**       | `layoutId`, `name`, `fromCornerId`, `toCornerId`, `notes`                                                                                                                                                                                                                                                                                                                               |
| **CornerComplex** | `layoutId`, `name`, `cornerIds[]` (≥ 2), `notes`                                                                                                                                                                                                                                                                                                                                        |
| **CarClass**      | `name`, `description`, `drivetrain`, `downforce`                                                                                                                                                                                                                                                                                                                                        |
| **Car**           | `name`, `classId`, `sim`, `powerHp`, `weightKg`, `drivetrain` (FR/MR/RR/FF/AWD), `downforce`, `transmission`, `abs`, `tc`                                                                                                                                                                                                                                                               |
| **Guide**         | `layoutId`, `target` (`{ carId }` or `{ carClassId }`), `sim` (null = any), `referenceLapTime`, `setupNotes`, `source`                                                                                                                                                                                                                                                                  |
| **CornerGuide**   | `guideId`, `cornerId`, `brakeReference`, `brakeMarkerMeters`, `entrySpeedKmh`, `minSpeedKmh`, `exitSpeedKmh`, `gear`, `line` (turn-in/apex/exit text + optional path fractions), `throttleNotes`, `trailBrakeNotes`, `priority` (entry/balanced/exit), `brakePressure`, `brakePressurePct`, `cue`, `downshiftTo` (practice mode, ADR-006), `source` (manual/ai/telemetry), `confidence` |
| **Asset**         | `mimeType`, `fileName`, `sizeBytes`, `width`, `height` — the Blob is stored separately                                                                                                                                                                                                                                                                                                  |

Geometry conventions (path space, start/finish, direction) are in [ADR-005](adr/005-track-geometry.md).

## Payloads

Every payload has `schemaVersion` and `kind`, and goes through `migrate()` before validation.

- **`kind: "track"`** — AI/hand-written track import. No ids; corners referenced by `number`. Requires `layout.lengthMeters`, `layout.direction` and every corner's `direction`; corner `distanceFromStartMeters` must be below the lap length and increase in lap order. Example: [`examples/interlagos.track.json`](../examples/interlagos.track.json).
- **`kind: "guide"`** — AI/hand-written car guide; corners referenced by `cornerNumber`. Layout, target and sim are chosen in the app.
- **`kind: "backup"`** — full database export, with assets as base64.

JSON Schemas for the import payloads: `pnpm --filter @track-day/schema json-schema` writes them to `packages/schema/json-schema/`.

## Changing the model

1. Edit the Zod schema.
2. If a payload shape changes, bump `CURRENT_SCHEMA_VERSION` and add a step to `migrations` in `packages/schema/src/migrations.ts`, with a test.
3. If Dexie indexes change, add a new `db.version(n)` in `apps/web/src/data/local/db.ts`.
