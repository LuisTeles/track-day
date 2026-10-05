import { z } from "zod";

/** Client-generated UUID (`crypto.randomUUID()`), stable across a future sync. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

export const Timestamp = z.iso.datetime();

/**
 * Fields shared by every stored entity. `updatedAt` drives last-write-wins
 * sync later; `deletedAt` is a soft delete so deletions can be synced too.
 */
export const EntityBase = z.object({
  id: Id,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Timestamp.nullable(),
});
export type EntityBase = z.infer<typeof EntityBase>;

/** Speeds are stored in km/h only for v1; the unit is part of every field name. */
export const SpeedKmh = z.number().nonnegative().max(500);

/** Where a value came from. Telemetry is reserved for the future lap import. */
export const Source = z.enum(["manual", "ai", "telemetry"]);
export type Source = z.infer<typeof Source>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

/**
 * Position along a layout's outline path as a fraction of the lap: 0 is the
 * start/finish line, values increase in the driving direction. See ADR-005.
 */
export const PathFraction = z.number().min(0).lt(1);

/** SVG path data (`d`) in the layout's normalized coordinate space. See ADR-005. */
export const SvgPath = z
  .string()
  .trim()
  .regex(/^[Mm]/, "Must be SVG path data starting with a moveto command (M or m)");

/** Screen-space offset in CSS pixels, e.g. to nudge a label away from its anchor. */
export const ScreenOffset = z.object({ dx: z.number(), dy: z.number() });
export type ScreenOffset = z.infer<typeof ScreenOffset>;
