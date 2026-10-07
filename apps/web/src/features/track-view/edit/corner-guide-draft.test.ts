// @vitest-environment node
import type { CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import {
  appendNote,
  asManual,
  draftFrom,
  emptyCornerGuide,
  parseDraft,
} from "./corner-guide-draft";

const base = { ...emptyCornerGuide("g1", "c1") } as unknown as CornerGuide;

describe("draftFrom / parseDraft", () => {
  it("round-trips values, and empty fields become null", () => {
    const draft = draftFrom({ ...base, minSpeedKmh: 72.5, gear: 3, cue: "Late apex", notes: "x" });
    expect(draft.minSpeedKmh).toBe("72.5");
    expect(draft.entrySpeedKmh).toBe("");
    const result = parseDraft(draft);
    expect(result).toEqual({
      ok: true,
      patch: expect.objectContaining({
        minSpeedKmh: 72.5,
        gear: 3,
        entrySpeedKmh: null,
        cue: "Late apex",
        notes: "x",
        brakePressure: null,
      }),
    });
  });

  it("reports field errors with the schema's limits", () => {
    const draft = { ...draftFrom(base), gear: "11", minSpeedKmh: "fast", brakePressurePct: "120" };
    const result = parseDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "brakePressurePct",
        "gear",
        "minSpeedKmh",
      ]);
      expect(result.errors.minSpeedKmh).toBe("Enter a number");
    }
  });

  it("refuses a cue over 160 characters", () => {
    const result = parseDraft({ ...draftFrom(base), cue: "x".repeat(161) });
    expect(result.ok).toBe(false);
  });

  it("treats a blank cue as no cue", () => {
    const result = parseDraft({ ...draftFrom(base), cue: "   " });
    expect(result).toMatchObject({ ok: true, patch: { cue: null } });
  });
});

describe("asManual", () => {
  it("turns AI values into manual ones and drops the confidence", () => {
    expect(asManual({ source: "ai", confidence: "low" }, { gear: 2 })).toEqual({
      gear: 2,
      source: "manual",
      confidence: null,
    });
  });

  it("leaves manual and telemetry guides alone", () => {
    expect(asManual({ source: "telemetry", confidence: "high" }, { gear: 2 })).toEqual({ gear: 2 });
  });
});

describe("appendNote", () => {
  const day = new Date(2026, 9, 7, 23, 30); // local time, 7 Oct
  it("adds a dated line", () => {
    expect(appendNote("", "Braked too late", day)).toBe("2026-10-07: Braked too late");
    expect(appendNote("Old note", "  Try 100 board ", day)).toBe(
      "Old note\n2026-10-07: Try 100 board",
    );
  });
});
