import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, type FactsDraft } from "./known-facts";
import { KnownFactsForm } from "./known-facts-form";

function Harness({ onDraft }: { onDraft(d: FactsDraft): void }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  return (
    <KnownFactsForm
      value={draft}
      onChange={(d) => {
        setDraft(d);
        onDraft(d);
      }}
    />
  );
}

describe("KnownFactsForm", () => {
  it("edits every field", async () => {
    const user = userEvent.setup();
    let last = EMPTY_DRAFT;
    render(<Harness onDraft={(d) => (last = d)} />);

    await user.type(screen.getByLabelText("Track name"), "Interlagos");
    await user.type(screen.getByLabelText("Layout"), "GP");
    await user.type(screen.getByLabelText("Lap length (m)"), "4309");
    await user.selectOptions(screen.getByLabelText("Direction"), "anticlockwise");
    await user.type(screen.getByLabelText("Number of corners"), "15");
    await user.selectOptions(screen.getByLabelText("Sim"), "iracing");

    expect(last).toEqual({
      trackName: "Interlagos",
      layoutName: "GP",
      lengthMeters: "4309",
      direction: "anticlockwise",
      cornerCount: "15",
      sim: "iracing",
    });
  });

  it("says when a lap length can't be used", async () => {
    const user = userEvent.setup();
    render(<Harness onDraft={() => {}} />);
    const field = screen.getByLabelText("Lap length (m)");

    await user.type(field, "4.3");
    expect(field).toHaveAccessibleDescription(/Not used/);

    await user.clear(field);
    await user.type(field, "4.309");
    expect(field).not.toHaveAccessibleDescription(/Not used/);
  });
});
