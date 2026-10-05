import { describe, expect, it } from "vitest";
import { parseLenientJson } from "./lenient-json";

describe("parseLenientJson", () => {
  it("strips markdown fences and surrounding prose", () => {
    const raw = 'Here you go:\n```json\n{"a": 1}\n```\nLet me know!';
    expect(parseLenientJson(raw)).toMatchObject({ ok: true, value: { a: 1 } });
  });

  it("removes trailing commas but not commas inside strings", () => {
    const raw = '{"a": [1, 2,], "b": "x,}", "c": {"d": 1,},}';
    expect(parseLenientJson(raw)).toMatchObject({
      ok: true,
      value: { a: [1, 2], b: "x,}", c: { d: 1 } },
    });
  });

  it("handles escaped quotes inside strings", () => {
    expect(parseLenientJson('{"a": "say \\"hi\\",]",}')).toMatchObject({
      ok: true,
      value: { a: 'say "hi",]' },
    });
  });

  it("replaces smart quotes", () => {
    expect(parseLenientJson("{“a”: 1}")).toMatchObject({ ok: true, value: { a: 1 } });
  });

  it("reports unparseable input", () => {
    expect(parseLenientJson("not json")).toMatchObject({ ok: false });
    expect(parseLenientJson("   ")).toMatchObject({ ok: false, error: "Nothing to parse" });
  });
});
