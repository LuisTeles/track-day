"use client";

import { useQuery } from "@tanstack/react-query";
import type { Layout } from "@track-day/schema";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRepositories } from "@/data/provider";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/confirm";
import { useSetMapImage } from "../edit/use-structure-mutations";

/** An object URL for a stored asset, revoked when it changes or unmounts. */
export function useAssetUrl(assetId: string | null) {
  const repos = useRepositories();
  const { data } = useQuery({
    queryKey: queryKeys.asset(assetId ?? "none"),
    queryFn: async () => (await repos.assets.get(assetId!)) ?? null,
    enabled: assetId !== null,
  });
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null);
  const blob = assetId ? data?.blob : undefined;
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // Subscribes the view to a browser resource that must be released.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMade({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  // A URL made for an earlier blob is never shown.
  return made && made.blob === blob ? made.url : null;
}

/** The layout's reference map picture; geometry stays on the outline (ADR-005). */
export function MapImage({ layout, editing }: { layout: Layout; editing: boolean }) {
  const url = useAssetUrl(layout.mapAssetId);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const setImage = useSetMapImage();
  const confirm = useConfirm();
  const alt = `Map image of the ${layout.name} layout`;

  return (
    <section className="space-y-2" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="font-medium">
        Map image
      </h3>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="focus-ring block rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL */}
          <img
            src={url}
            alt={alt}
            className="max-h-60 w-full rounded-lg border border-border object-contain"
          />
        </a>
      ) : (
        !editing && <p className="text-sm text-muted">No map image. Turn on Edit to add one.</p>
      )}
      {editing && (
        <>
          <p className="text-sm text-muted">
            A picture of the layout to look at while you add corners: a track map, a screenshot.
            Large images are scaled down to 1600 px.
          </p>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-label={layout.mapAssetId ? "Replace map image" : "Add map image"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setImage.mutate({ layout, file });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={setImage.isPending}
              onClick={() => input.current?.click()}
            >
              <ImagePlus aria-hidden />
              {setImage.isPending ? "Saving…" : layout.mapAssetId ? "Replace image" : "Add image"}
            </Button>
            {layout.mapAssetId && (
              <Button
                variant="outline"
                disabled={setImage.isPending}
                onClick={() =>
                  void confirm({
                    title: "Remove the map image?",
                    confirmLabel: "Remove image",
                    destructive: true,
                  }).then((ok) => ok && setImage.mutate({ layout, file: null }))
                }
              >
                <Trash2 aria-hidden />
                Remove image
              </Button>
            )}
          </div>
          {setImage.error && (
            <p role="alert" className="text-sm text-danger">
              Could not save the image: {setImage.error.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
