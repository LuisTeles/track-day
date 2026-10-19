import type { CarClass } from "@track-day/schema";
import type { NewEntity } from "@/data/repositories";

/** The classes a new garage can start from (PLAN.md seed data). */
export const STARTER_CLASSES: NewEntity<CarClass>[] = [
  {
    name: "Formula",
    description: "Open-wheel single-seaters.",
    drivetrain: "MR",
    downforce: "high",
  },
  {
    name: "GT3",
    description: "Race-prepared GT cars with aero.",
    drivetrain: null,
    downforce: "medium",
  },
  {
    name: "GT4",
    description: "Entry GT race cars, little aero.",
    drivetrain: null,
    downforce: "low",
  },
  {
    name: "Road car",
    description: "Street cars on street tyres.",
    drivetrain: null,
    downforce: "none",
  },
  { name: "Drift", description: "Cars set up to slide.", drivetrain: "FR", downforce: "none" },
];

/** Starter classes whose name isn't taken yet (case-insensitive). */
export function missingStarters(existing: readonly Pick<CarClass, "name">[]) {
  const taken = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  return STARTER_CLASSES.filter((c) => !taken.has(c.name.toLowerCase()));
}
