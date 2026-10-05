import { z } from "zod";
import { Confidence, PathFraction, ScreenOffset, SpeedKmh, SvgPath } from "./common";
import {
  Asset,
  Camber,
  Car,
  CarClass,
  Corner,
  CornerComplex,
  CornerDirection,
  CornerGuide,
  CornerPriority,
  CornerType,
  Elevation,
  Guide,
  Layout,
  Segment,
  Track,
  TrackDirection,
} from "./entities";
import { SimId } from "./sim";

/** Bump when a payload shape changes, and add a migration in `migrations.ts`. */
export const CURRENT_SCHEMA_VERSION = 1;

// The import payloads are what an AI (or a human) writes by hand: no ids, no
// timestamps, corners referenced by number. Unknown values are `null`, and
// optional fields may be omitted entirely.

const opt = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

// ---------------------------------------------------------------------------
// Track import
// ---------------------------------------------------------------------------

export const TrackImportCorner = z.object({
  number: z.number().int().positive(),
  name: opt(z.string().min(1)),
  direction: CornerDirection,
  type: opt(CornerType),
  elevation: opt(Elevation),
  camber: opt(Camber),
  pathPosition: opt(PathFraction),
  labelOffset: opt(ScreenOffset),
  distanceFromStartMeters: opt(z.number().nonnegative()),
  notes: opt(z.string()),
  commonMistakes: opt(z.array(z.string())),
});
export type TrackImportCorner = z.infer<typeof TrackImportCorner>;

export const TrackImportPayload = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    kind: z.literal("track"),
    track: z.object({
      name: z.string().min(1),
      aliases: opt(z.array(z.string().min(1))),
      country: opt(z.string()),
      city: opt(z.string()),
      sims: opt(z.array(z.object({ sim: SimId, trackId: opt(z.string()) }))),
    }),
    layout: z.object({
      name: z.string().min(1),
      /** Required: corner distances are positioned against it. */
      lengthMeters: z.number().positive(),
      direction: TrackDirection,
      /** Optional; see ADR-005 for the coordinate conventions. */
      outlinePath: opt(SvgPath),
      rotation: opt(z.number().min(-360).max(360)),
      racingLinePath: opt(SvgPath),
    }),
    /** In lap order. */
    corners: z.array(TrackImportCorner).min(1),
    complexes: opt(
      z.array(
        z.object({
          name: z.string().min(1),
          cornerNumbers: z.array(z.number().int().positive()).min(2),
          notes: opt(z.string()),
        }),
      ),
    ),
    segments: opt(
      z.array(
        z.object({
          name: z.string().min(1),
          fromCorner: opt(z.number().int().positive()),
          toCorner: opt(z.number().int().positive()),
          notes: opt(z.string()),
        }),
      ),
    ),
  })
  .superRefine((payload, ctx) => {
    const numbers = new Set<number>();
    payload.corners.forEach((corner, i) => {
      if (numbers.has(corner.number)) {
        ctx.addIssue({
          code: "custom",
          path: ["corners", i, "number"],
          message: `Duplicate corner number ${corner.number}`,
        });
      }
      numbers.add(corner.number);
    });

    // Corner distances must fit in the lap and follow lap order.
    let previous = -1;
    payload.corners.forEach((corner, i) => {
      const d = corner.distanceFromStartMeters;
      if (d == null) return;
      if (d >= payload.layout.lengthMeters) {
        ctx.addIssue({
          code: "custom",
          path: ["corners", i, "distanceFromStartMeters"],
          message: `Must be less than the layout length (${payload.layout.lengthMeters} m)`,
        });
      } else if (d <= previous) {
        ctx.addIssue({
          code: "custom",
          path: ["corners", i, "distanceFromStartMeters"],
          message: "Must be greater than the previous corner's distance (corners are in lap order)",
        });
      }
      previous = Math.max(previous, d);
    });

    // Path positions follow lap order too.
    let previousPosition = -1;
    payload.corners.forEach((corner, i) => {
      const p = corner.pathPosition;
      if (p == null) return;
      if (p <= previousPosition) {
        ctx.addIssue({
          code: "custom",
          path: ["corners", i, "pathPosition"],
          message: "Must be greater than the previous corner's position (corners are in lap order)",
        });
      }
      previousPosition = Math.max(previousPosition, p);
    });

    payload.complexes?.forEach((complex, i) => {
      complex.cornerNumbers.forEach((n, j) => {
        if (!numbers.has(n)) {
          ctx.addIssue({
            code: "custom",
            path: ["complexes", i, "cornerNumbers", j],
            message: `Corner ${n} does not exist`,
          });
        }
      });
    });

    payload.segments?.forEach((segment, i) => {
      for (const key of ["fromCorner", "toCorner"] as const) {
        const n = segment[key];
        if (n != null && !numbers.has(n)) {
          ctx.addIssue({
            code: "custom",
            path: ["segments", i, key],
            message: `Corner ${n} does not exist`,
          });
        }
      }
    });
  });
export type TrackImportPayload = z.infer<typeof TrackImportPayload>;

// ---------------------------------------------------------------------------
// Guide import
// ---------------------------------------------------------------------------

/**
 * A car guide for a layout. The layout, target car/class and sim are chosen
 * in the app, not by the AI, so they are not part of this payload.
 */
export const GuideImportPayload = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  kind: z.literal("guide"),
  guide: z.object({
    referenceLapTime: opt(z.string()),
    setupNotes: opt(z.string()),
  }),
  corners: z.array(
    z.object({
      cornerNumber: z.number().int().positive(),
      brakeReference: opt(z.string()),
      brakeMarkerMeters: opt(z.number().nonnegative()),
      entrySpeedKmh: opt(SpeedKmh),
      minSpeedKmh: opt(SpeedKmh),
      exitSpeedKmh: opt(SpeedKmh),
      gear: opt(z.number().int().min(1).max(10)),
      line: opt(
        z.object({
          turnIn: opt(z.string()),
          apex: opt(z.string()),
          exit: opt(z.string()),
        }),
      ),
      throttleNotes: opt(z.string()),
      trailBrakeNotes: opt(z.string()),
      priority: opt(CornerPriority),
      confidence: opt(Confidence),
    }),
  ),
});
export type GuideImportPayload = z.infer<typeof GuideImportPayload>;

// ---------------------------------------------------------------------------
// Backup (full database export)
// ---------------------------------------------------------------------------

export const BackupAsset = Asset.extend({ dataBase64: z.string() });

export const BackupPayload = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  kind: z.literal("backup"),
  exportedAt: z.iso.datetime(),
  data: z.object({
    tracks: z.array(Track),
    layouts: z.array(Layout),
    corners: z.array(Corner),
    segments: z.array(Segment),
    complexes: z.array(CornerComplex),
    carClasses: z.array(CarClass),
    cars: z.array(Car),
    guides: z.array(Guide),
    cornerGuides: z.array(CornerGuide),
    assets: z.array(BackupAsset),
  }),
});
export type BackupPayload = z.infer<typeof BackupPayload>;

export const Payload = z.discriminatedUnion("kind", [
  TrackImportPayload,
  GuideImportPayload,
  BackupPayload,
]);
export type Payload = z.infer<typeof Payload>;
