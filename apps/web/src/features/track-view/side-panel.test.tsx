import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SidePanel } from "./side-panel";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <SidePanel open={open} title="T1 · S do Senna" onClose={() => setOpen(false)}>
        details
      </SidePanel>
    </>
  );
}

describe("SidePanel", () => {
  it("is closed by default, opens with focus on its heading, and closes on Escape", async () => {
    render(<Harness />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("complementary", { name: "T1 · S do Senna" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "T1 · S do Senna" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("closes with the close button", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
