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

/** Point normalized to 0–1 over the layout map image, so it scales with the image. */
export const MapPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type MapPoint = z.infer<typeof MapPoint>;
