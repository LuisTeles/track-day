"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BackupPayload, parseImport, type FieldIssue } from "@track-day/schema";
import { CheckCircle2, Download, TriangleAlert, Upload } from "lucide-react";
import { useId, useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import type { BackupImportMode } from "@/data/repositories";
import { Button } from "@/shared/ui/button";
import { IssueList } from "@/shared/ui/issue-list";
import { useToast } from "@/shared/ui/toast";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "invalid"; issues: FieldIssue[] };

function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel() {
  const { backup } = useRepositories();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<BackupImportMode>("merge");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputId = useId();
  const toast = useToast();

  async function handleExport() {
    setStatus({ kind: "busy" });
    const payload = await backup.exportAll();
    download(
      `track-day-backup-${payload.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
    );
    // The toast announces it; an inline copy would be read out twice.
    setStatus({ kind: "idle" });
    toast.show("Backup downloaded.", "success");
  }

  async function handleImport(file: File) {
    setStatus({ kind: "busy" });
    const result = parseImport(await file.text(), BackupPayload);
    if (!result.ok) {
      setStatus({ kind: "invalid", issues: result.issues });
      return;
    }
    await backup.importAll(result.value, mode);
    await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    setStatus({ kind: "done", message: `Backup from ${result.value.exportedAt} imported.` });
    // Different wording from the inline message so "imported" matches only once.
    toast.show("Import complete.", "success");
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-2xl border border-border p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Download aria-hidden className="size-5" />
          Export
        </h2>
        <p className="text-sm text-muted">
          Download everything — tracks, cars, guides and map images — as a single JSON file.
        </p>
        <div>
          <Button onClick={handleExport} disabled={status.kind === "busy"}>
            Export backup
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Upload aria-hidden className="size-5" />
          Import
        </h2>
        <div role="radiogroup" aria-label="Import mode" className="grid gap-2">
          {(
            [
              [
                "merge",
                "Merge",
                "Keep local data; the most recently edited version of each record wins.",
              ],
              ["replace", "Replace", "Delete all local data first."],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline-2 has-focus-visible:outline-ring"
            >
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 size-4 accent-accent"
              />
              <span className="text-sm">
                <span className="block font-medium">{title}</span>
                <span className="text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "replace" && (
          <p className="flex gap-2 text-sm text-danger">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Replace deletes everything in this browser first. Export a backup before you continue.
          </p>
        )}
        <div>
          <label htmlFor={fileInputId} className="mb-1 block text-sm font-medium">
            Backup file
          </label>
          <input
            id={fileInputId}
            type="file"
            accept="application/json,.json"
            disabled={status.kind === "busy"}
            className="w-full max-w-full min-w-0 text-sm file:mr-3 file:h-10 file:rounded-lg file:border file:border-border file:bg-background file:px-4 file:font-medium file:text-foreground pointer-coarse:file:h-11"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>
      </section>

      <div aria-live="polite" className="md:col-span-2">
        {status.kind === "done" && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            {status.message}
          </p>
        )}
        {status.kind === "invalid" && (
          <IssueList title="This file is not a valid Track Day backup" issues={status.issues} />
        )}
      </div>
    </div>
  );
}
