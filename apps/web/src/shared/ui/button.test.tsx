import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("is a non-submitting button with the primary style by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-primary");
  });

  it("renders the outline variant", () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("border-input");
  });

  it("renders the destructive variant", () => {
    render(<Button variant="destructive">Delete track</Button>);
    expect(screen.getByRole("button", { name: "Delete track" })).toHaveClass("bg-destructive");
  });

  it("renders its child element with asChild", () => {
    render(
      <Button asChild variant="outline">
        <a href="/tracks/import/">Import with AI</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Import with AI" });
    expect(link).toHaveAttribute("href", "/tracks/import/");
    expect(link).not.toHaveAttribute("type");
  });

  it("is 40px tall by default and 44px on coarse pointers", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("h-10");
    expect(button).toHaveClass("pointer-coarse:h-11");
  });

  it("renders the ghost variant", () => {
    render(<Button variant="ghost">More</Button>);
    expect(screen.getByRole("button", { name: "More" })).toHaveClass("hover:bg-surface");
  });
});
