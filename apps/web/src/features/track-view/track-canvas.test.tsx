import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
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
