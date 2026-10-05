"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BackupPayload, parseImport, type FieldIssue } from "@track-day/schema";
import { useId, useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import type { BackupImportMode } from "@/data/repositories";
import { Button } from "@/shared/ui/button";
import { IssueList } from "@/shared/ui/issue-list";

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

  async function handleExport() {
    setStatus({ kind: "busy" });
    const payload = await backup.exportAll();
    download(
      `track-day-backup-${payload.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
    );
    setStatus({ kind: "done", message: "Backup downloaded." });
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
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Export</h2>
        <p className="text-sm text-muted">
          Download everything — tracks, cars, guides and map images — as a single JSON file.
        </p>
        <Button variant="primary" onClick={handleExport} disabled={status.kind === "busy"}>
          Export backup
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Import</h2>
        <fieldset className="space-y-1 text-sm">
          <legend className="sr-only">Import mode</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
            />
            Merge — keep local data; the most recently edited version of each record wins
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            Replace — delete all local data first
          </label>
        </fieldset>
        <div>
          <label htmlFor={fileInputId} className="mb-1 block text-sm font-medium">
            Backup file
          </label>
          <input
            id={fileInputId}
            type="file"
            accept="application/json,.json"
            disabled={status.kind === "busy"}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-foreground"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>
      </section>

      <div aria-live="polite">
        {status.kind === "done" && <p className="text-sm">{status.message}</p>}
        {status.kind === "invalid" && (
          <IssueList title="This file is not a valid Track Day backup" issues={status.issues} />
        )}
      </div>
    </div>
  );
}
