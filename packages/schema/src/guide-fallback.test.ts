import { describe, expect, it } from "vitest";
import type { Guide } from "./entities";
import { resolveGuide } from "./guide-fallback";

const car = { id: "car", classId: "class" };
type G = Pick<Guide, "target" | "sim" | "updatedAt" | "deletedAt"> & { name: string };

const guide = (
  name: string,
  target: Guide["target"],
  sim: G["sim"],
  extra: Partial<G> = {},
): G => ({
  name,
  target,
  sim,
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  ...extra,
});

const carAc = guide("car+ac", { carId: "car" }, "assetto-corsa");
const carAny = guide("car+any", { carId: "car" }, null);
const classAc = guide("class+ac", { carClassId: "class" }, "assetto-corsa");
const classAny = guide("class+any", { carClassId: "class" }, null);
const carIracing = guide("car+iracing", { carId: "car" }, "iracing");
const otherCar = guide("other", { carId: "other" }, null);

const pick = (guides: G[], sim: G["sim"]) => resolveGuide(guides, car, sim)?.name;

describe("resolveGuide", () => {
  it("follows car+sim → car → class+sim → class", () => {
    const all = [classAny, classAc, carAny, carAc, otherCar];
    expect(pick(all, "assetto-corsa")).toBe("car+ac");
    expect(pick([classAny, classAc, carAny], "assetto-corsa")).toBe("car+any");
    expect(pick([classAny, classAc], "assetto-corsa")).toBe("class+ac");
    expect(pick([classAny], "assetto-corsa")).toBe("class+any");
  });

  it("never uses a guide for a different sim", () => {
    expect(pick([carIracing, classAny], "assetto-corsa")).toBe("class+any");
    expect(pick([carIracing], "assetto-corsa")).toBeUndefined();
  });

  it("only uses sim-agnostic guides when no sim is selected", () => {
    expect(pick([carAc, classAny], null)).toBe("class+any");
  });

  it("ignores deleted guides and other cars", () => {
    expect(
      pick(
        [
          guide("gone", { carId: "car" }, null, { deletedAt: "2026-01-02T00:00:00.000Z" }),
          otherCar,
        ],
        null,
      ),
    ).toBeUndefined();
  });

  it("prefers the most recently updated among equal matches", () => {
    const newer = guide("newer", { carId: "car" }, null, { updatedAt: "2026-02-01T00:00:00.000Z" });
    expect(pick([carAny, newer], null)).toBe("newer");
  });
});
