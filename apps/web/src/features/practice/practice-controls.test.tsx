import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useManualNavigator } from "./navigation/use-manual-navigator";
import { PracticeOptions, PracticeShell, type FontSize } from "./practice-page";

function Harness({
  onExit,
  onChange,
  onFontSize = () => {},
}: {
  onExit(): void;
  onChange(i: number): void;
  onFontSize?(s: FontSize): void;
}) {
  const [open, setOpen] = useState(false);
  const { surfaceProps } = useManualNavigator({
    count: 3,
    current: 0,
    onChange,
    onExit,
    paused: open,
  });
  return (
    <PracticeShell
      surfaceProps={surfaceProps}
      controls={
        <PracticeOptions
          open={open}
          onOpenChange={setOpen}
          hasComplexes={false}
          mode="corner"
          onToggleMode={() => {}}
          fontSize="M"
          onFontSize={onFontSize}
          fullscreen={{ enabled: false, active: false, toggle: () => {} }}
          wakeLock="active"
          wheel={null}
        />
      }
    >
      card
    </PracticeShell>
  );
}

describe("PracticeOptions", () => {
  it("closes on Escape without exiting practice, and returns focus", async () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Practice options" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("does not change corners on arrow keys while open", async () => {
    const onChange = vi.fn();
    render(<Harness onExit={() => {}} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("chooses text size with a segmented radio group", async () => {
    const onFontSize = vi.fn();
    render(<Harness onExit={() => {}} onChange={() => {}} onFontSize={onFontSize} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("radio", { name: "M" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "L" }));
    expect(onFontSize).toHaveBeenCalledWith("L");
  });
});
