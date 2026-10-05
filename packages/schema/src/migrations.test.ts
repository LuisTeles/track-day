import { describe, expect, it } from "vitest";
import { migrate, MigrationError } from "./migrations";

describe("migrate", () => {
  const registry = {
    1: (p: Record<string, unknown>) => ({ ...p, renamed: p.old, old: undefined }),
    2: (p: Record<string, unknown>) => ({ ...p, added: true }),
  };

  it("runs every step from the payload version to the target", () => {
    expect(migrate({ schemaVersion: 1, old: "x" }, registry, 3)).toEqual({
      schemaVersion: 3,
      renamed: "x",
      old: undefined,
      added: true,
    });
  });

  it("leaves a current payload untouched", () => {
    expect(migrate({ schemaVersion: 3, a: 1 }, registry, 3)).toEqual({ schemaVersion: 3, a: 1 });
  });

  it.each([
    [null, /JSON object/],
    [[], /JSON object/],
    [{}, /schemaVersion/],
    [{ schemaVersion: "1" }, /schemaVersion/],
    [{ schemaVersion: 4 }, /newer/],
  ])("rejects %j", (input, message) => {
    expect(() => migrate(input, registry, 3)).toThrow(message);
    expect(() => migrate(input, registry, 3)).toThrow(MigrationError);
  });

  it("fails when a step is missing", () => {
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(/No migration from schemaVersion 1/);
  });
});
