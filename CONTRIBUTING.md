# Contributing

Thanks for helping! Bug reports, features, and **track data** are all welcome.

## Development

```sh
corepack enable
pnpm install
pnpm dev
```

Before opening a PR, run what CI runs:

```sh
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

## Workflow

- Trunk-based: branch off `main`, open a PR, merge when CI is green.
- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `feat: add corner editor`, `fix(schema): …`, `docs: …`. A commit hook (commitlint) checks this; release-please uses it to version and write the changelog.
- A pre-commit hook runs ESLint and Prettier on staged files.

## Guidelines

- **UI never touches storage directly** — go through the repository interfaces in `apps/web/src/data/repositories.ts` ([ADR-001](docs/adr/001-frontend-only-repository-pattern.md)).
- **Schemas are the contract.** Changing a payload shape means bumping `CURRENT_SCHEMA_VERSION` and adding a migration with a test ([data model](docs/data-model.md#changing-the-model)).
- **No server-only Next.js features** — the app is a static export ([ADR-003](docs/adr/003-nextjs-static-export.md)).
- Significant decisions get an ADR in `docs/adr/`.
- Accessibility: keyboard-navigable, labelled controls, and never color as the only signal.

## Contributing track data

Export a track from the app (or write one by hand against the JSON Schema) and open a "Track submission" issue or a PR adding it to `examples/`. Only include information you're confident in — use `null` for anything unknown.
