# 003. Next.js with static export

- Status: Accepted
- Date: 2026-10-04
- Supersedes the original plan's Vite + TanStack Router choice.

## Context

The original plan used Vite + React + TanStack Router because the app needs no server. We chose Next.js for its conventions, ecosystem, and an easier path to server features once the backend exists, but v1 must still be hostable for free with no server.

## Decision

- Next.js App Router with `output: "export"`. `next build` emits plain HTML/JS to `apps/web/out`, deployable to any static host (Cloudflare Pages).
- No server-only features: no route handlers, server actions, middleware/proxy, rewrites, or `next/image` optimization (`images.unoptimized`).
- **Routing by query parameter.** Records live in IndexedDB, so their ids are unknown at build time and dynamic segments (`/tracks/[id]`) can't be prerendered. Detail pages use static routes with query params: `/tracks/view?id=…`. Components reading `useSearchParams()` must sit inside `<Suspense>` or the build fails.
- `trailingSlash: true`, so every route is a directory with `index.html` (works on any static host). `NEXT_PUBLIC_BASE_PATH` sets a base path for sub-path hosting.
- Data pages are client components; TanStack Query handles async state.
- Workspace packages are consumed as TypeScript source via `transpilePackages`.

## Consequences

- URLs carry ids as query params, not path segments. If a backend arrives, switching to `[id]` segments is a routing change only.
- Server Components are used only for static shells (layout, page chrome).
- `next dev` errors if an unsupported feature is used, which keeps us honest.
