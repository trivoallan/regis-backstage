# Regis Backstage — Frontend Surfacing (Phase 2 follow-up) — Design

> **Date**: 2026-06-02
> **Status**: Design approved (brainstorming), pending implementation plan
> **Scope**: Surface the Phase 2 entity model in the frontend — an aggregate
> posture card on Components and Playbooks, plus catalog-page polish. Companion to
> `2026-06-01-regis-backstage-entity-model-design.md` (entity model) and the Phase 2
> entity provider (merged in #3).

## Context & key finding

The Phase 2 provider mints `container-image` and `regis-playbook` `Resource` entities.
A baseline audit of the existing frontend (`plugins/regis`, new frontend system) found
that **most "surfacing" already works for free**:

- The Regis **tab** and **scorecard card** filter on `isRegisAvailable` =
  `hasAnnotation('regis.io/report-url')`, which is **kind-agnostic**. Minted image
  Resources carry that annotation, so the tab/card already appear on them.
- The demo app uses the **default NFS catalog entity page**, which auto-places any
  extension whose `filter` matches — across all kinds. No per-kind wiring needed.
- The backend `getReport(entityRef)` resolves the annotation on **any** entity (Resource
  included); the `/regis` page (`listReports`) is already kind-agnostic.

So this follow-up builds only the **genuine gaps**:

1. An aggregate **"images of this service"** card on Components that depend on images.
2. A posture card on the **playbook** Resource (which carries no `report-url`, so the
   tab/card don't appear; its native Relations card shows the images but no posture).
3. **Catalog-page polish**: image-ref, kind, and failing-tags columns.

## Locked decisions

| Axis | Decision |
| --- | --- |
| Implementation surface | **Frontend-only**, except one contract field (`imageRef`) |
| Aggregate cards | **One shared component** reused on Component (`dependsOn`) and Playbook (`dependencyOf`) |
| Card data source | Reuse **`listReports()`** + the entity's **`relations`**; intersect client-side (no new endpoint) |
| Failing tags | **Derived from `byTag`** client-side (not added to the contract) |
| `imageRef` | **Added to `ReportSummary`**, populated by the backend aggregator from `report.request` |
| Contract types | **Consolidated into `regis-common`** (remove the FE/BE duplication of `ReportSummary`/`ReportEnvelope`) |
| Existing tab/card/page | **Unchanged** (already surface on image Resources) |

## A. Contract: `imageRef` on `ReportSummary` (+ consolidation)

`ReportEnvelope` and `ReportSummary` are currently **duplicated** — defined in both
`plugins/regis-backend/src/service/types.ts` and `plugins/regis/src/api/RegisApi.ts`
(identical shapes). This is the `/reports` + `/report` **wire contract**; it belongs in
`regis-common`.

- **Move** both interfaces into `regis-common` (`src/report-api.ts`), add
  `imageRef?: string` to `ReportSummary`, and export them from the package index.
- `plugins/regis-backend/src/service/types.ts` **re-exports** them from `regis-common`
  (existing import sites `from './types'` keep working).
- `plugins/regis/src/api/RegisApi.ts` imports them from `regis-common` (drops its copies;
  keeps `RegisApi` interface + `regisApiRef`). `regis-common` is already a FE dependency.
- **`CatalogAggregator`** populates `imageRef` for each `ok` summary as
  `` `${report.request.registry}/${report.request.repository}:${report.request.tag}` ``.

`ReportSummary` after the change:

```ts
export interface ReportSummary {
  entityRef: string;
  status: 'ok' | 'error' | 'pending';
  imageRef?: string;                 // NEW — canonical registry/repository:tag
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}
```

## B. Shared posture card (service + playbook)

A single presentational component renders the posture of a set of related images:

```ts
function RegisImagePostureCard(props: { title: string; imageRefs: string[] }): JSX.Element
```

**Data flow**: `useApi(regisApiRef).listReports()` → keep summaries whose `entityRef` is in
`imageRefs` → render. (`listReports` is cached server-side; one call regardless of N.)

**Render**: an `InfoCard` titled `title` with
- a **distribution** line — counts by tier (e.g. "3 images · 2 Gold · 1 Bronze") plus an
  `unknown/error` bucket;
- a compact table — image (the summary's `imageRef`, falling back to a name parsed from
  `entityRef`), tier chip, score, and an `EntityRefLink` to the entity.

**States**: `Progress` while loading; `ResponseErrorPanel` on error; if `imageRefs` is empty
or none have reports, render a one-line "No Regis-tracked images yet" (no empty card).

Two thin `EntityCardBlueprint` extensions feed it (in `plugins/regis/src/plugin.tsx`):

| Extension | `filter` | `imageRefs` from | Title |
| --- | --- | --- | --- |
| `serviceImagesCard` | `kind === 'Component'` AND some `dependsOn` relation targets a `resource:` | `relations` where `type==='dependsOn'` and target kind `resource` | "Images of this service" |
| `playbookImagesCard` | `kind === 'Resource'` AND `spec.type === 'regis-playbook'` | `relations` where `type==='dependencyOf'` and target kind `resource` | "Assessed images" |

Relation targets are entityRefs (`resource:default/library-nginx-1.27`) in the same
normalized form as `listReports()` summaries' `entityRef`, so intersection is a string match.
The wrappers read `useEntity()` and compute `imageRefs` with `parseEntityRef` to keep only
`resource` targets.

## C. Catalog page polish (`/regis`)

`RegisCatalogPage` gains columns on the existing `Table` (which already has search + paging):

- **Image** — `row.imageRef ?? displayName(row.entityRef)`.
- **Kind** — `parseEntityRef(row.entityRef).kind` (so Component-carried vs Resource-carried
  reports are distinguishable).
- **Tier**, **Score**, **Status** — unchanged.
- **Failing tags** — derived from `row.byTag`: the tags whose score `< 100`, rendered as
  chips (empty when all pass).

Columns are sortable; tier is filterable via the table's column search. No new endpoint.

## Components & files

| File | Change |
| --- | --- |
| `plugins/regis-common/src/report-api.ts` | **New** — `ReportEnvelope`, `ReportSummary` (+ `imageRef`) |
| `plugins/regis-common/src/index.ts` | Export the two types |
| `plugins/regis-backend/src/service/types.ts` | Re-export from `regis-common` |
| `plugins/regis-backend/src/service/CatalogAggregator.ts` | Populate `imageRef` |
| `plugins/regis/src/api/RegisApi.ts` | Import the two types from `regis-common` |
| `plugins/regis/src/components/RegisImagePostureCard.tsx` | **New** — shared card |
| `plugins/regis/src/components/imageRelations.ts` | **New** — `imageRefsFromRelations(entity, relationType)` helper |
| `plugins/regis/src/components/RegisCatalogPage.tsx` | New columns (imageRef, kind, failing tags) |
| `plugins/regis/src/plugin.tsx` | Add `serviceImagesCard` + `playbookImagesCard` extensions |

## Error handling & edge cases

| Case | Behaviour |
| --- | --- |
| Component depends on non-Regis resources only | Card resolves zero matching summaries → "No Regis-tracked images yet". |
| `imageRef` absent (older summary / error status) | Card + page fall back to a name parsed from `entityRef`. |
| `listReports` error | `ResponseErrorPanel` in the card / page. |
| Playbook with no assessed images | "No Regis-tracked images yet". |
| Relations missing on the entity | Treated as empty `imageRefs` → empty state. |

## Testing

| Level | Coverage |
| --- | --- |
| **regis-common** | Types only (no runtime); verified by consumers + `tsc`. |
| **regis-backend** | `CatalogAggregator.test.ts`: assert `imageRef` populated from `report.request`. |
| **regis-frontend** | `RegisImagePostureCard.test.tsx` (distribution + rows + empty state, mock `regisApiRef.listReports`); `imageRelations.test.ts` (relation→refs extraction, both directions); wrapper render tests via `EntityProvider` with `relations`; `RegisCatalogPage.test.tsx` (imageRef/kind/failing-tags columns). |

All FE tests use `renderInTestApp` + `TestApiProvider([[regisApiRef, mock]])` + `EntityProvider`.

## Non-goals

- Changing the existing tab/card/page behaviour (already surface on image Resources).
- A new backend endpoint for batched reports (client-side intersect of `listReports` suffices).
- The optional `regis.io/aliasOf` relation, Phase-1→2 annotation migration, persistent
  store — out of scope (tracked in the entity-model spec).

## References

- Entity model: `docs/superpowers/specs/2026-06-01-regis-backstage-entity-model-design.md`
- Phase 2 provider: merged in PR #3 (`01e8325`)
- Frontend plugin: `plugins/regis/src/plugin.tsx`, `src/components/`, `src/api/`
- [Backstage — Common Extension Blueprints](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/)
