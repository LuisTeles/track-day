"use client";

import { Button } from "@/shared/ui/button";

/** Sticky save bar shared by the edit forms: unsaved hint, "Saved", Cancel and Save. */
export function FormFooter({
  dirty,
  pending,
  saved,
  failed,
  onCancel,
  saveLabel,
}: {
  dirty: boolean;
  pending: boolean;
  saved: boolean;
  failed: boolean;
  onCancel(): void;
  /** Accessible name of the save button, e.g. "Save track details". */
  saveLabel: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-3 flex items-center gap-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
      {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
      <p aria-live="polite" className="text-sm text-muted">
        {saved && !dirty && "Saved"}
      </p>
      <Button variant="outline" className="ml-auto" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending} aria-label={saveLabel}>
        {failed ? "Retry" : "Save"}
      </Button>
    </div>
  );
}

/** Cmd/Ctrl+Enter submits, like the other edit forms. */
export function submitOnModEnter(submit: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
}
