"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CornerGuide } from "@track-day/schema";
import { CheckCheck } from "lucide-react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { isEstimate } from "@/features/guides/estimate";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";

/** Values confirmed after driving: no longer AI or low confidence; the numbers stay. */
export const confirmedPatch = (g: Pick<CornerGuide, "source">) => ({
  source: g.source === "ai" ? ("manual" as const) : g.source,
  confidence: null,
});

export function useConfirmEstimates() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cornerGuides }: { guideId: string; cornerGuides: CornerGuide[] }) => {
      for (const g of cornerGuides.filter(isEstimate)) {
        await repos.cornerGuides.update(g.id, confirmedPatch(g));
      }
    },
    onSuccess: (_r, { guideId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.cornerGuides(guideId) }),
  });
}

/** One corner: shown only while its values are an estimate. */
export function ConfirmEstimateButton({ cornerGuide }: { cornerGuide: CornerGuide | undefined }) {
  const confirmEstimates = useConfirmEstimates();
  if (!cornerGuide || !isEstimate(cornerGuide)) return null;
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={confirmEstimates.isPending}
        onClick={() =>
          confirmEstimates.mutate({ guideId: cornerGuide.guideId, cornerGuides: [cornerGuide] })
        }
      >
        <CheckCheck aria-hidden />
        Mark as confirmed
      </Button>
      {confirmEstimates.error && (
        <p role="alert" className="text-sm text-danger">
          Could not confirm: {confirmEstimates.error.message}
        </p>
      )}
    </div>
  );
}

/** Every corner of a car at once, after asking. */
export function ConfirmAllEstimates({
  guideId,
  label,
  cornerGuides,
}: {
  guideId: string;
  label: string;
  cornerGuides: CornerGuide[];
}) {
  const confirmEstimates = useConfirmEstimates();
  const confirm = useConfirm();
  const count = cornerGuides.filter(isEstimate).length;
  if (count === 0) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p>
        {count} corner{count === 1 ? " has" : "s have"} estimated values for {label}.
      </p>
      <Button
        variant="outline"
        disabled={confirmEstimates.isPending}
        onClick={() =>
          void confirm({
            title: `Confirm ${count} estimate${count === 1 ? "" : "s"}?`,
            description:
              "Do this once the values match what you drive. The numbers stay as they are; only the estimate marking goes.",
            confirmLabel: "Confirm all",
          }).then((ok) => ok && confirmEstimates.mutate({ guideId, cornerGuides }))
        }
      >
        <CheckCheck aria-hidden />
        Confirm all estimates
      </Button>
      {confirmEstimates.error && (
        <p role="alert" className="text-danger">
          Could not confirm: {confirmEstimates.error.message}
        </p>
      )}
    </section>
  );
}
