import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { mockLayout } from "@/test/dom";
import { getRacingLine, RacingLineLayer } from "./racing-line";
import { TrackCanvas } from "./track-canvas";

beforeAll(() => mockLayout());

describe("racing line", () => {
  it("comes from the layout's manual line", () => {
    const line = { path: "M 1 1 L 9 1", source: "manual" as const };
    expect(getRacingLine({ racingLine: line })).toBe(line);
    expect(getRacingLine({ racingLine: null })).toBeNull();
  });

  it("is drawn in the outline's rotated coordinate space", () => {
    render(
      <TrackCanvas
        outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z"
        rotation={90}
        label="Map"
        trackLayers={() => <RacingLineLayer line={{ path: "M 5 5 L 95 5", source: "manual" }} />}
      />,
    );
    const line = screen.getByTestId("racing-line");
    expect(line).toHaveAttribute("d", "M 5 5 L 95 5");
    expect(line.closest("g")?.getAttribute("transform")).toMatch(/^rotate\(90 /);
  });
});
