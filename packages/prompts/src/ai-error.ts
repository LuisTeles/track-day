import { parseLenientJson } from "@track-day/schema";

/**
 * The reply the prompts ask for when the AI can't do the task, e.g. no image
 * was attached: `{"error": "<short reason>"}`. Returns the reason, or null
 * when the reply is anything else (a payload, broken JSON, prose).
 */
export function readAiError(raw: string): string | null {
  const parsed = parseLenientJson(raw);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) return null;
  const value = parsed.value as Record<string, unknown>;
  if ("kind" in value || typeof value.error !== "string") return null;
  const reason = value.error.trim();
  return reason === "" ? null : reason;
}
