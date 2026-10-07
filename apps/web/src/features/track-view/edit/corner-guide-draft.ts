import { BrakePressure, CornerGuide, type CornerGuide as CornerGuideT } from "@track-day/schema";
import type { EntityPatch, NewEntity } from "@/data/repositories";

export type GuidePatch = EntityPatch<CornerGuideT>;

/** A corner guide with nothing known yet, entered by hand. */
export function emptyCornerGuide(guideId: string, cornerId: string): NewEntity<CornerGuideT> {
  return {
    guideId,
    cornerId,
    brakeReference: null,
    brakeMarkerMeters: null,
    entrySpeedKmh: null,
    minSpeedKmh: null,
    exitSpeedKmh: null,
    gear: null,
    line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: null, exitAt: null },
    throttleNotes: "",
    trailBrakeNotes: "",
    priority: null,
    brakePressure: null,
    brakePressurePct: null,
    cue: null,
    downshiftTo: null,
    notes: "",
    source: "manual",
    confidence: null,
  };
}

const NUMBER_FIELDS = [
  "entrySpeedKmh",
  "minSpeedKmh",
  "exitSpeedKmh",
  "gear",
  "downshiftTo",
  "brakeMarkerMeters",
  "brakePressurePct",
] as const;
const TEXT_FIELDS = ["brakeReference", "cue"] as const; // "" → null
const NOTE_FIELDS = ["throttleNotes", "trailBrakeNotes", "notes"] as const; // kept as strings

export type GuideDraft = Record<
  | (typeof NUMBER_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number]
  | (typeof NOTE_FIELDS)[number]
  | "brakePressure",
  string
>;

export const GUIDE_FIELDS = [
  ...NUMBER_FIELDS,
  ...TEXT_FIELDS,
  ...NOTE_FIELDS,
  "brakePressure",
] as const satisfies readonly (keyof GuideDraft)[];

export function draftFrom(guide: CornerGuideT | undefined): GuideDraft {
  const draft = {} as GuideDraft;
  for (const f of NUMBER_FIELDS) draft[f] = guide?.[f] == null ? "" : String(guide[f]);
  for (const f of TEXT_FIELDS) draft[f] = guide?.[f] ?? "";
  for (const f of NOTE_FIELDS) draft[f] = guide?.[f] ?? "";
  draft.brakePressure = guide?.brakePressure ?? "";
  return draft;
}

const Editable = CornerGuide.pick({
  entrySpeedKmh: true,
  minSpeedKmh: true,
  exitSpeedKmh: true,
  gear: true,
  downshiftTo: true,
  brakeMarkerMeters: true,
  brakePressurePct: true,
  brakeReference: true,
  cue: true,
  throttleNotes: true,
  trailBrakeNotes: true,
  notes: true,
  brakePressure: true,
});

export type DraftResult =
  | { ok: true; patch: GuidePatch }
  | { ok: false; errors: Partial<Record<keyof GuideDraft, string>> };

/** Form strings → a validated patch, with one message per bad field. */
export function parseDraft(draft: GuideDraft): DraftResult {
  const errors: Partial<Record<keyof GuideDraft, string>> = {};
  const raw: Record<string, unknown> = {};
  for (const f of NUMBER_FIELDS) {
    const v = draft[f].trim();
    if (v === "") raw[f] = null;
    else if (Number.isNaN(Number(v))) errors[f] = "Enter a number";
    else raw[f] = Number(v);
  }
  for (const f of TEXT_FIELDS) raw[f] = draft[f].trim() === "" ? null : draft[f].trim();
  for (const f of NOTE_FIELDS) raw[f] = draft[f];
  raw.brakePressure = draft.brakePressure === "" ? null : BrakePressure.parse(draft.brakePressure);

  const parsed = Editable.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof GuideDraft;
      errors[field] ??= issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, patch: parsed.data };
}

/** Editing an AI estimate makes it the user's own value. */
export function asManual(
  existing: Pick<CornerGuideT, "source" | "confidence">,
  patch: GuidePatch,
): GuidePatch {
  return existing.source === "ai" ? { ...patch, source: "manual", confidence: null } : patch;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Appends `YYYY-MM-DD: text` (local date) on its own line. */
export function appendNote(notes: string, text: string, date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const line = `${day}: ${text.trim()}`;
  return notes.trim() === "" ? line : `${notes.replace(/\s+$/, "")}\n${line}`;
}
