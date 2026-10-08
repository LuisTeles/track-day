import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfirmProvider, useConfirm } from "./confirm";

function Probe({ onResult }: { onResult(v: boolean): void }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () =>
        onResult(
          await confirm({
            title: "Discard unsaved changes?",
            confirmLabel: "Discard changes",
            cancelLabel: "Keep editing",
            destructive: true,
          }),
        )
      }
    >
      leave
    </button>
  );
}

describe("useConfirm", () => {
  it("resolves true on confirm", async () => {
    let result: boolean | undefined;
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(result).toBe(true);
  });

  it("resolves false on cancel and on Escape, and returns focus", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Probe onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );
    const trigger = screen.getByRole("button", { name: "leave" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(results).toEqual([false, false]);
    expect(trigger).toHaveFocus();
  });

  it("focuses the safe choice first", async () => {
    render(
      <ConfirmProvider>
        <Probe onResult={() => {}} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("answers no and closes when the asking component goes away", async () => {
    const results: boolean[] = [];
    const ui = (show: boolean) => (
      <ConfirmProvider>{show && <Probe onResult={(v) => results.push(v)} />}</ConfirmProvider>
    );
    const { rerender } = render(ui(true));
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    rerender(ui(false)); // e.g. the browser's Back button left the page
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(results).toEqual([false]);
  });

  it("answers no to a first ask when a second one comes", async () => {
    const results: string[] = [];
    function Twice() {
      const confirm = useConfirm();
      return (
        <button
          onClick={() => {
            void confirm({ title: "First?", confirmLabel: "Yes" }).then((v) =>
              results.push(`first:${v}`),
            );
            void confirm({ title: "Second?", confirmLabel: "Yes" }).then((v) =>
              results.push(`second:${v}`),
            );
          }}
        >
          ask twice
        </button>
      );
    }
    render(
      <ConfirmProvider>
        <Twice />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "ask twice" }));
    expect(screen.getByRole("alertdialog", { name: "Second?" })).toBeInTheDocument();
    await waitFor(() => expect(results).toEqual(["first:false"]));
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(results).toEqual(["first:false", "second:true"]));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
