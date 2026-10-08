import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useRovingFocus } from "./use-roving-focus";

function Bar() {
  const { ref, onKeyDown } = useRovingFocus<HTMLDivElement>();
  return (
    <div role="toolbar" aria-label="Map controls" ref={ref} onKeyDown={onKeyDown}>
      <button>A</button>
      <button disabled>B</button>
      <button>C</button>
      <select aria-label="Car">
        <option>x</option>
      </select>
    </div>
  );
}

describe("useRovingFocus", () => {
  it("moves with arrows, skips disabled, wraps, and supports Home/End", async () => {
    render(<Bar />);
    screen.getByRole("button", { name: "A" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "C" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
  });

  it("leaves arrow keys to a focused select", async () => {
    render(<Bar />);
    screen.getByRole("combobox", { name: "Car" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("combobox", { name: "Car" })).toHaveFocus();
  });
});
