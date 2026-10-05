import { z } from "zod";
import {
  Confidence,
  EntityBase,
  Id,
  PathFraction,
  ScreenOffset,
  Source,
  SpeedKmh,
  SvgPath,
} from "./common";
import { SimId } from "./sim";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const TrackDirection = z.enum(["clockwise", "anticlockwise"]);
export const CornerDirection = z.enum(["left", "right"]);
export const CornerType = z.enum(["hairpin", "chicane", "sweeper", "kink", "esses", "corner"]);
export const Elevation = z.enum(["uphill", "downhill", "crest", "compression", "flat"]);
export const Camber = z.enum(["positive", "off-camber", "flat"]);
export const Drivetrain = z.enum(["FR", "MR", "RR", "FF", "AWD"]);
export const Downforce = z.enum(["none", "low", "medium", "high"]);
export const Transmission = z.enum(["manual", "sequential", "paddle", "automatic"]);

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export const TrackSim = z.object({
  sim: SimId,
  /** The sim's own identifier for the track, e.g. a mod folder name. */
  trackId: z.string().nullable(),
});

export const Track = EntityBase.extend({
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  country: z.string().nullable(),
  city: z.string().nullable(),
  sims: z.array(TrackSim),
});
export type Track = z.infer<typeof Track>;

/**
 * Where a racing line came from. The extension point for future sources,
 * e.g. "ac-fast-lane" (Assetto Corsa AI line) or "telemetry".
 */
export const RacingLineSource = z.enum(["manual"]);
export type RacingLineSource = z.infer<typeof RacingLineSource>;

export const RacingLine = z.object({
  /** Same coordinate space as the layout outline. */
  path: SvgPath,
  source: RacingLineSource,
});
export type RacingLine = z.infer<typeof RacingLine>;

export const Layout = EntityBase.extend({
  trackId: Id,
  name: z.string().min(1),
  lengthMeters: z.number().positive().nullable(),
  direction: TrackDirection.nullable(),
  mapAssetId: Id.nullable(),
  /** Track outline; starts at the start/finish line, runs in the driving direction. */
  outlinePath: SvgPath.nullable(),
  /** Display rotation in degrees, so the track shows in its natural orientation. */
  rotation: z.number().min(-360).max(360).nullable(),
  racingLine: RacingLine.nullable(),
});
export type Layout = z.infer<typeof Layout>;

export const Corner = EntityBase.extend({
  layoutId: Id,
  number: z.number().int().positive(),
  name: z.string().min(1).nullable(),
  direction: CornerDirection.nullable(),
  type: CornerType.nullable(),
  elevation: Elevation.nullable(),
  camber: Camber.nullable(),
  /** Apex position along the outline. Falls back to distance / lap length. */
  pathPosition: PathFraction.nullable(),
  /** Manual label placement, overriding automatic collision handling. */
  labelOffset: ScreenOffset.nullable(),
  /** Sequence on the lap; usually equal to `number`, but not always. */
  order: z.number().int().nonnegative(),
  distanceFromStartMeters: z.number().nonnegative().nullable(),
  notes: z.string(),
  commonMistakes: z.array(z.string()),
});
export type Corner = z.infer<typeof Corner>;

export const Segment = EntityBase.extend({
  layoutId: Id,
  name: z.string().min(1),
  fromCornerId: Id.nullable(),
  toCornerId: Id.nullable(),
  notes: z.string(),
});
export type Segment = z.infer<typeof Segment>;

export const CornerComplex = EntityBase.extend({
  layoutId: Id,
  name: z.string().min(1),
  cornerIds: z.array(Id).min(2),
  notes: z.string(),
});
export type CornerComplex = z.infer<typeof CornerComplex>;

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------

export const CarClass = EntityBase.extend({
  name: z.string().min(1),
  description: z.string(),
  drivetrain: Drivetrain.nullable(),
  downforce: Downforce.nullable(),
});
export type CarClass = z.infer<typeof CarClass>;

export const Car = EntityBase.extend({
  name: z.string().min(1),
  classId: Id,
  sim: SimId.nullable(),
  powerHp: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  drivetrain: Drivetrain.nullable(),
  downforce: Downforce.nullable(),
  transmission: Transmission.nullable(),
  abs: z.boolean().nullable(),
  tc: z.boolean().nullable(),
});
export type Car = z.infer<typeof Car>;

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

export const GuideTarget = z.union([
  z.object({ carId: Id }).strict(),
  z.object({ carClassId: Id }).strict(),
]);
export type GuideTarget = z.infer<typeof GuideTarget>;

export const Guide = EntityBase.extend({
  layoutId: Id,
  target: GuideTarget,
  /** `null` means the guide applies to any sim. */
  sim: SimId.nullable(),
  referenceLapTime: z.string().nullable(),
  setupNotes: z.string(),
  source: Source,
});
export type Guide = z.infer<typeof Guide>;

/** How to drive one corner: references as text, optionally pinned on the outline. */
export const CornerLine = z.object({
  turnIn: z.string().nullable(),
  apex: z.string().nullable(),
  exit: z.string().nullable(),
  turnInAt: PathFraction.nullable(),
  apexAt: PathFraction.nullable(),
  exitAt: PathFraction.nullable(),
});
export type CornerLine = z.infer<typeof CornerLine>;

export const CornerPriority = z.enum(["entry", "balanced", "exit"]);

export const CornerGuide = EntityBase.extend({
  guideId: Id,
  cornerId: Id,
  brakeReference: z.string().nullable(),
  brakeMarkerMeters: z.number().nonnegative().nullable(),
  entrySpeedKmh: SpeedKmh.nullable(),
  minSpeedKmh: SpeedKmh.nullable(),
  exitSpeedKmh: SpeedKmh.nullable(),
  gear: z.number().int().min(1).max(10).nullable(),
  line: CornerLine,
  throttleNotes: z.string(),
  trailBrakeNotes: z.string(),
  priority: CornerPriority.nullable(),
  source: Source,
  confidence: Confidence.nullable(),
});
export type CornerGuide = z.infer<typeof CornerGuide>;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Metadata for a binary asset; the Blob itself lives in the asset store. */
export const Asset = EntityBase.extend({
  mimeType: z.string().min(1),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type Asset = z.infer<typeof Asset>;
