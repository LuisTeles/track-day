import type { NextConfig } from "next";

// Static export: the app is 100% client-side (data lives in IndexedDB), so it
// can be hosted on any static host. See docs/adr/003-nextjs-static-export.md.
const nextConfig: NextConfig = {
  output: "export",
  // Needed when served from a sub-path, e.g. GitHub Pages project sites.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  // Keep the dev-only indicator clear of the map toolbar (bottom-left).
  devIndicators: { position: "bottom-right" },
  transpilePackages: ["@track-day/schema", "@track-day/prompts", "@track-day/osm-track"],
};

export default nextConfig;
