import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoOutline } from "./no-outline";

const corner = (number: number, name: string | null): Corner =>
  ({ id: `c${number}`, number, name, direction: "left" }) as Corner;

describe("NoOutline", () => {
  it("lists the corners in lap order and selects one", async () => {
    const onSelect = vi.fn();
    render(<NoOutline corners={[corner(1, "S do Senna"), corner(2, null)]} onSelect={onSelect} />);

    expect(screen.getByText(/no outline yet/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("S do Senna");
    expect(buttons[1]).toHaveTextContent("Unnamed");

    await userEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
