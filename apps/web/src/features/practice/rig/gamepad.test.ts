import { describe, expect, it } from "vitest";
import { actionFor, detectPresses, shortPadName, type PadLike } from "./gamepad";

const pad = (pressed: boolean[], id = "Wheel (Vendor: 1)", index = 0): PadLike => ({
  id,
  index,
  buttons: pressed.map((p) => ({ pressed: p })),
});

describe("detectPresses", () => {
  it("fires on rising edges only, with a silent baseline for new pads", () => {
    let { pressed, state } = detectPresses(new Map(), [pad([true, false])]);
    expect(pressed).toEqual([]); // baseline: already-held buttons don't fire

    ({ pressed, state } = detectPresses(state, [pad([true, true])]));
    expect(pressed).toEqual([{ gamepadId: "Wheel (Vendor: 1)", button: 1 }]);

    ({ pressed, state } = detectPresses(state, [pad([true, true])]));
    expect(pressed).toEqual([]); // held

    ({ pressed } = detectPresses(state, [pad([true, false]), null]));
    expect(pressed).toEqual([]); // released
  });
});

describe("actionFor", () => {
  const bindings = {
    next: { gamepadId: "Wheel", button: 4 },
    prev: { gamepadId: "Wheel", button: 5 },
  };
  it("maps bound buttons to actions", () => {
    expect(actionFor(bindings, { gamepadId: "Wheel", button: 4 })).toBe("next");
    expect(actionFor(bindings, { gamepadId: "Wheel", button: 5 })).toBe("prev");
    expect(actionFor(bindings, { gamepadId: "Pedals", button: 4 })).toBeNull();
  });
});

it("shortens gamepad names", () => {
  expect(shortPadName("Logitech G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)")).toBe(
    "Logitech G29 Driving Force Racing Wheel",
  );
});
