import type { CornerGuide } from "@track-day/schema";

/**
 * Values shown as estimates: AI-generated, or anything marked low confidence.
 * Telemetry is measured, so it is not an estimate (ADR-006).
 */
export function isEstimate(guide: Pick<CornerGuide, "source" | "confidence">): boolean {
  return guide.source === "ai" || guide.confidence === "low";
}
