import type { Corner, ReferenceVideo } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkCorners } from "./mark-corners";
import type { VideoPlayerHandle } from "./player";

const corner = (id: string, number: number, name: string | null): Corner =>
  ({ id, number, name, order: number }) as Corner;
// Out of lap order on purpose: marking follows `order`.
const corners = [corner("c2", 2, null), corner("c1", 1, "Senna"), corner("c3", 3, "Curva do Sol")];

const video = (over: Partial<ReferenceVideo> = {}): ReferenceVideo =>
  ({
    source: "youtube",
    youtubeId: "dQw4w9WgXcQ",
    lapStartSec: null,
    lapEndSec: null,
    marks: [],
    ...over,
  }) as ReferenceVideo;

function setup(v: ReferenceVideo = video()) {
  const clock = { t: 0 };
  const playerRef = {
    current: {
      currentTime: () => clock.t,
      seek: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      isPlaying: () => false,
    } satisfies VideoPlayerHandle,
  };
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onDirtyChange = vi.fn();
  render(
    <>
      <input aria-label="Notes" />
      <MarkCorners
        video={v}
        corners={corners}
        playerRef={playerRef}
        onSave={onSave}
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
      />
    </>,
  );
  return { clock, onSave, onCancel, onDirtyChange, user: userEvent.setup() };
}

describe("MarkCorners", () => {
  it("advances through start, each corner in lap order, then the finish", async () => {
    const { clock, user } = setup();
    const primary = () => screen.getByRole("button", { name: /^Mark / });
    expect(primary()).toHaveTextContent("Mark start line");
    clock.t = 5;
    await user.click(primary());
    expect(primary()).toHaveTextContent("Mark T1 Senna");
    clock.t = 12.5;
    await user.click(primary());
    expect(primary()).toHaveTextContent("Mark T2");
    clock.t = 20;
    await user.click(primary());
    expect(primary()).toHaveTextContent("Mark T3 Curva do Sol");
    clock.t = 31;
    await user.click(primary());
    expect(primary()).toHaveTextContent("Mark finish line");
    clock.t = 90;
    await user.click(primary());
    expect(screen.queryByRole("button", { name: /^Mark / })).toBeNull();
    expect(screen.getByText("Every point is marked.")).toBeInTheDocument();
  });

  it("saves the draft as lap start, lap end and marks", async () => {
    const { clock, user, onSave } = setup();
    for (const t of [5, 12.5, 20, 31, 90]) {
      clock.t = t;
      await user.click(screen.getByRole("button", { name: /^Mark / }));
    }
    await user.click(screen.getByRole("button", { name: "Save marks" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        lapStartSec: 5,
        lapEndSec: 90,
        marks: [
          { cornerId: "c1", sec: 12.5 },
          { cornerId: "c2", sec: 20 },
          { cornerId: "c3", sec: 31 },
        ],
      }),
    );
  });

  it("marks with the M key, but not while typing, with a menu open, or with Ctrl", async () => {
    const { clock, user } = setup();
    clock.t = 3;
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /^Mark / })).toHaveTextContent("Mark T1");
    await user.click(screen.getByLabelText("Notes"));
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /^Mark / })).toHaveTextContent("Mark T1");
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}m{/Control}");
    expect(screen.getByRole("button", { name: /^Mark / })).toHaveTextContent("Mark T1");
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.append(item);
    document.body.append(menu);
    item.focus();
    await user.keyboard("m");
    menu.remove();
    expect(screen.getByRole("button", { name: /^Mark / })).toHaveTextContent("Mark T1");
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /^Mark / })).toHaveTextContent("Mark T2");
  });

  it("nudges, clears and undoes marks", async () => {
    const { clock, user } = setup(
      video({ lapStartSec: 5, marks: [{ cornerId: "c1", sec: 12.5 }] }),
    );
    await user.click(screen.getByRole("button", { name: "Later T1" }));
    expect(screen.getByText("0:13.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Earlier T1" }));
    await user.click(screen.getByRole("button", { name: "Earlier T1" }));
    expect(screen.getByText("0:12.0")).toBeInTheDocument();

    clock.t = 20;
    await user.click(screen.getByRole("button", { name: "Mark T2" }));
    expect(screen.getByText("0:20.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo last mark" }));
    expect(screen.queryByText("0:20.0")).toBeNull();
    expect(screen.getByRole("button", { name: "Undo last mark" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear T1" }));
    expect(screen.getByRole("button", { name: "Mark T1 Senna" })).toBeInTheDocument();
  });

  it("never nudges before 0:00", async () => {
    const { user } = setup(video({ lapStartSec: 0.2, marks: [{ cornerId: "c1", sec: 0.2 }] }));
    await user.click(screen.getByRole("button", { name: "Earlier T1" }));
    expect(screen.getAllByText("0:00.0").length).toBeGreaterThan(0);
  });

  it("blocks saving out-of-order marks and names the corner", async () => {
    const { user, onSave } = setup(
      video({
        lapStartSec: 1,
        marks: [
          { cornerId: "c1", sec: 20 },
          { cornerId: "c2", sec: 10 },
        ],
      }),
    );
    expect(
      screen.getByText("T2 is marked before the corner ahead of it. Fix the order to save."),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save marks" });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Later T2" }));
    for (let i = 0; i < 20; i++) await user.click(screen.getByRole("button", { name: "Later T2" }));
    expect(save).toBeEnabled();
  });

  it("reports dirtiness, and cancel hands control back", async () => {
    const { clock, user, onDirtyChange, onCancel } = setup();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    clock.t = 4;
    await user.click(screen.getByRole("button", { name: /^Mark / }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Undo last mark" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
