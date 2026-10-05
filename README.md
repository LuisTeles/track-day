# Track Day

Record and study track knowledge — corners, reference points, speeds, gears — **per car and per sim**, so learning a new track (or a new car on a known track) has a structured starting point.

- **AI-assisted, no API keys.** The app gives you a prompt; paste it into any AI chat with a track map, paste the JSON back. It's validated, previewed, then saved.
- **Car-specific guides.** Brake references, entry/min/exit speeds (km/h), gear and line for every corner — per car or car class, per sim (Assetto Corsa, ACC, iRacing, LMU, real world…).
- **Runs entirely in your browser.** No account, no server. Data lives in IndexedDB; export it as JSON for backups and sharing. Installable, and works offline after the first visit.
- **Practice mode.** One corner per screen for a phone, tablet or second monitor next to the rig: brake point, pressure, gear, min speed, a one-line cue and the corner drawn from real geometry. Step with keys, taps, swipes or (experimental) a wheel button.

> Status: early development (milestones M0–M1 done). See the [project plan](docs/PLAN.md).

## Getting started

Requirements: Node 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev          # http://localhost:3000
```

| Command                     | What it does                                   |
| --------------------------- | ---------------------------------------------- |
| `pnpm dev`                  | Run the web app in development mode            |
| `pnpm build`                | Static export to `apps/web/out`                |
| `pnpm test`                 | Unit + component tests (Vitest), all packages  |
| `pnpm test:e2e`             | Playwright against the built app (build first) |
| `pnpm typecheck`            | TypeScript, all packages                       |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                              |

## Repository layout

```
apps/web            Next.js app, exported as a static site
packages/schema     Zod schemas, types, JSON Schema, migrations — the data contract
packages/prompts    AI prompt templates (track import, car guide)
examples/           Sample track JSON (Interlagos)
docs/               Plan, data model, ADRs
```

## Documentation

- [Project plan & roadmap](docs/PLAN.md)
- [Data model](docs/data-model.md)
- [Architecture decisions](docs/adr/README.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE) for the code. Example track data in `examples/` is derived from OpenStreetMap (ODbL) — see [examples/ATTRIBUTION.md](examples/ATTRIBUTION.md).
