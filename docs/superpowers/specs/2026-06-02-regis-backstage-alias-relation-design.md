# Regis Backstage — `aliasOf` Catalog Relation — Design

> **Date**: 2026-06-02
> **Status**: Design approved (brainstorming), pending implementation plan
> **Scope**: Promote image aliases (tags sharing a digest) from a display-only
> annotation to a first-class catalog **relation** (`aliasOf`), plus an "Aliases"
> entity card. Builds on the entity model
> (`2026-06-01-regis-backstage-entity-model-design.md`) and the merged Phase 2
> provider + frontend surfacing.

## Context

The Phase 2 provider links images that resolve to the same digest via the
`regis.io/image-aliases` annotation (a comma-separated list of sibling **image
refs**, for display/search). The entity-model spec flagged a real catalog
**relation** as a "Phase 2 nice-to-have", noting custom relations don't render in
the native overview Relations card.

Two findings shape this design:

1. **`@backstage/plugin-catalog-graph` is already in the demo app.** It renders
   *arbitrary* relation types (with their label), so an `aliasOf` relation is
   visualised in the Catalog Graph for free and is queryable via the catalog API.
2. **Custom relations are emitted by a `CatalogProcessor`**, not by an
   `EntityProvider` (providers emit entities; processors emit relations during
   processing). A processor sees one entity at a time with no catalog query, so it
   must read the relation targets off the entity itself.

To keep relation targets correct in all cases (including hash-suffixed names from
collisions), the **provider records the siblings' entity refs** in a new
annotation, which the processor reads directly — no re-derivation, no edge cases.

## Locked decisions

| Axis | Decision |
| --- | --- |
| Relation type | **`aliasOf`** — bare (idiomatic, reads well as a graph edge label), **symmetric** |
| Emission | A **`CatalogProcessor`** registered via `catalogProcessingExtensionPoint.addProcessor` (unconditional — works for provider-minted *and* static-catalog images) |
| Target source | **Entity refs recorded by the provider** in a new `regis.io/alias-of` annotation (robust; no re-derivation) |
| `image-aliases` | **Kept** (image refs, display/search) — unchanged contract |
| Frontend | An **"Aliases" `EntityCard`** that reads the `aliasOf` relation and renders `EntityRefLink`s |
| Native Relations card | Not changed (won't list custom types) — the Catalog Graph + the new card cover visibility |

## A. Contract (`regis-common`)

Two new constants in `src/catalog.ts` (+ exported from the index):

```ts
/** Catalog relation type linking image Resources that share a digest (symmetric). */
export const REGIS_RELATION_ALIAS_OF = 'aliasOf';
/** Annotation: entity refs of sibling images sharing this digest (relation source). */
export const REGIS_ANNOTATION_ALIAS_OF = 'regis.io/alias-of';
```

`regis.io/alias-of` holds **entity refs** (`resource:default/library-nginx-latest`),
distinct from `regis.io/image-aliases` (image refs, retained for display/search).

## B. Provider — record sibling entity refs (`regis-backend`)

`buildEntities` becomes two-pass so each image knows its siblings' **entity names**:

1. **Pass 1 — names**: iterate images in order, assigning `name = imageEntityName(repo, tag, imageRef, taken)` (the existing collision/overflow logic), building `nameByImageRef: Map<string,string>`.
2. **Pass 2 — entities**: for each image, `aliasMap.get(imageRef)` gives sibling image refs; map each through `nameByImageRef` → sibling **entity refs** `resource:${namespace}/${name}`. `buildImageEntity` sets, in addition to the existing `image-aliases` (image refs):

   ```yaml
   regis.io/alias-of: resource:default/library-nginx-latest
   ```

Because the provider assigns the names, the recorded entity refs are exact even
when a name was hash-suffixed — no re-derivation, no missed links.

`buildImageEntity` gains an `aliasEntityRefs: string[]` argument; it sets
`regis.io/alias-of` only when non-empty.

## C. Processor — emit the relation (`regis-backend`)

New `src/processor/RegisAliasRelationProcessor.ts` implementing `CatalogProcessor`:

```ts
async postProcessEntity(entity, _location, emit) {
  if (entity.kind === 'Resource'
      && entity.spec?.type === REGIS_RESOURCE_TYPE_IMAGE
      && entity.metadata.annotations?.[REGIS_ANNOTATION_ALIAS_OF]) {
    const source = getCompoundEntityRef(entity);
    for (const ref of splitRefs(entity.metadata.annotations[REGIS_ANNOTATION_ALIAS_OF])) {
      emit(processingResult.relation({ source, type: REGIS_RELATION_ALIAS_OF, target: parseEntityRef(ref) }));
    }
  }
  return entity;
}
```

- `getProcessorName()` → `'RegisAliasRelationProcessor'`.
- `splitRefs` splits the comma-separated annotation, trims, drops empties; invalid
  refs are skipped (guarded `parseEntityRef`) so one bad value can't break processing.
- **Symmetry** is data-driven: every aliased entity carries its siblings in
  `alias-of`, so processing each emits its own outgoing `aliasOf` per sibling — the
  relation shows on both ends.
- Registered in the existing catalog module (`module.ts`) via
  `catalog.addProcessor(new RegisAliasRelationProcessor())`, **unconditionally**
  (independent of `regis.catalog.indexUrl`, so static-catalog images get it too).

## D. Frontend — "Aliases" card (`regis` plugin)

New `src/components/RegisAliasesCard.tsx`:

- `useEntity()`; from `entity.relations`, keep `type === REGIS_RELATION_ALIAS_OF`,
  collect unique `targetRef`s.
- Render an `InfoCard` titled "Aliases" with one `EntityRefLink` per target. If
  there are none, render nothing (the card is absent on non-aliased images).

Registered as an `EntityCardBlueprint` in `plugin.tsx` with filter
`isContainerImage` (kind `Resource` + `spec.type === 'container-image'`) — a new
predicate added next to `isRegisPlaybook` in `imageRelations.ts`.

The card consumes the relation (not the annotation), dogfooding it and giving
clickable links to the aliased entities.

## E. Example dataset

`examples/regis-dataset.cjs` is extended to emit `regis.io/alias-of` (entity refs)
for aliased images, then `examples/regis-catalog.yaml` is regenerated. This makes
`nginx:1.27` ↔ `nginx:latest` carry the relation in the **static** catalog too, so
the demo shows the `aliasOf` edge and the Aliases card without the provider.

## Components & files

| File | Change |
| --- | --- |
| `plugins/regis-common/src/catalog.ts` | add `REGIS_RELATION_ALIAS_OF`, `REGIS_ANNOTATION_ALIAS_OF` |
| `plugins/regis-common/src/index.ts` | export the two constants |
| `plugins/regis-backend/src/provider/buildEntities.ts` | two-pass name map; set `alias-of`; `buildImageEntity` gains `aliasEntityRefs` |
| `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.ts` | **new** — emits `aliasOf` |
| `plugins/regis-backend/src/module.ts` | `catalog.addProcessor(...)` (unconditional) |
| `plugins/regis/src/components/imageRelations.ts` | add `isContainerImage` predicate |
| `plugins/regis/src/components/RegisAliasesCard.tsx` | **new** — Aliases card |
| `plugins/regis/src/plugin.tsx` | register the `aliasesCard` extension |
| `examples/regis-dataset.cjs` + `examples/regis-catalog.yaml` | emit + regenerate `alias-of` |

## Error handling & edge cases

| Case | Behaviour |
| --- | --- |
| Image with no aliases | No `alias-of` annotation → processor emits nothing → no Aliases card. |
| Malformed ref in `alias-of` | Skipped (guarded `parseEntityRef`); other refs still emitted. |
| Target entity not yet processed | Relation still emitted; Backstage tolerates it and resolves once both exist. |
| Non-image / non-Regis entity | Processor ignores it (kind/type guard). |
| Duplicate targets on an entity | Card dedupes by `targetRef`. |

## Testing

| Level | Coverage |
| --- | --- |
| **regis-common** | constants exported (extend `catalog.test.ts`). |
| **regis-backend** | `buildEntities`: `alias-of` carries sibling **entity refs** (nginx:1.27 ↔ latest), absent when no aliases. `RegisAliasRelationProcessor`: emits one `aliasOf` relation per `alias-of` ref with correct source/target; emits nothing without the annotation / for non-image kinds; skips malformed refs. `module`: processor registered (extend the existing `startTestBackend` test with an `addProcessor` spy). |
| **regis-frontend** | `RegisAliasesCard`: renders an `EntityRefLink` per `aliasOf` relation target; nothing when none; dedupes. `isContainerImage` predicate. (`renderInTestApp` + `EntityProvider` with `relations` + `mountedRoutes` for `EntityRefLink`.) |
| **examples** | regenerate; the dataset validation (refs resolve) still passes. |

## Non-goals

- Changing the native overview Relations card (it won't list custom types — covered by the Catalog Graph + the Aliases card).
- Removing `regis.io/image-aliases` (kept for display/search).
- Aliasing across different repositories by digest beyond what the index already groups.

## References

- Entity model: `docs/superpowers/specs/2026-06-01-regis-backstage-entity-model-design.md`
- [Backstage — Extending the model (custom relations/processors)](https://backstage.io/docs/features/software-catalog/extending-the-model)
- [Backstage — Catalog Graph](https://backstage.io/docs/features/software-catalog/catalog-customization)
- Provider/aliases: `plugins/regis-backend/src/provider/buildEntities.ts` (`groupAliasesByDigest`)
