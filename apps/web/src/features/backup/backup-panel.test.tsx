import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { ToastProvider } from "@/shared/ui/toast";
import { BackupPanel } from "./backup-panel";

function setup() {
  const backup = { exportAll: vi.fn(), importAll: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ backup } as unknown as Repositories}>
        <ToastProvider>
          <BackupPanel />
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { backup };
}

const upload = (content: string) =>
  userEvent.upload(
    screen.getByLabelText("Backup file"),
    new File([content], "backup.json", { type: "application/json" }),
  );

describe("BackupPanel", () => {
  it("offers import modes as large radio cards inside a named group", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Import mode" });
    expect(within(group).getByRole("radio", { name: /Merge/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Replace/ })).not.toBeChecked();
  });

  it("warns before a replace import with a visible note", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Replace/ }));
    expect(screen.getByText(/deletes everything in this browser first/)).toBeInTheDocument();
  });

  it("shows validation errors by field path and does not import", async () => {
    const { backup } = setup();
    await upload(
      JSON.stringify({ schemaVersion: 1, kind: "backup", exportedAt: "nope", data: {} }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not a valid Track Day backup");
    expect(alert).toHaveTextContent("exportedAt");
    expect(alert).toHaveTextContent("data.tracks");
    expect(backup.importAll).not.toHaveBeenCalled();
  });

  it("imports a valid backup in the selected mode", async () => {
    const { backup } = setup();
    await userEvent.click(screen.getByLabelText(/Replace/));
    const empty = {
      tracks: [],
      layouts: [],
      corners: [],
      segments: [],
      complexes: [],
      carClasses: [],
      cars: [],
      guides: [],
      cornerGuides: [],
      assets: [],
    };
    await upload(
      JSON.stringify({
        schemaVersion: 1,
        kind: "backup",
        exportedAt: "2026-10-04T00:00:00.000Z",
        data: empty,
      }),
    );

    expect(await screen.findByText(/imported/)).toBeInTheDocument();
    expect(backup.importAll).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "backup" }),
      "replace",
    );
  });
});
