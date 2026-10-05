# 002. IndexedDB via Dexie for local storage

- Status: Accepted
- Date: 2026-10-04

## Context

We need structured, queryable local storage that survives reloads and can hold images (track maps). `localStorage` is synchronous, string-only and limited to ~5 MB.

## Decision

Use IndexedDB through Dexie 4.

- One table per entity, indexed on foreign keys (`trackId`, `layoutId`, …) and `updatedAt`.
- Images are stored as `Blob`s in `assetBlobs`, with metadata in `assets`. Entities reference them by `assetId`, so they can move to object storage later.
- Every write is validated with the entity's Zod schema first.
- Schema changes add a new `db.version(n)`; old versions are never edited.

## Consequences

- Data is per browser profile. Users must export backups to move or protect data; the Backup page makes that explicit.
- Tests use `fake-indexeddb` in the Node environment (jsdom's `Blob` doesn't survive structured cloning).
- Awaiting non-IndexedDB promises inside a Dexie transaction closes it, so blob encoding happens outside transactions.
