# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Backstage app (monorepo, Backstage 1.51.0) whose reason for existing is the four **Regis** plugins under `plugins/`. Regis ("regis") is an external tool that scans container images for security/supply-chain/hygiene/observability posture and emits a `report.json` per image plus a published **report index**. These plugins surface that posture inside Backstage's software catalog: per-image scorecards, a portfolio-wide catalog page, posture-over-time trends, and an intake flow for onboarding new images.

The vanilla Backstage scaffolding (`packages/app`, `packages/backend`) is mostly stock — real work lives in `plugins/regis*`.

## Commands

Run tests/lint via the binary directly — `yarn` does **not** put `backstage-cli` on PATH in this repo:

```bash
node_modules/.bin/backstage-cli repo test           # all tests (changed since main)
node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend   # one package
node_modules/.bin/backstage-cli repo test --watch=false path/to/File.test.ts    # one file
node_modules/.bin/backstage-cli repo test --watch=false -t 'partial test name'  # one test by name
node_modules/.bin/backstage-cli repo lint --since origin/main
node_modules/.bin/backstage-cli repo lint            # add :all behavior via repo lint (no --since)
```

`yarn tsc` typechecks. `yarn start` runs the app (frontend + backend together). `yarn test:e2e` runs Playwright. `yarn fix` applies codegen/lint fixes. After editing exported APIs, Backstage may require `yarn fix` to regenerate `report.api.md` / `config.d.ts`.

## Plugin layout & dependency direction

Four workspace packages, depended on in this order (`regis-common` is the shared kernel — never import upward):

- **`@regis/backstage-plugin-regis-common`** (`role: common-library`) — isomorphic types, annotation/label constants, and Ajv-based validators (`validateReport`, `validateReportIndex`). The Regis report/index **JSON schemas live here** (`src/schema/*.json`) and are the source of truth for the wire format; `SUPPORTED_SCHEMA_VERSION` / `SUPPORTED_INDEX_SCHEMA_VERSION` gate which versions load. All catalog annotation keys (`regis.io/report-url`, `regis.io/image-ref`, `regis.io/tier`, etc.) and the `REGIS_RELATION_ALIAS_OF` relation are defined here.
- **`@regis/backstage-plugin-regis-backend`** (`role: backend-plugin`) — the `regis` backend plugin **and** a catalog backend module (entity provider + alias-relation processor).
- **`@regis/backstage-plugin-regis-scaffolder-backend`** (`role: backend-plugin-module`) — one scaffolder action, `regis:index:add-entry`, for the image-onboarding (intake) flow.
- **`@regis/backstage-plugin-regis`** (`role: frontend-plugin`) — new-frontend-system plugin; all UI.

## How the backend fits together

`plugins/regis-backend/src/plugin.ts` (`pluginId: 'regis'`) wires services and three scheduled tasks. Two distinct ingestion paths exist and are independently toggled by config:

1. **On-demand report fetch (Phase 1).** `ReportService` + `CatalogAggregator` read the `regis.io/report-url` annotation off catalog entities, fetch the `report.json` server-side via `HttpReportSource`, validate it, and cache it in an `InMemoryTtlStore` (`regis.cacheTtlSeconds`, default 1800). A `scope: 'local'` task warms the snapshot every 30 min so every replica's in-memory cache is populated. This path works with no extra config.

2. **Catalog entity provider (Phase 2).** Only active when `regis.catalog.indexDirUrl` is set. The catalog module in `plugins/regis-backend/src/module.ts` (`catalogModuleRegisEntityProvider`) registers `RegisEntityProvider`, which reads the **published report index** (an `index.json` + `images/<slug>.json` fragments, see `provider/`) and mints `Resource` entities (container images + playbooks) directly into the catalog — instead of relying on hand-written `regis-catalog.yaml`. `RegisAliasRelationProcessor` is **always** registered (even without `indexDirUrl`) and links images that share a digest via `regis.io/image-aliases` → `REGIS_RELATION_ALIAS_OF`.

3. **History & trends.** `KnexReportHistoryStore` (real DB, `coreServices.database`) persists one posture snapshot per image per tick via `RegisHistoryRecorder` (`scope: 'global'` — only one replica writes). `ReportHistoryService` serves a single image's trajectory; `PortfolioTrendAggregator` serves portfolio-wide trend buckets (cached, warmed `scope: 'local'`). `regis.catalog.historySeedUrl` loads a one-shot synthetic history JSON on boot (idempotent) so the Trajectory card has data without waiting for ticks.

Router (`router.ts`) exposes: `GET /report` (single, by entity ref), `GET /reports` (catalog-wide snapshot), `GET /report/history` (one image's trajectory), `GET /portfolio/trend` (aggregated buckets), `GET /health` (unauthenticated).

**Scope discipline matters:** `local` = warm per-replica in-memory caches; `global` = shared-DB writes that must run once. Preserve this when touching scheduled tasks.

## Frontend (new frontend system)

`plugins/regis/src/plugin.tsx` declares extensions via Blueprints (`EntityCardBlueprint`, `EntityContentBlueprint`, `PageBlueprint`, `ApiBlueprint`) — there is no legacy `createPlugin`/routable-extension wiring. Extensions are gated by entity-type filters in `components/imageRelations.ts` (`isContainerImage`, `isComponentWithImageDeps`, `isRegisPlaybook`) and `isRegisAvailable` from the common package. All backend calls go through `RegisClient` (`api/RegisClient.ts`) behind `regisApiRef`. Two standalone pages: `/regis` (catalog table) and `/regis-portfolio` (portfolio trends dashboard).

## Conventions

- **Documentation style:** prose docs (READMEs, `docs/`, design/plan docs, this file) follow the [Google developer documentation style guide](https://developers.google.com/style) — second person, present tense, active voice, sentence case headings.
- **TypeScript style:** code follows the [Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html), within what the Backstage ESLint/Prettier config enforces.
- **UI/component design:** frontend plugin UI follows the [Backstage component design guidelines](https://backstage.io/docs/dls/component-design-guidelines/) — reuse Backstage core components, match catalog UX patterns, keep cards/tabs consistent with the rest of the app.
- **Tests are colocated** (`X.ts` + `X.test.ts`) and dense — there is near-1:1 test coverage. Match this: add/adjust the sibling `.test.ts` for any change. The codebase follows TDD; prefer writing the failing test first.
- **Schema/version gating:** when changing the report or index wire format, update the JSON schema in `regis-common/src/schema/`, the TypeScript types, the validators, and bump/guard the `SUPPORTED_*_SCHEMA_VERSION` — fixtures live in `regis-common/src/__fixtures__` and `examples/`.
- **Demo data is generated.** Everything in `examples/` (catalog YAML, reports, index fragments, history) comes from `examples/regis-dataset.cjs`. Edit the generator and run `node examples/regis-dataset.cjs` — do not hand-edit the generated files. `examples/README.md` documents the demo dataset and how to run it end-to-end.
- **Design & planning docs** live in `docs/superpowers/specs/` (designs) and `docs/superpowers/plans/` (implementation plans), dated and per-phase. Consult the relevant one before large changes; the project has been built in numbered phases/slices.
- Changesets (`.changeset/`) are used for versioning published plugins.
