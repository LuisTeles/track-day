"use client";

import type { Corner, CornerGuide } from "@track-day/schema";
import { useId, useState } from "react";
import { useAppendNote } from "@/features/track-view/edit/use-edit-mutations";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

/** One-field sheet: a dated line on the car's (or the corner's) notes. */
export function QuickNote({
  trackId,
  corner,
  guideId,
  existing,
  open,
  onOpenChange,
}: {
  trackId: string;
  corner: Corner;
  guideId: string | null;
  existing: CornerGuide | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const [text, setText] = useState("");
  const append = useAppendNote(trackId);
  const id = useId();

  return (
    <AlertDialog open={open} onOpenChange={(next) => !append.isPending && onOpenChange(next)}>
      <AlertDialogContent data-theme="practice">
        <AlertDialogTitle>Note for T{corner.number}</AlertDialogTitle>
        <AlertDialogDescription>
          {guideId
            ? `Saved to this car’s notes for T${corner.number}.`
            : `No car selected: saved to the corner notes for T${corner.number}.`}
        </AlertDialogDescription>
        <div className="space-y-1">
          <Label htmlFor={id}>Note</Label>
          <Textarea
            id={id}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-24 text-base"
          />
        </div>
        {append.error && (
          <p role="alert" className="text-sm text-danger">
            Could not save: {append.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={append.isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            aria-label="Save note"
            disabled={append.isPending || text.trim() === ""}
            onClick={() =>
              append.mutate(
                { text, corner, guideId, existing },
                {
                  onSuccess: () => {
                    setText("");
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {append.error ? "Retry" : "Save"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
