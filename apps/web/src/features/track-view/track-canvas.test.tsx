import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockLayout } from "@/test/dom";
import { TrackCanvas } from "./track-canvas";

beforeAll(() => {
  // jsdom has no layout: give every element a fixed size and a no-op observer.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("TrackCanvas", () => {
  it("renders the outline fitted to the container and passes a projector to overlays", () => {
    let projected: { x: number; y: number } | undefined;
    render(
      <TrackCanvas
        outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z"
        label="Map of a square"
        overlay={(ctx) => {
          projected = ctx.toScreen(ctx.geometry.pointAt(0.5));
          return null;
        }}
      />,
    );
    const svg = screen.getByRole("img", { name: "Map of a square" });
    expect(svg).toHaveAttribute("width", "800");
    expect(svg.querySelectorAll("path")).toHaveLength(3);
    // 100×100 square fitted into 800×600 with 48 px padding: 504 px tall, centered.
    expect(projected!.x).toBeCloseTo(400 + 252);
    expect(projected!.y).toBeCloseTo(300 + 252);
  });
});

describe("TrackCanvas pick mode", () => {
  it("reports the lap position of a click, and ignores drags", () => {
    mockLayout(800, 600);
    const onPick = vi.fn();
    render(
      <TrackCanvas outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z" label="Map" onPick={onPick} />,
    );
    const surface = screen.getByRole("img", { name: "Map" }).parentElement!;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    } as DOMRect);
    // Fitted square spans 504 px (600 - 2x48) and is centered: x 148-652, y 48-552.
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 48 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 48 });
    fireEvent.click(surface, { clientX: 400, clientY: 48 });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toBeCloseTo(0.125, 2);

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 48 });
    fireEvent.pointerUp(surface, { clientX: 460, clientY: 48 });
    fireEvent.click(surface, { clientX: 460, clientY: 48 });
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
