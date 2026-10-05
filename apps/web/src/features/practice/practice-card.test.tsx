import type { CornerGuide } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brakeAtText, directionText, pressureOf, titleOf } from "./format";
import { PracticeCard, type PracticeCardProps } from "./practice-card";

const guide = (extra: Partial<CornerGuide> = {}) =>
  ({
    brakeReference: "100 m board",
    brakeMarkerMeters: 100,
    minSpeedKmh: 69.6,
    gear: 3,
    downshiftTo: 2,
    brakePressure: "heavy",
    brakePressurePct: null,
    cue: "Brake at 100, late apex",
    source: "ai",
    confidence: "low",
    ...extra,
  }) as CornerGuide;

const props = (extra: Partial<PracticeCardProps> = {}): PracticeCardProps => ({
  title: "T1",
  name: "S do Senna",
  direction: "Left",
  guide: guide(),
  guideLabel: "Road car · any sim",
  next: { title: "T2", name: "S do Senna", direction: "Right", brakeAt: "Lift" },
  ...extra,
});

describe("PracticeCard", () => {
  it("shows the corner's tiles, cue, estimate and next corner", () => {
    render(<PracticeCard {...props()} />);
    const card = screen.getByTestId("practice-card");
    expect(card).toHaveAccessibleName("T1, S do Senna, Left");
    expect(screen.getByText("100 m board")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Brake pressure" })).toHaveAttribute(
      "aria-valuetext",
      "Heavy",
    );
    expect(screen.getByText("↓ 2 under braking")).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByTestId("practice-cue")).toHaveTextContent("Brake at 100, late apex");
    expect(screen.getByText("Estimate · low confidence")).toBeInTheDocument();
    expect(card).toHaveTextContent("NextT2S do SennaRightBrake: Lift");
  });

  it("keeps every tile with a dash when values are missing", () => {
    render(
      <PracticeCard
        {...props({
          guide: guide({
            brakeReference: null,
            brakeMarkerMeters: null,
            minSpeedKmh: null,
            gear: null,
            downshiftTo: null,
            brakePressure: null,
            cue: null,
            source: "manual",
            confidence: null,
          }),
        })}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole("meter", { name: "Brake pressure" })).toHaveAttribute(
      "aria-valuetext",
      "unknown",
    );
    expect(screen.queryByText(/Estimate/)).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no guidance", () => {
    render(<PracticeCard {...props({ guide: null })} />);
    expect(
      screen.getByText("No guide for this corner in “Road car · any sim”."),
    ).toBeInTheDocument();
    render(<PracticeCard {...props({ guide: null, guideLabel: null })} />);
    expect(screen.getByText("No guide for this layout yet.")).toBeInTheDocument();
  });
});

describe("format helpers", () => {
  it("formats brake-at, pressure, direction and titles", () => {
    expect(brakeAtText({ brakeReference: null, brakeMarkerMeters: 50 })).toBe("50 m");
    expect(brakeAtText(null)).toBeNull();
    expect(pressureOf({ brakePressure: "none", brakePressurePct: null })).toEqual({
      pct: 0,
      label: "Lift / flat",
    });
    expect(pressureOf({ brakePressure: "firm", brakePressurePct: 70 })).toEqual({
      pct: 70,
      label: "Firm · 70%",
    });
    expect(pressureOf({ brakePressure: null, brakePressurePct: 40 })).toEqual({
      pct: 40,
      label: "40%",
    });
    expect(directionText([{ direction: "left" }, { direction: "right" }])).toBe("Left → Right");
    expect(titleOf([{ number: 1 }, { number: 2 }])).toBe("T1–T2");
    expect(titleOf([{ number: 7 }])).toBe("T7");
  });
});
