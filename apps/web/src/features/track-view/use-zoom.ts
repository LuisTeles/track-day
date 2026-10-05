import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { IDENTITY, type Affine, type Size } from "./geometry/types";

const SCALE_EXTENT: [number, number] = [0.5, 12];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Pan and zoom (wheel, drag, pinch) via d3-zoom. The transform is
 * applied on top of the fit-to-viewport transform, so identity = "fitted".
 */
/**
 * Attach to the element that contains both the map and its overlays, so wheel,
 * drag and pinch work over markers too (their events bubble up to it).
 */
export function useZoom(targetRef: RefObject<HTMLElement | null>, viewport: Size) {
  const [transform, setTransform] = useState<Affine>(IDENTITY);
  const behavior = useRef<ZoomBehavior<HTMLElement, unknown> | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const z = zoom<HTMLElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on("zoom", (event: { transform: Affine }) => {
        const { k, x, y } = event.transform;
        setTransform({ k, x, y });
      });
    select(el).call(z).on("dblclick.zoom", null);
    behavior.current = z;
    return () => {
      select(el).on(".zoom", null);
      behavior.current = null;
    };
  }, [targetRef]);

  // Keep panning within a margin around the viewport.
  useEffect(() => {
    const { width, height } = viewport;
    behavior.current?.translateExtent([
      [-width * 0.75, -height * 0.75],
      [width * 1.75, height * 1.75],
    ]);
  }, [viewport]);

  const animate = useCallback(
    (apply: (z: ZoomBehavior<HTMLElement, unknown>, el: HTMLElement) => void) => {
      const el = targetRef.current;
      const z = behavior.current;
      if (el && z) apply(z, el);
    },
    [targetRef],
  );

  const duration = () => (reducedMotion() ? 0 : 300);

  const reset = useCallback(
    () =>
      animate((z, el) =>
        select(el).transition().duration(duration()).call(z.transform, zoomIdentity),
      ),
    [animate],
  );
  const zoomBy = useCallback(
    (factor: number) =>
      animate((z, el) => select(el).transition().duration(duration()).call(z.scaleBy, factor)),
    [animate],
  );

  /** Pans by a screen-space offset, keeping the zoom level. */
  const panBy = useCallback(
    (dx: number, dy: number) =>
      animate((z, el) => {
        const k = zoomTransform(el).k;
        select(el)
          .transition()
          .duration(duration())
          .call(z.translateBy, dx / k, dy / k);
      }),
    [animate],
  );

  return { transform, reset, zoomBy, panBy };
}
