import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, it } from "vitest";
import { IconButton } from "./icon-button";

describe("IconButton", () => {
  it("is named by its label, square, and hides the icon from assistive tech", () => {
    render(
      <IconButton label="Close panel">
        <X />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Close panel" });
    expect(button).toHaveClass("size-10");
    expect(button).toHaveAttribute("title", "Close panel");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
