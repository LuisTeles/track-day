"use client";

import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { SHORTCUTS } from "./shortcuts";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Keyboard shortcuts</AlertDialogTitle>
        <AlertDialogDescription>Available on the track map.</AlertDialogDescription>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="contents">
              <dt>
                <kbd className="rounded-md border border-border bg-surface px-1.5 font-mono text-xs">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-muted">{s.description}</dd>
            </div>
          ))}
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Close</Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
