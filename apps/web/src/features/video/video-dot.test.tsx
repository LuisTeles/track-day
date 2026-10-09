import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { mockLayout } from "@/test/dom";
import { TrackCanvas, type CanvasContext } from "../track-view/track-canvas";
import { VideoDot } from "./video-dot";

beforeAll(() => mockLayout());

function renderDot(fraction: number | null, grab?: (ctx: CanvasContext) => void) {
  render(
    <TrackCanvas
      outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z"
      label="Map"
      overlay={(ctx) => {
        grab?.(ctx);
        return <VideoDot ctx={ctx} fraction={fraction} />;
      }}
    />,
  );
}

describe("VideoDot", () => {
  it("sits at the screen position of the lap fraction", () => {
    let ctx!: CanvasContext;
    renderDot(0.3, (c) => (ctx = c));
    const p = ctx.toScreen(ctx.geometry.pointAt(0.3));
    const dot = screen.getByTestId("video-dot");
    expect(dot.style.transform).toBe(`translate(${p.x}px, ${p.y}px)`);
  });

  it("is decorative", () => {
    renderDot(0.5);
    expect(screen.getByTestId("video-dot")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders nothing without a fraction", () => {
    renderDot(null);
    expect(screen.queryByTestId("video-dot")).toBeNull();
  });

  it("renders nothing for a non-finite fraction", () => {
    renderDot(Number.NaN);
    expect(screen.queryByTestId("video-dot")).toBeNull();
  });

  it("only animates when motion is allowed", () => {
    renderDot(0.5);
    const cls = screen.getByTestId("video-dot").className;
    expect(cls).toContain("motion-safe:transition-transform");
    expect(cls).not.toMatch(/(^|\s)transition/);
  });
});
