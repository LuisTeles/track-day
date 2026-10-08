import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLink } from "./nav-link";

vi.mock("next/navigation", () => ({ usePathname: () => "/backup/" }));

describe("NavLink", () => {
  it("marks the current page", () => {
    render(
      <>
        <NavLink href="/">Tracks</NavLink>
        <NavLink href="/backup/">Backup</NavLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Backup" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tracks" })).not.toHaveAttribute("aria-current");
  });
});
