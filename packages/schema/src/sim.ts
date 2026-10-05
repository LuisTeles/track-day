import { z } from "zod";

/**
 * Simulators (plus real life) a track, car or guide can belong to. Physics
 * differ enough between them that guides are keyed by sim; see ADR-004.
 */
export const SIMS = [
  { id: "real-world", label: "Real world" },
  { id: "assetto-corsa", label: "Assetto Corsa" },
  { id: "assetto-corsa-competizione", label: "Assetto Corsa Competizione" },
  { id: "assetto-corsa-evo", label: "Assetto Corsa EVO" },
  { id: "iracing", label: "iRacing" },
  { id: "le-mans-ultimate", label: "Le Mans Ultimate" },
  { id: "rfactor-2", label: "rFactor 2" },
  { id: "automobilista-2", label: "Automobilista 2" },
  { id: "gran-turismo-7", label: "Gran Turismo 7" },
  { id: "f1-game", label: "F1 (EA Sports)" },
  { id: "other", label: "Other" },
] as const;

export type SimId = (typeof SIMS)[number]["id"];

export const SimId = z.enum(SIMS.map((s) => s.id) as [SimId, ...SimId[]]);

export function simLabel(id: SimId): string {
  return SIMS.find((s) => s.id === id)?.label ?? id;
}
