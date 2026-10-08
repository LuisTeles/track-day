"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { useToast } from "@/shared/ui/toast";

export function DeleteTrackButton({ trackId, trackName }: { trackId: string; trackName: string }) {
  const { trackDeletion } = useRepositories();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => trackDeletion.deleteTrack(trackId),
    onSuccess: async () => {
      toast.show(`Deleted ${trackName}.`, "success");
      // Leave first, so the open track view doesn't refetch a deleted track.
      router.push("/");
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <IconButton label="Delete track" className="text-muted hover:text-danger">
          <Trash2 />
        </IconButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete {trackName}?</AlertDialogTitle>
        <AlertDialogDescription>
          This removes its layouts, corners and guides from this browser. Export a backup first if
          you might want it back.
        </AlertDialogDescription>
        {remove.error && (
          <p role="alert" className="text-sm text-danger">
            Could not delete the track: {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={remove.isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || remove.isSuccess}
          >
            {remove.isPending ? "Deleting…" : "Delete track"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
