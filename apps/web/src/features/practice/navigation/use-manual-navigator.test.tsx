import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useManualNavigator } from "./use-manual-navigator";

function Harness({ onExit = vi.fn() }: { onExit?: () => void }) {
  const [current, setCurrent] = useState(0);
  const { navigator, surfaceProps } = useManualNavigator({
    count: 3,
    current,
    onChange: setCurrent,
    onExit,
  });
  return (
    <div data-testid="surface" {...surfaceProps} style={{ width: 300, height: 100 }}>
      <p>Step {navigator.current + 1}</p>
      <button type="button">Control</button>
    </div>
  );
}

describe("useManualNavigator", () => {
  it("moves with keys and wraps around the lap", async () => {
    render(<Harness />);
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 3")).toBeInTheDocument();
    await userEvent.keyboard("{Home}");
    expect(screen.getByText("Step 1")).toBeInTheDocument();
  });

  it("ignores Space on a focused button but still takes arrows", async () => {
    render(<Harness />);
    screen.getByRole("button", { name: "Control" }).focus();
    await userEvent.keyboard(" ");
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("exits on Escape", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    await userEvent.keyboard("{Escape}");
    expect(onExit).toHaveBeenCalled();
  });

  it("taps: right two thirds next, left third previous; swipes", () => {
    render(<Harness />);
    const surface = screen.getByTestId("surface");
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100 }) as DOMRect;
    const tap = (x: number) => {
      fireEvent.pointerDown(surface, { clientX: x, clientY: 50 });
      fireEvent.pointerUp(surface, { clientX: x, clientY: 50 });
    };
    tap(250);
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    tap(50);
    expect(screen.getByText("Step 1")).toBeInTheDocument();

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 50 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 55 });
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });
});
