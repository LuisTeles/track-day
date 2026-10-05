# 001. Frontend-only, behind a repository layer

- Status: Accepted
- Date: 2026-10-04

## Context

v1 must be free to host and run with no accounts or servers, but a backend (sync, shared track library) is on the roadmap. We don't want adding one to mean rewriting the UI.

## Decision

- v1 is a static web app; all data lives in the browser.
- UI code never touches storage directly. It uses the interfaces in `apps/web/src/data/repositories.ts`, obtained through `useRepositories()`. v1 binds the IndexedDB implementations in `data/local/`; a backend build would bind `data/http/`.
- Every repository method is async, even where IndexedDB could be wrapped synchronously.
- Ids are client-generated UUIDs. Every entity has `createdAt`, `updatedAt` and `deletedAt` (soft delete).
- `packages/schema` holds the Zod schemas and is the future API contract.

## Consequences

- Adding a backend = implementing the interfaces over HTTP, plus sync. Records created offline keep their ids.
- Soft deletes mean lists must filter `deletedAt`, and storage grows until a future purge/compaction.
- The backup "merge" import already implements last-write-wins on `updatedAt`, which is the starting point for sync.
