import { z } from "zod";
import { GuideImportPayload, TrackImportPayload } from "./payloads";

/**
 * JSON Schemas embedded in the AI prompts. `io: "input"` describes what may be
 * written (optional fields stay optional), which is what the AI produces.
 */
export function trackImportJsonSchema() {
  return z.toJSONSchema(TrackImportPayload, { io: "input" });
}

export function guideImportJsonSchema() {
  return z.toJSONSchema(GuideImportPayload, { io: "input" });
}
