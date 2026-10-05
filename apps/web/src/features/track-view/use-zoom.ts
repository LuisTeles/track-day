import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { IDENTITY, type Affine, type Size } from "./geometry/types";

const SCALE_EXTENT: [number, number] = [0.5, 12];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Pan and zoom (wheel, drag, pinch) on an SVG via d3-zoom. The transform is
 * applied on top of the fit-to-viewport transform, so identity = "fitted".
 */
export function useZoom(svgRef: RefObject<SVGSVGElement | null>, viewport: Size) {
  const [transform, setTransform] = useState<Affine>(IDENTITY);
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on("zoom", (event: { transform: Affine }) => {
        const { k, x, y } = event.transform;
        setTransform({ k, x, y });
      });
    select(svg).call(z).on("dblclick.zoom", null);
    behavior.current = z;
    return () => {
      select(svg).on(".zoom", null);
      behavior.current = null;
    };
  }, [svgRef]);

  // Keep panning within a margin around the viewport.
  useEffect(() => {
    const { width, height } = viewport;
    behavior.current?.translateExtent([
      [-width * 0.75, -height * 0.75],
      [width * 1.75, height * 1.75],
    ]);
  }, [viewport]);

  const animate = useCallback(
    (apply: (z: ZoomBehavior<SVGSVGElement, unknown>, svg: SVGSVGElement) => void) => {
      const svg = svgRef.current;
      const z = behavior.current;
      if (svg && z) apply(z, svg);
    },
    [svgRef],
  );

  const duration = () => (reducedMotion() ? 0 : 300);

  const reset = useCallback(
    () =>
      animate((z, svg) =>
        select(svg).transition().duration(duration()).call(z.transform, zoomIdentity),
      ),
    [animate],
  );
  const zoomBy = useCallback(
    (factor: number) =>
      animate((z, svg) => select(svg).transition().duration(duration()).call(z.scaleBy, factor)),
    [animate],
  );

  return { transform, reset, zoomBy };
}
