import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useManualNavigator } from "./use-manual-navigator";

function Harness({ onExit = vi.fn(), paused = false }: { onExit?: () => void; paused?: boolean }) {
  const [current, setCurrent] = useState(0);
  const { navigator, surfaceProps } = useManualNavigator({
    count: 3,
    current,
    onChange: setCurrent,
    onExit,
    paused,
  });
  return (
    <div data-testid="surface" {...surfaceProps} style={{ width: 300, height: 100 }}>
      <p>Step {navigator.current + 1}</p>
      <button type="button">Control</button>
      <div data-media>
        <video data-testid="video" tabIndex={0} />
      </div>
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

  it("leaves Space and arrows to a focused video player, but Escape still exits", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    screen.getByTestId("video").focus();
    for (const key of [" ", "{ArrowRight}", "{ArrowLeft}", "{PageDown}"]) {
      await userEvent.keyboard(key);
      expect(screen.getByText("Step 1")).toBeInTheDocument();
    }
    await userEvent.keyboard("{Escape}");
    expect(onExit).toHaveBeenCalled();
  });

  it("exits on Escape", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    await userEvent.keyboard("{Escape}");
    expect(onExit).toHaveBeenCalled();
  });

  it("ignores keys and taps while paused", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} paused />);
    await userEvent.keyboard("{ArrowRight}{Escape}");
    fireEvent.pointerDown(screen.getByTestId("surface"), { clientX: 250, clientY: 50 });
    fireEvent.pointerUp(screen.getByTestId("surface"), { clientX: 250, clientY: 50 });
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("ignores a key another layer already handled", () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    const early = (e: Event) => e.preventDefault();
    document.addEventListener("keydown", early, true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    document.removeEventListener("keydown", early, true);
    expect(onExit).not.toHaveBeenCalled();
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
