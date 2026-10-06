import { describe, expect, it } from "vitest";
import { buildTrackPrompt, readAiError } from "./index";

describe("buildTrackPrompt without an image", () => {
  it("tells the AI to reply with an error instead of guessing", () => {
    const prompt = buildTrackPrompt();
    expect(prompt).not.toContain("I have attached an image");
    expect(prompt).toContain('{"error": "<short reason>"}');
    expect(prompt).toContain("If no image is attached");
  });
});

describe("readAiError", () => {
  it("reads the reason from an error reply", () => {
    expect(readAiError('{"error": "No image was attached"}')).toBe("No image was attached");
  });

  it("reads it through code fences and prose", () => {
    expect(readAiError('Sorry!\n```json\n{"error": "Not a circuit map"}\n```')).toBe(
      "Not a circuit map",
    );
  });

  it.each([
    ['{"schemaVersion": 1, "kind": "track"}', "a track payload"],
    ["not json at all", "plain text"],
    ['{"error": 42}', "a non-string error"],
    ['{"error": "  "}', "an empty error"],
    ['{"error": "x", "kind": "track"}', "a payload that also has a kind"],
  ])("returns null for %j (%s)", (raw) => {
    expect(readAiError(raw)).toBeNull();
  });
});
