# Regis Backstage — Frontend Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Phase 2 entity model in the frontend — an aggregate posture card shared between Components (`dependsOn`) and playbooks (`dependencyOf`), plus `/regis` page columns — backed by an `imageRef` field added to the consolidated `ReportSummary` contract.

**Architecture:** Mostly frontend (`plugins/regis`, new frontend system). One pure presentational card (`RegisImagePostureCard`) takes `{title, imageRefs}` and renders the posture of those images from `listReports()`; two thin entity-aware wrappers feed it from the entity's `relations`. The wire-contract types (`ReportSummary`/`ReportEnvelope`) move into `regis-common` (de-duplicating the FE/BE copies) and gain `imageRef`, which the backend `CatalogAggregator` populates from `report.request`.

**Tech Stack:** TypeScript, Backstage NFS (`@backstage/frontend-plugin-api`, `@backstage/plugin-catalog-react/alpha`), `@backstage/core-components` (`InfoCard`, `Table`), Jest + `@backstage/frontend-test-utils` (`renderInTestApp`, `TestApiProvider`) + `@backstage/backend-test-utils`.

**Conventions (this worktree):**
- Run a package's tests: `( cd plugins/<pkg> && CI=true ../../node_modules/.bin/backstage-cli package test <relative-path> --watchAll=false )`. `yarn workspace … test` does NOT work here (bin PATH); always use the direct-bin form.
- Typecheck the repo: `node_modules/.bin/tsc`. Lint a package: `( cd plugins/<pkg> && ../../node_modules/.bin/backstage-cli package lint )`.
- Pkg dirs: `plugins/regis-common`, `plugins/regis-backend`, `plugins/regis`.
- Conventional Commits; commit after each green task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `plugins/regis-common/src/report-api.ts` | **New** — the `/report` + `/reports` wire types: `ReportEnvelope`, `ReportSummary` (+ `imageRef`). |
| `plugins/regis-common/src/index.ts` | Export the two types. |
| `plugins/regis-backend/src/service/types.ts` | Re-export the two types from `regis-common` (no local copies). |
| `plugins/regis-backend/src/service/CatalogAggregator.ts` | Populate `imageRef` on `ok` summaries. |
| `plugins/regis/src/api/RegisApi.ts` | Import the two types from `regis-common`; keep `RegisApi` + `regisApiRef`. |
| `plugins/regis/src/components/imageRelations.ts` | **New** — pure helpers: `imageRefsFromRelations`, `isComponentWithImageDeps`, `isRegisPlaybook`. |
| `plugins/regis/src/components/RegisImagePostureCard.tsx` | **New** — pure card: posture of a given set of image refs. |
| `plugins/regis/src/components/RegisRelatedImagesCards.tsx` | **New** — entity-aware wrappers `RegisServiceImagesCard`, `RegisPlaybookImagesCard`. |
| `plugins/regis/src/components/RegisCatalogPage.tsx` | Add Image / Kind / Failing-tags columns. |
| `plugins/regis/src/plugin.tsx` | Register `serviceImagesCard` + `playbookImagesCard` extensions. |

---

## Task 1: regis-common — move contract types + add `imageRef`

Pure type definitions (no runtime behavior) — verified by `tsc` and downstream consumers, so this task has no unit test.

**Files:**
- Create: `plugins/regis-common/src/report-api.ts`
- Modify: `plugins/regis-common/src/index.ts`

- [ ] **Step 1: Create the contract types**

Create `plugins/regis-common/src/report-api.ts`:

```typescript
import type { Report } from './types';

/** A report plus retrieval metadata, as served by `GET /report`. */
export interface ReportEnvelope {
  report: Report;
  meta: { fetchedAt: string; source: string; schemaVersion: number };
}

/** Compact per-entity row for the catalog page (`GET /reports`). */
export interface ReportSummary {
  entityRef: string;
  status: 'ok' | 'error' | 'pending';
  /** Canonical analyzed image reference (`registry/repository:tag`), when known. */
  imageRef?: string;
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}
```

- [ ] **Step 2: Export from the package index**

In `plugins/regis-common/src/index.ts`, add after the existing `export type { Report } from './types';` line:

```typescript
export type { ReportEnvelope, ReportSummary } from './report-api';
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add plugins/regis-common/src/report-api.ts plugins/regis-common/src/index.ts
git commit -m "feat(regis-common): add ReportSummary/ReportEnvelope contract with imageRef"
```

---

## Task 2: regis-backend — re-export types + populate `imageRef`

**Files:**
- Modify: `plugins/regis-backend/src/service/types.ts`
- Modify: `plugins/regis-backend/src/service/CatalogAggregator.ts`
- Test: `plugins/regis-backend/src/service/CatalogAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test inside the `describe('CatalogAggregator', …)` block in `plugins/regis-backend/src/service/CatalogAggregator.test.ts` (before its closing `});`):

```typescript
  it('includes the canonical imageRef from the report request', async () => {
    const getReport = jest.fn().mockResolvedValue({
      report: {
        tier: 'Gold',
        rules_summary: { score: 100, by_tag: {} },
        request: {
          registry: 'registry-1.docker.io',
          repository: 'library/nginx',
          tag: '1.27',
        },
      },
      meta: {},
    });
    const agg = makeAggregator(['a'], getReport);
    await agg.refresh();
    expect(agg.getSnapshot()[0].imageRef).toBe(
      'registry-1.docker.io/library/nginx:1.27',
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/service/CatalogAggregator.test.ts --watchAll=false )`
Expected: FAIL — the new test gets `imageRef === undefined`.

- [ ] **Step 3: Re-export the contract types from regis-common**

Replace the entire contents of `plugins/regis-backend/src/service/types.ts` with:

```typescript
export type {
  ReportEnvelope,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';
```

- [ ] **Step 4: Populate `imageRef` in the aggregator**

In `plugins/regis-backend/src/service/CatalogAggregator.ts`, find the object returned for a successful report inside `refresh()` (the branch returning `status: 'ok'`). It currently reads:

```typescript
          return {
            entityRef,
            status: 'ok' as const,
            tier: report.tier ?? null,
            score: report.rules_summary?.score,
            byTag,
          };
```

Replace it with:

```typescript
          return {
            entityRef,
            status: 'ok' as const,
            imageRef: report.request
              ? `${report.request.registry}/${report.request.repository}:${report.request.tag}`
              : undefined,
            tier: report.tier ?? null,
            score: report.rules_summary?.score,
            byTag,
          };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `( cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/service/CatalogAggregator.test.ts --watchAll=false )`
Expected: PASS (all aggregator tests, including the new one).

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-backend/src/service/types.ts plugins/regis-backend/src/service/CatalogAggregator.ts plugins/regis-backend/src/service/CatalogAggregator.test.ts
git commit -m "feat(regis-backend): populate imageRef on report summaries"
```

---

## Task 3: regis-frontend — point API types at regis-common

**Files:**
- Modify: `plugins/regis/src/api/RegisApi.ts`

- [ ] **Step 1: Re-point the type imports**

Replace the entire contents of `plugins/regis/src/api/RegisApi.ts` with:

```typescript
import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  ReportEnvelope,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type { ReportEnvelope, ReportSummary };

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
```

> The `export type { ReportEnvelope, ReportSummary }` re-export keeps existing `import { …, type ReportSummary } from '../api/RegisApi'` sites (e.g. `RegisCatalogPage.tsx`) working unchanged.

- [ ] **Step 2: Run the existing frontend tests + typecheck**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test --watchAll=false ) && node_modules/.bin/tsc`
Expected: PASS — existing FE tests still green, `tsc` exits 0.

- [ ] **Step 3: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts
git commit -m "refactor(regis): source report contract types from regis-common"
```

---

## Task 4: regis-frontend — relation helpers + filter predicates

**Files:**
- Create: `plugins/regis/src/components/imageRelations.ts`
- Test: `plugins/regis/src/components/imageRelations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/imageRelations.test.ts`:

```typescript
import type { Entity } from '@backstage/catalog-model';
import {
  imageRefsFromRelations,
  isComponentWithImageDeps,
  isRegisPlaybook,
} from './imageRelations';

const component: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', namespace: 'default' },
  relations: [
    { type: 'dependsOn', targetRef: 'resource:default/img-a' },
    { type: 'dependsOn', targetRef: 'component:default/lib' },
    { type: 'ownedBy', targetRef: 'group:default/team' },
  ],
};

describe('imageRefsFromRelations', () => {
  it('keeps only resource targets of the given relation type', () => {
    expect(imageRefsFromRelations(component, 'dependsOn')).toEqual([
      'resource:default/img-a',
    ]);
  });

  it('returns [] when the entity has no relations', () => {
    expect(
      imageRefsFromRelations({ ...component, relations: undefined }, 'dependsOn'),
    ).toEqual([]);
  });
});

describe('isComponentWithImageDeps', () => {
  it('is true for a Component that depends on a resource', () => {
    expect(isComponentWithImageDeps(component)).toBe(true);
  });

  it('is false for a Component with no resource dependency', () => {
    expect(
      isComponentWithImageDeps({ ...component, relations: [] }),
    ).toBe(false);
  });
});

describe('isRegisPlaybook', () => {
  it('is true for a regis-playbook Resource', () => {
    expect(
      isRegisPlaybook({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'pb' },
        spec: { type: 'regis-playbook' },
      }),
    ).toBe(true);
  });

  it('is false for a container-image Resource', () => {
    expect(
      isRegisPlaybook({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: { name: 'img' },
        spec: { type: 'container-image' },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/imageRelations.test.ts --watchAll=false )`
Expected: FAIL — `Cannot find module './imageRelations'`.

- [ ] **Step 3: Implement the helpers**

Create `plugins/regis/src/components/imageRelations.ts`:

```typescript
import { type Entity, parseEntityRef } from '@backstage/catalog-model';

/** EntityRefs of `resource:` targets reached from `entity` via `relationType`. */
export function imageRefsFromRelations(
  entity: Entity,
  relationType: string,
): string[] {
  return (entity.relations ?? [])
    .filter(
      r =>
        r.type === relationType &&
        parseEntityRef(r.targetRef).kind === 'resource',
    )
    .map(r => r.targetRef);
}

/** A Component that depends on at least one Resource (candidate for the images card). */
export function isComponentWithImageDeps(entity: Entity): boolean {
  return (
    entity.kind === 'Component' &&
    (entity.relations ?? []).some(
      r =>
        r.type === 'dependsOn' &&
        parseEntityRef(r.targetRef).kind === 'resource',
    )
  );
}

/** A Resource minted as a Regis playbook. */
export function isRegisPlaybook(entity: Entity): boolean {
  return entity.kind === 'Resource' && entity.spec?.type === 'regis-playbook';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/imageRelations.test.ts --watchAll=false )`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/imageRelations.ts plugins/regis/src/components/imageRelations.test.ts
git commit -m "feat(regis): add relation helpers and entity filter predicates"
```

---

## Task 5: regis-frontend — shared posture card

**Files:**
- Create: `plugins/regis/src/components/RegisImagePostureCard.tsx`
- Test: `plugins/regis/src/components/RegisImagePostureCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisImagePostureCard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisImagePostureCard } from './RegisImagePostureCard';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
  { entityRef: 'resource:default/other', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/o:1' },
];

const renderCard = (imageRefs: string[]) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            listReports: async () => summaries,
            getReport: async () => {
              throw new Error('not used');
            },
          },
        ],
      ]}
    >
      <RegisImagePostureCard title="Images" imageRefs={imageRefs} />
    </TestApiProvider>,
  );

describe('RegisImagePostureCard', () => {
  it('summarizes only the given images', async () => {
    renderCard(['resource:default/a', 'resource:default/b']);
    expect(await screen.findByText(/2 images/)).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    expect(screen.queryByText('r/o:1')).not.toBeInTheDocument();
  });

  it('shows an empty state when none of the given images have a report', async () => {
    renderCard(['resource:default/missing']);
    expect(
      await screen.findByText(/No Regis-tracked images/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisImagePostureCard.test.tsx --watchAll=false )`
Expected: FAIL — `Cannot find module './RegisImagePostureCard'`.

- [ ] **Step 3: Implement the card**

Create `plugins/regis/src/components/RegisImagePostureCard.tsx`:

```tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  Table,
  type TableColumn,
} from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';

const TIER_ORDER = ['Gold', 'Silver', 'Bronze'];

function distribution(rows: ReportSummary[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.status === 'ok' ? r.tier ?? 'untiered' : 'error';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (k: string) =>
    TIER_ORDER.indexOf(k) === -1 ? TIER_ORDER.length : TIER_ORDER.indexOf(k);
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, n]) => `${n} ${k}`)
    .join(' · ');
}

const columns: TableColumn<ReportSummary>[] = [
  {
    title: 'Image',
    field: 'imageRef',
    render: row => (
      <EntityRefLink entityRef={row.entityRef}>
        {row.imageRef ?? row.entityRef}
      </EntityRefLink>
    ),
  },
  { title: 'Tier', field: 'tier' },
  { title: 'Score', field: 'score', type: 'numeric' },
];

/** Posture summary of a given set of image entityRefs (shared by the service and playbook cards). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
}) {
  const { title, imageRefs } = props;
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(() => api.listReports(), []);

  if (loading) {
    return (
      <InfoCard title={title}>
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title={title}>
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const wanted = new Set(imageRefs);
  const rows = (value ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
  }

  return (
    <InfoCard
      title={title}
      subheader={`${rows.length} images · ${distribution(rows)}`}
    >
      <Table
        columns={columns}
        data={rows}
        options={{
          search: false,
          toolbar: false,
          padding: 'dense',
          paging: rows.length > 10,
          pageSize: 10,
        }}
      />
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisImagePostureCard.test.tsx --watchAll=false )`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisImagePostureCard.tsx plugins/regis/src/components/RegisImagePostureCard.test.tsx
git commit -m "feat(regis): add shared image-posture card"
```

---

## Task 6: regis-frontend — entity-aware wrappers + register extensions

**Files:**
- Create: `plugins/regis/src/components/RegisRelatedImagesCards.tsx`
- Test: `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`
- Modify: `plugins/regis/src/plugin.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import {
  RegisServiceImagesCard,
  RegisPlaybookImagesCard,
} from './RegisRelatedImagesCards';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/img-a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
];

const api = {
  listReports: async () => summaries,
  getReport: async () => {
    throw new Error('not used');
  },
};

const renderWith = (entity: Entity, node: JSX.Element) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>{node}</EntityProvider>
    </TestApiProvider>,
  );

describe('RegisServiceImagesCard', () => {
  it('shows the images the component depends on', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'svc' },
      relations: [{ type: 'dependsOn', targetRef: 'resource:default/img-a' }],
    };
    renderWith(entity, <RegisServiceImagesCard />);
    expect(await screen.findByText('Images of this service')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
  });
});

describe('RegisPlaybookImagesCard', () => {
  it('shows the images assessed against the playbook', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'pb' },
      spec: { type: 'regis-playbook' },
      relations: [
        { type: 'dependencyOf', targetRef: 'resource:default/img-a' },
      ],
    };
    renderWith(entity, <RegisPlaybookImagesCard />);
    expect(await screen.findByText('Assessed images')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisRelatedImagesCards.test.tsx --watchAll=false )`
Expected: FAIL — `Cannot find module './RegisRelatedImagesCards'`.

- [ ] **Step 3: Implement the wrappers**

Create `plugins/regis/src/components/RegisRelatedImagesCards.tsx`:

```tsx
import { useEntity } from '@backstage/plugin-catalog-react';
import { RegisImagePostureCard } from './RegisImagePostureCard';
import { imageRefsFromRelations } from './imageRelations';

/** Images the current Component depends on. */
export function RegisServiceImagesCard() {
  const { entity } = useEntity();
  return (
    <RegisImagePostureCard
      title="Images of this service"
      imageRefs={imageRefsFromRelations(entity, 'dependsOn')}
    />
  );
}

/** Images assessed against the current playbook. */
export function RegisPlaybookImagesCard() {
  const { entity } = useEntity();
  return (
    <RegisImagePostureCard
      title="Assessed images"
      imageRefs={imageRefsFromRelations(entity, 'dependencyOf')}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisRelatedImagesCards.test.tsx --watchAll=false )`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the two extensions**

In `plugins/regis/src/plugin.tsx`:

(a) Add an import for the predicates after the existing `import { isRegisAvailable } from '@regis/backstage-plugin-regis-common';` line:

```typescript
import {
  isComponentWithImageDeps,
  isRegisPlaybook,
} from './components/imageRelations';
```

(b) Add the two extension definitions after the `catalogPage` definition (before `export const regisPlugin`):

```typescript
const serviceImagesCard = EntityCardBlueprint.make({
  name: 'service-images',
  params: {
    filter: isComponentWithImageDeps,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisServiceImagesCard />
      )),
  },
});

const playbookImagesCard = EntityCardBlueprint.make({
  name: 'playbook-images',
  params: {
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisPlaybookImagesCard />
      )),
  },
});
```

(c) Add both to the plugin's `extensions` array:

```typescript
export const regisPlugin = createFrontendPlugin({
  pluginId: 'regis',
  extensions: [
    regisApi,
    scorecardCard,
    reportTab,
    catalogPage,
    serviceImagesCard,
    playbookImagesCard,
  ],
});
```

- [ ] **Step 6: Run the full FE suite + typecheck + lint**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test --watchAll=false ) && node_modules/.bin/tsc && ( cd plugins/regis && ../../node_modules/.bin/backstage-cli package lint )`
Expected: all tests PASS, `tsc` exits 0, lint clean.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis/src/components/RegisRelatedImagesCards.tsx plugins/regis/src/components/RegisRelatedImagesCards.test.tsx plugins/regis/src/plugin.tsx
git commit -m "feat(regis): surface aggregate image-posture cards on services and playbooks"
```

---

## Task 7: regis-frontend — catalog page columns

**Files:**
- Modify: `plugins/regis/src/components/RegisCatalogPage.tsx`
- Test: `plugins/regis/src/components/RegisCatalogPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisCatalogPage.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisCatalogPage } from './RegisCatalogPage';

const summaries: ReportSummary[] = [
  {
    entityRef: 'resource:default/library-nginx-1.27',
    status: 'ok',
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    tier: 'Silver',
    score: 80,
    byTag: { security: 80, hygiene: 100 },
  },
];

describe('RegisCatalogPage', () => {
  it('shows image ref, kind and failing tags', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [
            regisApiRef,
            {
              listReports: async () => summaries,
              getReport: async () => {
                throw new Error('not used');
              },
            },
          ],
        ]}
      >
        <RegisCatalogPage />
      </TestApiProvider>,
    );
    expect(
      await screen.findByText('registry-1.docker.io/library/nginx:1.27'),
    ).toBeInTheDocument();
    expect(screen.getByText('resource')).toBeInTheDocument(); // Kind column
    expect(screen.getByText('security')).toBeInTheDocument(); // failing tag (score < 100)
    expect(screen.queryByText('hygiene')).not.toBeInTheDocument(); // passing tag hidden
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisCatalogPage.test.tsx --watchAll=false )`
Expected: FAIL — image ref / kind / failing-tags text not found (current page has no such columns).

- [ ] **Step 3: Add the columns**

Replace the entire contents of `plugins/regis/src/components/RegisCatalogPage.tsx` with:

```tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  Page,
  Progress,
  ResponseErrorPanel,
  Table,
  type TableColumn,
} from '@backstage/core-components';
import { parseEntityRef } from '@backstage/catalog-model';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';

function failingTags(byTag?: Record<string, number>): string {
  if (!byTag) return '';
  return Object.entries(byTag)
    .filter(([, score]) => score < 100)
    .map(([tag]) => tag)
    .join(', ');
}

const columns: TableColumn<ReportSummary>[] = [
  {
    title: 'Image',
    field: 'imageRef',
    render: row => row.imageRef ?? row.entityRef,
  },
  { title: 'Kind', render: row => parseEntityRef(row.entityRef).kind },
  { title: 'Tier', field: 'tier' },
  { title: 'Score', field: 'score', type: 'numeric' },
  { title: 'Failing tags', render: row => failingTags(row.byTag) },
  { title: 'Status', field: 'status' },
];

/** Global table of every annotated entity's posture. */
export function RegisCatalogPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(() => api.listReports(), []);

  return (
    <Page themeId="tool">
      <Header title="Regis" subtitle="Container posture across the catalog" />
      <Content>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {value && (
          <Table
            title={`${value.length} images`}
            columns={columns}
            data={value}
            options={{ search: true, paging: true, pageSize: 20 }}
          />
        )}
      </Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test src/components/RegisCatalogPage.test.tsx --watchAll=false )`
Expected: PASS.

- [ ] **Step 5: Run the full FE suite + typecheck + lint**

Run: `( cd plugins/regis && CI=true ../../node_modules/.bin/backstage-cli package test --watchAll=false ) && node_modules/.bin/tsc && ( cd plugins/regis && ../../node_modules/.bin/backstage-cli package lint )`
Expected: all PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/components/RegisCatalogPage.tsx plugins/regis/src/components/RegisCatalogPage.test.tsx
git commit -m "feat(regis): add imageRef, kind and failing-tags columns to the catalog page"
```

---

## Out of scope / follow-ups

- Changing the existing tab/card/page behaviour (already surface on image Resources).
- A batched `/reports?refs=…` endpoint (client-side intersect of `listReports` suffices).
- `regis.io/aliasOf` relation, Phase-1→2 annotation migration, persistent store (tracked in the entity-model spec).

---

## Self-Review

**Spec coverage:**
- §A contract (`imageRef` + consolidation) → Tasks 1, 2, 3.
- §B shared card + two wrappers (dependsOn / dependencyOf) → Tasks 4, 5, 6.
- §C page columns (imageRef / kind / failing-tags derived from byTag) → Task 7.
- Testing at all levels → tests in Tasks 2, 4, 5, 6, 7 (Task 1/3 are type-only, covered by tsc + existing tests).
- Edge cases (empty state, imageRef fallback, error) → covered in Task 5's component + tests.

**Placeholder scan:** none — every step has complete code + an exact command and expected result.

**Type consistency:** `ReportSummary` (with `imageRef?`) is defined once in `regis-common` (Task 1) and consumed everywhere (`service/types.ts` re-export Task 2, `RegisApi.ts` re-export Task 3, card/page/tests). `imageRefsFromRelations` / `isComponentWithImageDeps` / `isRegisPlaybook` defined in Task 4 are consumed in Tasks 6. `RegisImagePostureCard({title, imageRefs})` defined in Task 5 is consumed by the wrappers in Task 6. The relation directions match the model: services use `dependsOn`, playbooks use `dependencyOf`.
