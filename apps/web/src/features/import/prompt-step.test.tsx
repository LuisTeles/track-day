import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromptStep } from "./prompt-step";

describe("PromptStep", () => {
  it("builds the prompt from the known facts", () => {
    render(<PromptStep facts={{ lengthMeters: 4309 }} />);
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain(
      "Lap length: 4309 m",
    );
  });

  it("copies the prompt to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<PromptStep facts={{}} />);

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## JSON Schema"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("falls back to selecting the prompt when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<PromptStep facts={{}} />);

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(await screen.findByText(/press Ctrl\/Cmd\+C/)).toBeInTheDocument();
    // Focus moves once the <details> has opened (next frame).
    await waitFor(() => expect(screen.getByLabelText("Prompt")).toHaveFocus());
  });
});
