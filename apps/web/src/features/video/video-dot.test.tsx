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
});

describe("VideoDot transition", () => {
  const fakeCtx = (k = 1): CanvasContext =>
    ({
      geometry: { pointAt: (f: number) => ({ x: f * 100, y: 0 }) },
      toScreen: (p: { x: number; y: number }) => p,
      zoom: { k, x: 0, y: 0 },
      viewport: { width: 800, height: 600 },
    }) as unknown as CanvasContext;
  const cls = () => screen.getByTestId("video-dot").className;

  it("glides on an ordinary forward move", () => {
    const ctx = fakeCtx();
    const { rerender } = render(<VideoDot ctx={ctx} fraction={0.3} />);
    expect(cls()).not.toContain("transition");
    rerender(<VideoDot ctx={ctx} fraction={0.35} />);
    expect(cls()).toContain("motion-safe:transition-transform");
  });

  it("does not glide across a seek or lap wrap", () => {
    const ctx = fakeCtx();
    const { rerender } = render(<VideoDot ctx={ctx} fraction={0.95} />);
    rerender(<VideoDot ctx={ctx} fraction={0.02} />);
    expect(cls()).not.toContain("transition");
    rerender(<VideoDot ctx={ctx} fraction={0.5} />);
    expect(cls()).not.toContain("transition");
  });

  it("does not glide while the map is panned or zoomed", () => {
    const { rerender } = render(<VideoDot ctx={fakeCtx(1)} fraction={0.3} />);
    rerender(<VideoDot ctx={fakeCtx(2)} fraction={0.31} />);
    expect(cls()).not.toContain("transition");
  });
});
