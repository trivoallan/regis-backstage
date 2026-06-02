# Regis Backstage — `aliasOf` Relation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote image aliases (tags sharing a digest) to a first-class symmetric `aliasOf` catalog relation, emitted by a processor from provider-recorded entity refs, plus an "Aliases" entity card.

**Architecture:** The provider (`buildEntities`) records each image's sibling **entity refs** in a new `regis.io/alias-of` annotation (robust — no re-derivation). A `CatalogProcessor` reads that annotation and emits `aliasOf` relations; it's registered unconditionally in the catalog module. The frontend adds an "Aliases" card reading the relation; the relation also renders in the already-present Catalog Graph.

**Tech Stack:** TypeScript, Backstage new backend system (`@backstage/plugin-catalog-node` `CatalogProcessor`/`processingResult`, `@backstage/catalog-model`), NFS frontend (`@backstage/plugin-catalog-react`), Jest.

**Conventions (this worktree):**
- Run a package's tests: `( cd plugins/<pkg> && CI=true ../../node_modules/.bin/backstage-cli package test <relative-path> --watchAll=false )`. `yarn workspace … test` does NOT work here.
- Typecheck: `node_modules/.bin/tsc`. Lint a package: `( cd plugins/<pkg> && ../../node_modules/.bin/backstage-cli package lint )`.
- Branch `tritri/regis-alias-relation` (off `main`). Conventional Commits; commit after each green task.

---

## File Structure

| File | Change |
| --- | --- |
| `plugins/regis-common/src/catalog.ts` | add `REGIS_RELATION_ALIAS_OF`, `REGIS_ANNOTATION_ALIAS_OF` |
| `plugins/regis-common/src/index.ts` | export the two new constants |
| `plugins/regis-backend/src/provider/buildEntities.ts` | two-pass name map; `buildImageEntity` gains `aliasEntityRefs`; sets `alias-of` |
| `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.ts` | **new** — emits `aliasOf` |
| `plugins/regis-backend/src/module.ts` | register the processor unconditionally |
| `plugins/regis/src/components/imageRelations.ts` | add `isContainerImage` |
| `plugins/regis/src/components/RegisAliasesCard.tsx` | **new** — Aliases card |
| `plugins/regis/src/plugin.tsx` | register the `aliasesCard` extension |
| `examples/regis-dataset.cjs` + `examples/regis-catalog.yaml` | emit `alias-of`; regenerate |

---

## Task 1: regis-common — relation + annotation constants

**Files:**
- Modify: `plugins/regis-common/src/catalog.ts`
- Modify: `plugins/regis-common/src/index.ts`
- Test: `plugins/regis-common/src/catalog.test.ts`

- [ ] **Step 1: Add failing assertions**

In `plugins/regis-common/src/catalog.test.ts`, add these imports to the existing import block from `./catalog` (`REGIS_RELATION_ALIAS_OF`, `REGIS_ANNOTATION_ALIAS_OF`) and add, inside the `describe('entity vocabulary', …)` block:

```typescript
    expect(REGIS_ANNOTATION_ALIAS_OF).toBe('regis.io/alias-of');
    expect(REGIS_RELATION_ALIAS_OF).toBe('aliasOf');
```

- [ ] **Step 2: Run to verify it fails**

Run: `( cd plugins/regis-common && CI=true ../../node_modules/.bin/backstage-cli package test src/catalog.test.ts --watchAll=false )`
Expected: FAIL — the new symbols are not exported.

- [ ] **Step 3: Add the constants**

Append to `plugins/regis-common/src/catalog.ts`:

```typescript
/** Annotation: entity refs of sibling images sharing this digest (source for the aliasOf relation). */
export const REGIS_ANNOTATION_ALIAS_OF = 'regis.io/alias-of';

/** Catalog relation type linking image Resources that share a digest (symmetric). */
export const REGIS_RELATION_ALIAS_OF = 'aliasOf';
```

- [ ] **Step 4: Export them**

In `plugins/regis-common/src/index.ts`, inside the `export { … } from './catalog';` block, add `REGIS_ANNOTATION_ALIAS_OF,` and `REGIS_RELATION_ALIAS_OF,` (next to the other `REGIS_*` exports).

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `( cd plugins/regis-common && CI=true ../../node_modules/.bin/backstage-cli package test src/catalog.test.ts --watchAll=false ) && node_modules/.bin/tsc`
Expected: PASS, `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-common/src/catalog.ts plugins/regis-common/src/index.ts plugins/regis-common/src/catalog.test.ts
git commit -m "feat(regis-common): add aliasOf relation + alias-of annotation constants"
```

---

## Task 2: regis-backend — record sibling entity refs in the provider

**Files:**
- Modify: `plugins/regis-backend/src/provider/buildEntities.ts`
- Test: `plugins/regis-backend/src/provider/buildEntities.test.ts`

- [ ] **Step 1: Update the tests (failing)**

In `plugins/regis-backend/src/provider/buildEntities.test.ts`:

(a) The two existing `buildImageEntity(...)` calls gain a 4th argument (the alias **entity** refs) before `opts`. In the `'maps posture into labels + annotations and wires dependsOn'` test, change the call to:

```typescript
    const entity = buildImageEntity(
      entry,
      'library-nginx-1.27',
      ['registry-1.docker.io/library/nginx:latest'],
      ['resource:default/library-nginx-latest'],
      opts,
    );
```

and add an assertion in that test:

```typescript
    expect(ann['regis.io/alias-of']).toBe('resource:default/library-nginx-latest');
```

In the `'omits optional fields and falls back to the default owner'` test, change its call to pass empty arrays for both alias args:

```typescript
    const entity = buildImageEntity(
      { imageRef: 'ghcr.io/acme/api:dev', reportUrl: 'https://h/api.json' },
      'acme-api-dev',
      [],
      [],
      opts,
    );
```

and add:

```typescript
    expect(ann['regis.io/alias-of']).toBeUndefined();
```

(b) In the `'emits one playbook + one image per entry, with aliases cross-linked'` test (the `buildEntities` test), add after the existing `image-aliases` assertion:

```typescript
    expect(first?.metadata.annotations?.['regis.io/alias-of']).toBe(
      'resource:default/library-nginx-latest',
    );
```

- [ ] **Step 2: Run to verify it fails**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/provider/buildEntities.test.ts --watchAll=false )`
Expected: FAIL — `buildImageEntity` takes 4 args / `alias-of` undefined.

- [ ] **Step 3: Add the annotation import**

In `plugins/regis-backend/src/provider/buildEntities.ts`, add `REGIS_ANNOTATION_ALIAS_OF,` to the import block from `@regis/backstage-plugin-regis-common` (next to `REGIS_ANNOTATION_IMAGE_ALIASES`).

- [ ] **Step 4: Add the `aliasEntityRefs` parameter to `buildImageEntity`**

Change the signature and add the annotation. Replace the signature line and the `image-aliases` block:

```typescript
export function buildImageEntity(
  entry: IndexImageEntry,
  name: string,
  aliases: string[],
  aliasEntityRefs: string[],
  opts: BuildOpts,
): Entity {
```

and, immediately after the existing `if (aliases.length) { annotations[REGIS_ANNOTATION_IMAGE_ALIASES] = aliases.join(', '); }` block, add:

```typescript
  if (aliasEntityRefs.length) {
    annotations[REGIS_ANNOTATION_ALIAS_OF] = aliasEntityRefs.join(', ');
  }
```

- [ ] **Step 5: Refactor `buildEntities` to two passes**

Replace the body of `buildEntities` (everything after the `playbooks` loop) with:

```typescript
  const aliasMap = groupAliasesByDigest(index.images);

  // Pass 1: assign a stable, collision-safe entity name to every image ref.
  const taken = new Set<string>();
  const named = index.images.map(image => {
    const { repository, tag } = parseImageRef(image.imageRef);
    return {
      image,
      name: imageEntityName(repository, tag, image.imageRef, taken),
    };
  });
  const nameByRef = new Map(named.map(n => [n.image.imageRef, n.name]));

  // Pass 2: build each image, resolving sibling image refs to entity refs.
  for (const { image, name } of named) {
    const aliasImageRefs = aliasMap.get(image.imageRef) ?? [];
    const aliasEntityRefs = aliasImageRefs
      .map(ref => nameByRef.get(ref))
      .filter((n): n is string => Boolean(n))
      .map(n => `resource:${opts.namespace}/${n}`);
    entities.push(
      buildImageEntity(image, name, aliasImageRefs, aliasEntityRefs, opts),
    );
  }

  return entities;
}
```

(Keep the `const entities: Entity[] = [];` and the `for (const playbook …)` loop above unchanged.)

- [ ] **Step 6: Run to verify it passes + typecheck**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/provider/buildEntities.test.ts --watchAll=false ) && node_modules/.bin/tsc`
Expected: PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-backend/src/provider/buildEntities.ts plugins/regis-backend/src/provider/buildEntities.test.ts
git commit -m "feat(regis-backend): record sibling entity refs in regis.io/alias-of"
```

---

## Task 3: regis-backend — the alias-relation processor

**Files:**
- Create: `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.ts`
- Test: `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.test.ts`:

```typescript
import type { Entity } from '@backstage/catalog-model';
import { processingResult } from '@backstage/plugin-catalog-node';
import { RegisAliasRelationProcessor } from './RegisAliasRelationProcessor';

const processor = new RegisAliasRelationProcessor();
const loc = { type: 'url', target: 'x' };

function imageEntity(annotations: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: { name: 'lib-nginx-1-27', namespace: 'default', annotations },
    spec: { type: 'container-image' },
  };
}

describe('RegisAliasRelationProcessor', () => {
  it('has a stable name', () => {
    expect(processor.getProcessorName()).toBe('RegisAliasRelationProcessor');
  });

  it('emits one aliasOf relation per alias-of entity ref', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      imageEntity({
        'regis.io/alias-of':
          'resource:default/lib-nginx-latest, resource:default/lib-nginx-stable',
      }),
      loc as any,
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(
      processingResult.relation({
        source: { kind: 'resource', namespace: 'default', name: 'lib-nginx-1-27' },
        type: 'aliasOf',
        target: { kind: 'resource', namespace: 'default', name: 'lib-nginx-latest' },
      }),
    );
  });

  it('emits nothing without the alias-of annotation', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(imageEntity({}), loc as any, emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it('ignores non-image entities', async () => {
    const emit = jest.fn();
    const playbook: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: 'pb',
        annotations: { 'regis.io/alias-of': 'resource:default/x' },
      },
      spec: { type: 'regis-playbook' },
    };
    await processor.postProcessEntity(playbook, loc as any, emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips malformed refs but keeps valid ones', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      imageEntity({ 'regis.io/alias-of': ', resource:default/ok' }),
      loc as any,
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/processor/RegisAliasRelationProcessor.test.ts --watchAll=false )`
Expected: FAIL — `Cannot find module './RegisAliasRelationProcessor'`.

- [ ] **Step 3: Implement the processor**

Create `plugins/regis-backend/src/processor/RegisAliasRelationProcessor.ts`:

```typescript
import {
  type Entity,
  getCompoundEntityRef,
  parseEntityRef,
} from '@backstage/catalog-model';
import {
  type CatalogProcessor,
  type CatalogProcessorEmit,
  processingResult,
} from '@backstage/plugin-catalog-node';
import {
  REGIS_ANNOTATION_ALIAS_OF,
  REGIS_RELATION_ALIAS_OF,
  REGIS_RESOURCE_TYPE_IMAGE,
} from '@regis/backstage-plugin-regis-common';

/**
 * Emits a symmetric `aliasOf` relation from each `container-image` Resource to the
 * sibling images recorded (as entity refs) in its `regis.io/alias-of` annotation.
 */
export class RegisAliasRelationProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'RegisAliasRelationProcessor';
  }

  async postProcessEntity(
    entity: Entity,
    _location: unknown,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    const aliasOf = entity.metadata.annotations?.[REGIS_ANNOTATION_ALIAS_OF];
    if (
      entity.kind === 'Resource' &&
      entity.spec?.type === REGIS_RESOURCE_TYPE_IMAGE &&
      aliasOf
    ) {
      const source = getCompoundEntityRef(entity);
      for (const ref of aliasOf.split(',').map(r => r.trim()).filter(Boolean)) {
        let target;
        try {
          target = parseEntityRef(ref);
        } catch {
          continue; // skip malformed refs
        }
        emit(
          processingResult.relation({
            source,
            type: REGIS_RELATION_ALIAS_OF,
            target,
          }),
        );
      }
    }
    return entity;
  }
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/processor/RegisAliasRelationProcessor.test.ts --watchAll=false ) && node_modules/.bin/tsc`
Expected: PASS (5 tests), `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/processor/RegisAliasRelationProcessor.ts plugins/regis-backend/src/processor/RegisAliasRelationProcessor.test.ts
git commit -m "feat(regis-backend): add RegisAliasRelationProcessor emitting aliasOf"
```

---

## Task 4: regis-backend — register the processor in the module

**Files:**
- Modify: `plugins/regis-backend/src/module.ts`
- Test: `plugins/regis-backend/src/module.test.ts`

- [ ] **Step 1: Update the tests (failing)**

Replace the contents of `plugins/regis-backend/src/module.test.ts` with:

```typescript
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModuleRegisEntityProvider } from './module';

const stub = () => ({ addEntityProvider: jest.fn(), addProcessor: jest.fn() });

describe('catalogModuleRegisEntityProvider', () => {
  it('registers the alias processor and the provider when indexUrl is set', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({
          data: { regis: { catalog: { indexUrl: 'https://h/index.json' } } },
        }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).toHaveBeenCalledTimes(1);
  });

  it('registers the alias processor even when indexUrl is absent', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/module.test.ts --watchAll=false )`
Expected: FAIL — `addProcessor` never called (and the stub's `addProcessor` would error if the module already called a missing fn — but currently the module doesn't call it, so the assertion `toHaveBeenCalledTimes(1)` fails).

- [ ] **Step 3: Register the processor**

In `plugins/regis-backend/src/module.ts`:

(a) add the import:

```typescript
import { RegisAliasRelationProcessor } from './processor/RegisAliasRelationProcessor';
```

(b) at the **start** of the `init` body (before reading `indexUrl`), add:

```typescript
        catalog.addProcessor(new RegisAliasRelationProcessor());
```

(c) update the disabled-path log line to:

```typescript
          logger.info(
            'regis: regis.catalog.indexUrl not set — entity provider disabled (alias relations still active)',
          );
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/module.test.ts --watchAll=false ) && node_modules/.bin/tsc`
Expected: PASS (2 tests), `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/module.ts plugins/regis-backend/src/module.test.ts
git commit -m "feat(regis-backend): register the alias relation processor (unconditional)"
```

---

## Task 5: regis-frontend — `isContainerImage` predicate + Aliases card

**Files:**
- Modify: `plugins/regis/src/components/imageRelations.ts`
- Test: `plugins/regis/src/components/imageRelations.test.ts`
- Create: `plugins/regis/src/components/RegisAliasesCard.tsx`
- Test: `plugins/regis/src/components/RegisAliasesCard.test.tsx`
- Modify: `plugins/regis/src/plugin.tsx`

- [ ] **Step 1: Add the failing predicate test**

Append to `plugins/regis/src/components/imageRelations.test.ts`:

```typescript
import { isContainerImage } from './imageRelations';

describe('isContainerImage', () => {
  it('is true for a container-image Resource', () => {
    expect(
      isContainerImage({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'img' },
        spec: { type: 'container-image' },
      }),
    ).toBe(true);
  });

  it('is false for a playbook Resource', () => {
    expect(
      isContainerImage({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'pb' },
        spec: { type: 'regis-playbook' },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/imageRelations.test.ts --watchAll=false )`
Expected: FAIL — `isContainerImage` not exported.

- [ ] **Step 3: Add the predicate**

Append to `plugins/regis/src/components/imageRelations.ts`:

```typescript
/** A Resource minted as a Regis container image. */
export function isContainerImage(entity: Entity): boolean {
  return entity.kind === 'Resource' && entity.spec?.type === 'container-image';
}
```

- [ ] **Step 4: Run the predicate test (pass)**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/imageRelations.test.ts --watchAll=false )`
Expected: PASS.

- [ ] **Step 5: Write the failing card test**

Create `plugins/regis/src/components/RegisAliasesCard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { RegisAliasesCard } from './RegisAliasesCard';

const renderCard = (entity: Entity) =>
  renderInTestApp(
    <EntityProvider entity={entity}>
      <RegisAliasesCard />
    </EntityProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

const imageWith = (relations: { type: string; targetRef: string }[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'library-nginx-1.27', namespace: 'default' },
  spec: { type: 'container-image' },
  relations,
});

describe('RegisAliasesCard', () => {
  it('lists aliasOf relation targets as links', async () => {
    renderCard(
      imageWith([
        { type: 'aliasOf', targetRef: 'resource:default/library-nginx-latest' },
        { type: 'dependsOn', targetRef: 'resource:default/regis-playbook-default' },
      ]),
    );
    expect(await screen.findByText('Aliases')).toBeInTheDocument();
    expect(screen.getByText('library-nginx-latest')).toBeInTheDocument();
    // the dependsOn target must NOT appear in the Aliases card
    expect(
      screen.queryByText('regis-playbook-default'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when there are no aliasOf relations', () => {
    renderCard(imageWith([]));
    expect(screen.queryByText('Aliases')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisAliasesCard.test.tsx --watchAll=false )`
Expected: FAIL — `Cannot find module './RegisAliasesCard'`.

- [ ] **Step 7: Implement the card**

Create `plugins/regis/src/components/RegisAliasesCard.tsx`:

```tsx
import { InfoCard } from '@backstage/core-components';
import {
  EntityRefLink,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { REGIS_RELATION_ALIAS_OF } from '@regis/backstage-plugin-regis-common';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';

/** Lists the images that share this image's digest (the `aliasOf` relation). */
export function RegisAliasesCard() {
  const { entity } = useEntity();
  const targets = [
    ...new Set(
      (entity.relations ?? [])
        .filter(r => r.type === REGIS_RELATION_ALIAS_OF)
        .map(r => r.targetRef),
    ),
  ];

  if (targets.length === 0) return null;

  return (
    <InfoCard title="Aliases">
      <List dense disablePadding>
        {targets.map(ref => (
          <ListItem key={ref} disableGutters>
            <EntityRefLink entityRef={ref} />
          </ListItem>
        ))}
      </List>
    </InfoCard>
  );
}
```

- [ ] **Step 8: Run the card test (pass)**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisAliasesCard.test.tsx --watchAll=false )`
Expected: PASS (2 tests).

- [ ] **Step 9: Register the extension**

In `plugins/regis/src/plugin.tsx`:

(a) add `isContainerImage` to the import from `./components/imageRelations`:

```typescript
import {
  isComponentWithImageDeps,
  isContainerImage,
  isRegisPlaybook,
} from './components/imageRelations';
```

(b) after the `playbookImagesCard` definition (before `export const regisPlugin`), add:

```typescript
const aliasesCard = EntityCardBlueprint.make({
  name: 'aliases',
  params: {
    filter: isContainerImage,
    loader: () =>
      import('./components/RegisAliasesCard').then(m => <m.RegisAliasesCard />),
  },
});
```

(c) add `aliasesCard,` to the `extensions` array of `regisPlugin`.

- [ ] **Step 10: Full FE suite + typecheck + lint**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test --watchAll=false ) && node_modules/.bin/tsc && ( cd plugins/regis && ../../node_modules/.bin/backstage-cli package lint )`
Expected: all PASS / clean.

- [ ] **Step 11: Commit**

```bash
git add plugins/regis/src/components/imageRelations.ts plugins/regis/src/components/imageRelations.test.ts plugins/regis/src/components/RegisAliasesCard.tsx plugins/regis/src/components/RegisAliasesCard.test.tsx plugins/regis/src/plugin.tsx
git commit -m "feat(regis): add Aliases card surfacing the aliasOf relation"
```

---

## Task 6: examples — emit `alias-of` and regenerate

**Files:**
- Modify: `examples/regis-dataset.cjs`
- Modify (generated): `examples/regis-catalog.yaml`

- [ ] **Step 1: Emit `alias-of` in the generator**

In `examples/regis-dataset.cjs`, inside `imageEntities()`, the per-ref block computes `const aliases = refs.filter(r => r !== ref);`. Just after that line, add:

```javascript
      const aliasEntityRefs = aliases.map(
        a => `resource:default/${entityNameOf(img.repository, a.split(':').pop())}`,
      );
```

and in the annotations array (right after the existing `regis.io/image-aliases` conditional line), add:

```javascript
          ...(aliasEntityRefs.length
            ? [`    regis.io/alias-of: ${aliasEntityRefs.join(', ')}`]
            : []),
```

- [ ] **Step 2: Regenerate**

Run: `node examples/regis-dataset.cjs`
Expected: `Wrote 6 reports, regis-index.json, regis-catalog.yaml (15 entities), org.yaml (5 groups).`

- [ ] **Step 3: Verify the relation source is present + valid**

Run:

```bash
node -e "
const fs=require('fs'); const YAML=require('yaml');
const cat=YAML.parseAllDocuments(fs.readFileSync('examples/regis-catalog.yaml','utf8')).map(d=>d.toJSON()).filter(Boolean);
const names=new Set(cat.map(e=>'resource:default/'+e.metadata.name));
const imgs=cat.filter(e=>e.spec&&e.spec.type==='container-image');
const withAlias=imgs.filter(e=>e.metadata.annotations['regis.io/alias-of']);
let ok=true;
for(const e of withAlias) for(const ref of e.metadata.annotations['regis.io/alias-of'].split(',').map(s=>s.trim()))
  if(!names.has(ref)){ ok=false; console.log('UNRESOLVED', e.metadata.name, '->', ref); }
console.log(withAlias.map(e=>e.metadata.name+' alias-of '+e.metadata.annotations['regis.io/alias-of']).join('\n'));
console.log(ok && withAlias.length>=2 ? 'OK — alias-of present and resolves' : 'PROBLEM');
"
```

Expected: both `library-nginx-1.27` and `library-nginx-latest` carry a resolving `regis.io/alias-of`, prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add examples/regis-dataset.cjs examples/regis-catalog.yaml
git commit -m "docs: emit regis.io/alias-of in the demo dataset"
```

---

## Self-Review

**Spec coverage:**
- §A constants → Task 1. §B provider records entity refs → Task 2. §C processor → Task 3; unconditional registration → Task 4. §D Aliases card + `isContainerImage` → Task 5. §E example dataset → Task 6.
- Edge cases (no aliases, malformed ref, non-image, dedupe) → Task 3 tests + the card's `new Set(...)` dedupe + null guard (Task 5).
- Symmetry: each aliased entity carries its siblings in `alias-of` (Task 2 / Task 6), so each emits its own outgoing `aliasOf` (Task 3) — both ends linked.

**Placeholder scan:** none — every step has complete code + an exact command and expected result.

**Type consistency:** `REGIS_ANNOTATION_ALIAS_OF` (`regis.io/alias-of`) and `REGIS_RELATION_ALIAS_OF` (`aliasOf`) defined in Task 1 are used in Tasks 2 (provider), 3 (processor), 5 (card). `buildImageEntity`'s new 4th param `aliasEntityRefs` (Task 2) matches the updated callsites in the same task's tests and in `buildEntities`. The processor's emitted relation shape (`processingResult.relation`) matches the Task 3 test's expectation. `isContainerImage` (Task 5) checks `spec.type === 'container-image'`, consistent with `REGIS_RESOURCE_TYPE_IMAGE`.
