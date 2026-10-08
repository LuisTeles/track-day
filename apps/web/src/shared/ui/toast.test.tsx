import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.show("Backup downloaded.", "success")}>go</button>;
}

describe("toasts", () => {
  it("announces in a polite status region and disappears", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "go" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Backup downloaded.");
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});
