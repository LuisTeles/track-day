import interlagos from "@examples/interlagos.track.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasteStep } from "./paste-step";

async function paste(text: string) {
  const user = userEvent.setup();
  const onResult = vi.fn();
  render(<PasteStep onResult={onResult} />);
  await user.click(screen.getByLabelText("AI answer"));
  await user.paste(text);
  return { user, onResult };
}

const check = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Check JSON" }));

describe("PasteStep", () => {
  it("accepts the Interlagos sample wrapped in a code fence and prose", async () => {
    const { user, onResult } = await paste(
      "Here you go:\n```json\n" + JSON.stringify(interlagos) + "\n```\nHope this helps!",
    );
    await check(user);

    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: expect.objectContaining({ name: interlagos.track.name }) }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains text that isn't JSON", async () => {
    const { user, onResult } = await paste("Sorry, I can't see the image.");
    await check(user);

    expect(screen.getByRole("alert")).toHaveTextContent("This isn’t valid JSON");
    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("shows schema errors by field path", async () => {
    const broken = structuredClone(interlagos);
    (broken.corners[0] as { direction: string }).direction = "sideways";
    const { user } = await paste(JSON.stringify(broken));
    await check(user);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("doesn’t match the track format");
    expect(alert).toHaveTextContent("corners[0].direction");
  });

  it("rejects a guide pasted into the track importer", async () => {
    const { user, onResult } = await paste(
      JSON.stringify({ schemaVersion: 1, kind: "guide", guide: {}, corners: [] }),
    );
    await check(user);

    expect(screen.getByRole("alert")).toHaveTextContent("kind");
    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("clears a valid result when the text is edited", async () => {
    const { user, onResult } = await paste(JSON.stringify(interlagos));
    await check(user);
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "track" }));

    await user.type(screen.getByLabelText("AI answer"), " ");

    expect(onResult).toHaveBeenLastCalledWith(null);
  });

  it("keeps Check JSON disabled for an empty or whitespace-only answer", async () => {
    await paste("   \n  ");
    expect(screen.getByRole("button", { name: "Check JSON" })).toBeDisabled();
  });
});
