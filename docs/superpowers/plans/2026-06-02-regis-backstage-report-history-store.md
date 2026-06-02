# Persistent Report History Store (Trends) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, append-only per-image posture snapshot store (Knex) written by a scheduled recorder from the published index, and surface it as a per-image score/tier trajectory card.

**Architecture:** A new `ReportHistoryStore` (interface + Knex + in-memory impls), distinct from the existing TTL cache `ReportStore`. A `RegisHistoryRecorder` fetches+validates the index (via a shared `fetchIndex` helper) and upserts one snapshot per image, keyed `(imageRef, snapshotDate)`. A `ReportHistoryService` resolves an entity's `regis.io/image-ref` annotation and reads its series. The `regis` backend plugin owns the database, the scheduled recorder task, and a new `GET /report/history` route. The frontend adds `RegisClient.getHistory` and a `RegisTrajectoryCard` (dependency-free SVG sparkline) on `container-image` entities.

**Tech Stack:** Backstage new backend system (`createBackendPlugin`, `coreServices.database`/`scheduler`), Knex (via `DatabaseService.getClient()`), `better-sqlite3` for integration tests (`@backstage/backend-test-utils`), Jest (`backstage-cli package test`), Backstage new frontend system (`EntityCardBlueprint`), React + inline SVG.

**Spec:** `docs/superpowers/specs/2026-06-02-regis-backstage-report-history-store-design.md`

---

## File structure (what each unit owns)

**`plugins/regis-common/`** (shared contract types — no Backstage runtime):
- `src/report-index.ts` — add optional `snapshotDate` to `IndexImageEntry`.
- `src/schema/report-index.schema.json` — mirror `snapshotDate` in the JSON schema.
- `src/report-api.ts` — add `ReportSnapshot` + `ReportHistory` types.
- `src/catalog.ts` — add `getRegisImageRef(entity)` getter (sibling to `getRegisReportUrl`).
- `src/index.ts` — export the new types + getter.

**`plugins/regis-backend/`** (backend logic):
- `src/service/fetchIndex.ts` — shared `fetch + validateReportIndex` helper (consumed by provider + recorder).
- `src/service/ReportHistoryStore.ts` — `ReportHistoryStore` interface + `InMemoryReportHistoryStore`.
- `src/service/KnexReportHistoryStore.ts` — Knex impl with idempotent upsert + self-creating schema.
- `src/service/RegisHistoryRecorder.ts` — pure `toSnapshots()` + `RegisHistoryRecorder.record()`.
- `src/service/ReportHistoryService.ts` — entityRef → image-ref → store query; `NoImageRefError`.
- `src/provider/RegisEntityProvider.ts` — refactor to use `fetchIndex` (no behaviour change).
- `src/router.ts` — add `GET /report/history`; extend `RouterOptions`; map `NoImageRefError` → 404.
- `src/plugin.ts` — wire `coreServices.database`, build the store/service/recorder, schedule the recorder, pass the service to the router.
- `package.json` — add `knex` dependency (for the `Knex` type).

**`plugins/regis/`** (frontend):
- `src/api/RegisApi.ts` — add `getHistory` to `RegisApi`; re-export `ReportHistory`.
- `src/api/RegisClient.ts` — implement `getHistory`.
- `src/components/RegisTrajectoryCard.tsx` — the trajectory card + sparkline.
- `src/plugin.tsx` — register `trajectoryCard` (filter `isContainerImage`).

**Conventions:** run a single package's tests with `yarn workspace <pkg> test <file>` where `<pkg>` is `@regis/backstage-plugin-regis-common`, `@regis/backstage-plugin-regis-backend`, or `@regis/backstage-plugin-regis`. Commit after each task.

---

## Task 1: Index contract — optional `snapshotDate`

**Files:**
- Modify: `plugins/regis-common/src/report-index.ts`
- Modify: `plugins/regis-common/src/schema/report-index.schema.json`
- Test: `plugins/regis-common/src/report-index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-common/src/report-index.test.ts`:

```ts
it('accepts an optional snapshotDate on an image entry', () => {
  const index = validateReportIndex({
    schemaVersion: 1,
    images: [
      {
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        reportUrl: 'https://example.test/report.json',
        snapshotDate: '2026-05-31',
      },
    ],
  });
  expect(index.images[0].snapshotDate).toBe('2026-05-31');
});
```

(`validateReportIndex` is already imported in this test file; if not, add `import { validateReportIndex } from './report-index';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-index`
Expected: FAIL — `index.images[0].snapshotDate` is `undefined` (type error or assertion failure).

- [ ] **Step 3: Add the field to the interface**

In `plugins/regis-common/src/report-index.ts`, inside `interface IndexImageEntry`, add after `system?: string;` (or at the end of the properties):

```ts
  /** ISO date of the report snapshot (report-true dating for history). */
  snapshotDate?: string;
```

- [ ] **Step 4: Mirror it in the JSON schema**

In `plugins/regis-common/src/schema/report-index.schema.json`, inside `properties.images.items.properties` (alongside `system`), add:

```json
"snapshotDate": { "type": "string" }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-index`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-common/src/report-index.ts plugins/regis-common/src/schema/report-index.schema.json plugins/regis-common/src/report-index.test.ts
git commit -m "feat(regis-common): optional snapshotDate on index image entry"
```

---

## Task 2: History types + image-ref getter

**Files:**
- Modify: `plugins/regis-common/src/report-api.ts`
- Modify: `plugins/regis-common/src/catalog.ts`
- Modify: `plugins/regis-common/src/index.ts`
- Test: `plugins/regis-common/src/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-common/src/catalog.test.ts`:

```ts
import { getRegisImageRef } from './catalog';

describe('getRegisImageRef', () => {
  it('returns the image-ref annotation when present', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: 'library-nginx-1.27',
        annotations: { 'regis.io/image-ref': 'registry-1.docker.io/library/nginx:1.27' },
      },
      spec: { type: 'container-image' },
    } as any;
    expect(getRegisImageRef(entity)).toBe('registry-1.docker.io/library/nginx:1.27');
  });

  it('returns undefined when the annotation is absent', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'x' },
      spec: { type: 'container-image' },
    } as any;
    expect(getRegisImageRef(entity)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test catalog`
Expected: FAIL — `getRegisImageRef` is not exported.

- [ ] **Step 3: Add the getter**

At the top of `plugins/regis-common/src/catalog.ts`, ensure the Entity import exists:

```ts
import type { Entity } from '@backstage/catalog-model';
```

Then add (near `REGIS_ANNOTATION_IMAGE_REF`):

```ts
/** Reads the canonical analyzed image reference from an entity, if annotated. */
export function getRegisImageRef(entity: Entity): string | undefined {
  return entity.metadata.annotations?.[REGIS_ANNOTATION_IMAGE_REF];
}
```

- [ ] **Step 4: Add the history types**

Append to `plugins/regis-common/src/report-api.ts`:

```ts
/** A single point-in-time posture snapshot for an image (history series row). */
export interface ReportSnapshot {
  imageRef: string;
  snapshotDate: string; // ISO date
  digest?: string;
  tier?: string | null;
  score?: number;
  playbook?: string;
  reportUrl?: string;
  recordedAt: string; // ISO datetime
}

/** An image's full snapshot history, as served by `GET /report/history`. */
export interface ReportHistory {
  imageRef: string;
  snapshots: ReportSnapshot[];
}
```

- [ ] **Step 5: Export from the package index**

In `plugins/regis-common/src/index.ts`:

- change the `./report-api` type export line to:

```ts
export type {
  ReportEnvelope,
  ReportSummary,
  ReportSnapshot,
  ReportHistory,
} from './report-api';
```

- add `getRegisImageRef` to the `./catalog` export block (alongside `scoreBand`).

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test catalog`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-common/src
git commit -m "feat(regis-common): ReportSnapshot/ReportHistory types + getRegisImageRef"
```

---

## Task 3: Shared `fetchIndex` helper + provider refactor

**Files:**
- Create: `plugins/regis-backend/src/service/fetchIndex.ts`
- Test: `plugins/regis-backend/src/service/fetchIndex.test.ts`
- Modify: `plugins/regis-backend/src/provider/RegisEntityProvider.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/fetchIndex.test.ts`:

```ts
import { fetchIndex } from './fetchIndex';

describe('fetchIndex', () => {
  it('fetches and validates the index', async () => {
    const source = {
      fetch: jest.fn().mockResolvedValue({
        schemaVersion: 1,
        images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/report.json' }],
      }),
    };
    const index = await fetchIndex(source as any, 'https://x/index.json');
    expect(source.fetch).toHaveBeenCalledWith('https://x/index.json');
    expect(index.images).toHaveLength(1);
  });

  it('propagates validation errors', async () => {
    const source = { fetch: jest.fn().mockResolvedValue({ schemaVersion: 1 }) };
    await expect(fetchIndex(source as any, 'https://x/index.json')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test fetchIndex`
Expected: FAIL — module `./fetchIndex` not found.

- [ ] **Step 3: Implement the helper**

Create `plugins/regis-backend/src/service/fetchIndex.ts`:

```ts
import {
  validateReportIndex,
  type ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import type { ReportSource } from './ReportSource';

/** Fetches the published index from `url` and validates it (shared trust boundary). */
export async function fetchIndex(
  source: ReportSource,
  url: string,
): Promise<ReportIndex> {
  const raw = await source.fetch(url);
  return validateReportIndex(raw);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test fetchIndex`
Expected: PASS.

- [ ] **Step 5: Refactor the provider to use it (no behaviour change)**

In `plugins/regis-backend/src/provider/RegisEntityProvider.ts`, replace the two lines inside `run()`:

```ts
    const raw = await source.fetch(indexUrl);
    const index = validateReportIndex(raw);
```

with:

```ts
    const index = await fetchIndex(source, indexUrl);
```

Add the import:

```ts
import { fetchIndex } from '../service/fetchIndex';
```

and remove the now-unused `validateReportIndex` import if the linter flags it (keep it only if still referenced elsewhere in the file). Note: `source` and `indexUrl` are already destructured from `this.options` in `run()` — confirm the surrounding lines still compile.

- [ ] **Step 6: Run the provider tests to confirm no regression**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test RegisEntityProvider`
Expected: PASS (unchanged behaviour).

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-backend/src/service/fetchIndex.ts plugins/regis-backend/src/service/fetchIndex.test.ts plugins/regis-backend/src/provider/RegisEntityProvider.ts
git commit -m "refactor(regis-backend): extract shared fetchIndex helper"
```

---

## Task 4: `ReportHistoryStore` interface + in-memory impl

**Files:**
- Create: `plugins/regis-backend/src/service/ReportHistoryStore.ts`
- Test: `plugins/regis-backend/src/service/ReportHistoryStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/ReportHistoryStore.test.ts`:

```ts
import { InMemoryReportHistoryStore } from './ReportHistoryStore';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

describe('InMemoryReportHistoryStore', () => {
  it('returns snapshots for an imageRef ordered by snapshotDate', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      snap({ snapshotDate: '2026-05-03', score: 90 }),
      snap({ snapshotDate: '2026-05-01', score: 70 }),
    ]);
    const rows = await store.getByImageRef('r/n:1');
    expect(rows.map(r => r.snapshotDate)).toEqual(['2026-05-01', '2026-05-03']);
  });

  it('upserts idempotently on (imageRef, snapshotDate)', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([snap({ snapshotDate: '2026-05-01', score: 70 })]);
    await store.append([snap({ snapshotDate: '2026-05-01', score: 95 })]);
    const rows = await store.getByImageRef('r/n:1');
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(95);
  });

  it('isolates rows by imageRef', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([snap({ imageRef: 'a:1' }), snap({ imageRef: 'b:1' })]);
    expect(await store.getByImageRef('a:1')).toHaveLength(1);
    expect(await store.getByImageRef('missing')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interface + in-memory store**

Create `plugins/regis-backend/src/service/ReportHistoryStore.ts`:

```ts
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

/** Append-only per-image posture snapshot series. Keyed by (imageRef, snapshotDate). */
export interface ReportHistoryStore {
  /** Idempotent upsert by (imageRef, snapshotDate). */
  append(snapshots: ReportSnapshot[]): Promise<void>;
  /** All snapshots for an image, ordered by snapshotDate ascending. */
  getByImageRef(imageRef: string): Promise<ReportSnapshot[]>;
}

/** In-memory impl for tests. */
export class InMemoryReportHistoryStore implements ReportHistoryStore {
  private readonly rows = new Map<string, ReportSnapshot>();

  private key(s: { imageRef: string; snapshotDate: string }): string {
    return `${s.imageRef} ${s.snapshotDate}`;
  }

  async append(snapshots: ReportSnapshot[]): Promise<void> {
    for (const s of snapshots) this.rows.set(this.key(s), s);
  }

  async getByImageRef(imageRef: string): Promise<ReportSnapshot[]> {
    return [...this.rows.values()]
      .filter(s => s.imageRef === imageRef)
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryStore`
Expected: PASS.

- [ ] **Step 5: Correct the misleading comment on the cache store**

The existing cache store and the new history store are distinct responsibilities. In `plugins/regis-backend/src/service/ReportStore.ts`, change the interface doc comment:

```ts
/** Caches report envelopes by key (entityRef). Phase 2 adds a Knex impl. */
```

to:

```ts
/**
 * Caches report envelopes by key (entityRef) — an ephemeral read cache.
 * Durable report *history* is a separate concern: see ReportHistoryStore.
 */
```

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/service/ReportHistoryStore.ts plugins/regis-backend/src/service/ReportHistoryStore.test.ts plugins/regis-backend/src/service/ReportStore.ts
git commit -m "feat(regis-backend): ReportHistoryStore interface + in-memory impl"
```

---

## Task 5: `RegisHistoryRecorder` (toSnapshots + record)

**Files:**
- Create: `plugins/regis-backend/src/service/RegisHistoryRecorder.ts`
- Test: `plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts`:

```ts
import { mockServices } from '@backstage/backend-test-utils';
import { toSnapshots, RegisHistoryRecorder } from './RegisHistoryRecorder';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';
import type { ReportIndex } from '@regis/backstage-plugin-regis-common';

const RUN = new Date('2026-05-10T09:30:00.000Z');

describe('toSnapshots', () => {
  it('maps index entries to snapshots, using snapshotDate when present', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [
        {
          imageRef: 'r/n:1',
          reportUrl: 'https://x/r.json',
          digest: 'sha256:abc',
          tier: 'Gold',
          score: 100,
          playbook: 'default',
          snapshotDate: '2026-05-09',
        },
      ],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s).toEqual({
      imageRef: 'r/n:1',
      snapshotDate: '2026-05-09',
      digest: 'sha256:abc',
      tier: 'Gold',
      score: 100,
      playbook: 'default',
      reportUrl: 'https://x/r.json',
      recordedAt: '2026-05-10T09:30:00.000Z',
    });
  });

  it('falls back to the run date (day granularity) when snapshotDate is absent', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s.snapshotDate).toBe('2026-05-10');
    expect(s.tier).toBeUndefined();
    expect(s.score).toBeUndefined();
  });
});

describe('RegisHistoryRecorder.record', () => {
  it('fetches the index and appends snapshots to the store', async () => {
    const store = new InMemoryReportHistoryStore();
    const source = {
      fetch: jest.fn().mockResolvedValue({
        schemaVersion: 1,
        images: [
          { imageRef: 'r/n:1', reportUrl: 'https://x/r.json', score: 80, snapshotDate: '2026-05-09' },
        ],
      }),
    };
    const recorder = new RegisHistoryRecorder({
      source: source as any,
      store,
      indexUrl: 'https://x/index.json',
      logger: mockServices.logger.mock(),
      now: () => RUN,
    });
    await recorder.record();
    const rows = await store.getByImageRef('r/n:1');
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test RegisHistoryRecorder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the recorder**

Create `plugins/regis-backend/src/service/RegisHistoryRecorder.ts`:

```ts
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ReportIndex,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';
import { fetchIndex } from './fetchIndex';
import type { ReportSource } from './ReportSource';
import type { ReportHistoryStore } from './ReportHistoryStore';

/** Pure: map a validated index to snapshot rows for a given run time. */
export function toSnapshots(index: ReportIndex, runDate: Date): ReportSnapshot[] {
  const recordedAt = runDate.toISOString();
  const fallbackDate = recordedAt.slice(0, 10); // YYYY-MM-DD
  return index.images.map(e => ({
    imageRef: e.imageRef,
    snapshotDate: e.snapshotDate ?? fallbackDate,
    digest: e.digest,
    tier: e.tier,
    score: e.score,
    playbook: e.playbook,
    reportUrl: e.reportUrl,
    recordedAt,
  }));
}

export interface RegisHistoryRecorderDeps {
  source: ReportSource;
  store: ReportHistoryStore;
  indexUrl: string;
  logger: LoggerService;
  now?: () => Date;
}

/** Fetches the published index and records one snapshot per image. */
export class RegisHistoryRecorder {
  private readonly now: () => Date;

  constructor(private readonly deps: RegisHistoryRecorderDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async record(): Promise<void> {
    const index = await fetchIndex(this.deps.source, this.deps.indexUrl);
    const snapshots = toSnapshots(index, this.now());
    await this.deps.store.append(snapshots);
    this.deps.logger.info(
      `regis: recorded ${snapshots.length} report snapshot(s)`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test RegisHistoryRecorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/RegisHistoryRecorder.ts plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts
git commit -m "feat(regis-backend): RegisHistoryRecorder (toSnapshots + record)"
```

---

## Task 6: Knex-backed store (self-creating schema) + integration test

**Files:**
- Modify: `plugins/regis-backend/package.json`
- Create: `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`
- Test: `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts`

- [ ] **Step 1: Add the `knex` dependency**

In `plugins/regis-backend/package.json`, add to `"dependencies"` (keep alphabetical order):

```json
"knex": "^3.0.0",
```

Then install:

Run: `yarn install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Write the failing integration test**

Create `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts`:

```ts
import { TestDatabases } from '@backstage/backend-test-utils';
import { KnexReportHistoryStore } from './KnexReportHistoryStore';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

describe('KnexReportHistoryStore', () => {
  const databases = TestDatabases.create();

  it('creates its schema, upserts idempotently, and reads ordered rows', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);

    await store.append([
      snap({ snapshotDate: '2026-05-03', score: 90, digest: 'sha256:b', tier: 'Gold' }),
      snap({ snapshotDate: '2026-05-01', score: 70, digest: 'sha256:a', tier: null }),
    ]);
    // re-observe 2026-05-01 with a new score -> upsert, no duplicate
    await store.append([snap({ snapshotDate: '2026-05-01', score: 75 })]);

    const rows = await store.getByImageRef('r/n:1');
    expect(rows.map(r => r.snapshotDate)).toEqual(['2026-05-01', '2026-05-03']);
    expect(rows[0].score).toBe(75);
    expect(rows[0].tier).toBeUndefined(); // null collapses to undefined on read
    expect(rows[1].digest).toBe('sha256:b');
    expect(await store.getByImageRef('missing')).toEqual([]);
  }, 60_000);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test KnexReportHistoryStore`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the Knex store**

Create `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`:

```ts
import type { Knex } from 'knex';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';
import type { ReportHistoryStore } from './ReportHistoryStore';

const TABLE = 'regis_report_snapshots';

interface Row {
  image_ref: string;
  snapshot_date: string;
  digest: string | null;
  tier: string | null;
  score: number | null;
  playbook: string | null;
  report_url: string | null;
  recorded_at: string;
}

/** Knex-backed persistent history store. Self-creates its table on first use. */
export class KnexReportHistoryStore implements ReportHistoryStore {
  private constructor(private readonly db: Knex) {}

  static async create(db: Knex): Promise<KnexReportHistoryStore> {
    if (!(await db.schema.hasTable(TABLE))) {
      await db.schema.createTable(TABLE, t => {
        t.text('image_ref').notNullable();
        t.text('snapshot_date').notNullable();
        t.text('digest').nullable();
        t.text('tier').nullable();
        t.integer('score').nullable();
        t.text('playbook').nullable();
        t.text('report_url').nullable();
        t.text('recorded_at').notNullable();
        t.primary(['image_ref', 'snapshot_date']);
        t.index(['image_ref']);
      });
    }
    return new KnexReportHistoryStore(db);
  }

  async append(snapshots: ReportSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const rows: Row[] = snapshots.map(s => ({
      image_ref: s.imageRef,
      snapshot_date: s.snapshotDate,
      digest: s.digest ?? null,
      tier: s.tier ?? null,
      score: s.score ?? null,
      playbook: s.playbook ?? null,
      report_url: s.reportUrl ?? null,
      recorded_at: s.recordedAt,
    }));
    await this.db<Row>(TABLE)
      .insert(rows)
      .onConflict(['image_ref', 'snapshot_date'])
      .merge();
  }

  async getByImageRef(imageRef: string): Promise<ReportSnapshot[]> {
    const rows = await this.db<Row>(TABLE)
      .where({ image_ref: imageRef })
      .orderBy('snapshot_date', 'asc');
    return rows.map(r => ({
      imageRef: r.image_ref,
      snapshotDate: r.snapshot_date,
      digest: r.digest ?? undefined,
      tier: r.tier ?? undefined,
      score: r.score ?? undefined,
      playbook: r.playbook ?? undefined,
      reportUrl: r.report_url ?? undefined,
      recordedAt: r.recorded_at,
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test KnexReportHistoryStore`
Expected: PASS (the first SQLite run may take a few seconds while `better-sqlite3` initializes).

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/package.json plugins/regis-backend/src/service/KnexReportHistoryStore.ts plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts yarn.lock
git commit -m "feat(regis-backend): Knex-backed ReportHistoryStore"
```

(`yarn.lock` is at the worktree root = current directory.)

---

## Task 7: `ReportHistoryService` (entityRef → image-ref → store)

**Files:**
- Create: `plugins/regis-backend/src/service/ReportHistoryService.ts`
- Test: `plugins/regis-backend/src/service/ReportHistoryService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/ReportHistoryService.test.ts`:

```ts
import { mockCredentials } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import {
  ReportHistoryService,
  NoImageRefError,
} from './ReportHistoryService';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';

const imageEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'library-nginx-1.27',
    namespace: 'default',
    annotations: { 'regis.io/image-ref': 'registry-1.docker.io/library/nginx:1.27' },
  },
  spec: { type: 'container-image', owner: 'group:default/team' },
};

const bareEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'bare', namespace: 'default', annotations: {} },
  spec: { type: 'service', owner: 'team', lifecycle: 'production' },
};

const creds = mockCredentials.user();

describe('ReportHistoryService', () => {
  it('resolves the image-ref and returns its ordered snapshots', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      {
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        snapshotDate: '2026-05-01',
        score: 70,
        recordedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);
    const svc = new ReportHistoryService({
      catalog: catalogServiceMock({ entities: [imageEntity] }),
      store,
    });
    const out = await svc.getHistory('resource:default/library-nginx-1.27', creds);
    expect(out.imageRef).toBe('registry-1.docker.io/library/nginx:1.27');
    expect(out.snapshots).toHaveLength(1);
  });

  it('throws NoImageRefError when the entity has no image-ref', async () => {
    const svc = new ReportHistoryService({
      catalog: catalogServiceMock({ entities: [bareEntity] }),
      store: new InMemoryReportHistoryStore(),
    });
    await expect(
      svc.getHistory('component:default/bare', creds),
    ).rejects.toBeInstanceOf(NoImageRefError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `plugins/regis-backend/src/service/ReportHistoryService.ts`:

```ts
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  getRegisImageRef,
  type ReportHistory,
} from '@regis/backstage-plugin-regis-common';
import type { ReportHistoryStore } from './ReportHistoryStore';

/** Thrown when an entity carries no `regis.io/image-ref` annotation. */
export class NoImageRefError extends Error {
  constructor(entityRef: string) {
    super(`no Regis image-ref annotation on ${entityRef}`);
    this.name = 'NoImageRefError';
  }
}

export interface ReportHistoryServiceDeps {
  catalog: CatalogService;
  store: ReportHistoryStore;
}

export class ReportHistoryService {
  constructor(private readonly deps: ReportHistoryServiceDeps) {}

  async getHistory(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<ReportHistory> {
    const entity = await this.deps.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    const imageRef = entity && getRegisImageRef(entity);
    if (!imageRef) throw new NoImageRefError(entityRef);
    const snapshots = await this.deps.store.getByImageRef(imageRef);
    return { imageRef, snapshots };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/ReportHistoryService.ts plugins/regis-backend/src/service/ReportHistoryService.test.ts
git commit -m "feat(regis-backend): ReportHistoryService + NoImageRefError"
```

---

## Task 8: Router endpoint `GET /report/history`

**Files:**
- Modify: `plugins/regis-backend/src/router.ts`

- [ ] **Step 1: Extend `RouterOptions`**

In `plugins/regis-backend/src/router.ts`, add to the `RouterOptions` interface:

```ts
  historyService: ReportHistoryService;
```

and import it + the error type:

```ts
import {
  NoImageRefError,
  ReportHistoryService,
} from './service/ReportHistoryService';
```

Destructure it at the top of `createRouter`:

```ts
  const { httpAuth, reportService, aggregator, historyService } = options;
```

- [ ] **Step 2: Add the route**

After the existing `router.get('/reports', …)` handler, add:

```ts
  router.get('/report/history', async (req, res) => {
    const entityRef = req.query.entityRef;
    if (typeof entityRef !== 'string' || !entityRef) {
      throw new InputError('query parameter "entityRef" is required');
    }
    const credentials = await httpAuth.credentials(req);
    const history = await historyService.getHistory(entityRef, credentials);
    res.json(history);
  });
```

- [ ] **Step 3: Map `NoImageRefError` to 404**

In the error-handling middleware, add a branch alongside `NoReportError`:

```ts
      } else if (err instanceof NoImageRefError) {
        res.status(404).json({ error: err.message });
```

(Place it immediately after the `NoReportError` branch.)

- [ ] **Step 4: Confirm it compiles**

Run: `yarn workspace @regis/backstage-plugin-regis-backend tsc`

(If the package has no `tsc` script, run `yarn tsc` from the repo root, or rely on the test run in Task 9 to surface compile errors.)
Expected: no type errors. The router will be exercised end-to-end in Task 9 once `plugin.ts` provides `historyService`.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/router.ts
git commit -m "feat(regis-backend): GET /report/history route"
```

---

## Task 9: Wire the plugin (database, store, recorder, router) + integration tests

**Files:**
- Modify: `plugins/regis-backend/src/plugin.ts`
- Test: `plugins/regis-backend/src/router.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to `plugins/regis-backend/src/router.test.ts`. First add a Regis image entity fixture near the top (after `bareEntity`):

```ts
const imageEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'library-nginx-1.27',
    namespace: 'default',
    annotations: { 'regis.io/image-ref': 'registry-1.docker.io/library/nginx:1.27' },
  },
  spec: { type: 'container-image', owner: 'group:default/team' },
};
```

Then add the cases inside the `describe`:

```ts
  it('GET /report/history returns an empty series for a known image with no history', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [imageEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/report/history?entityRef=resource:default/library-nginx-1.27')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      snapshots: [],
    });
  });

  it('GET /report/history 404s when the entity has no image-ref', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/report/history?entityRef=component:default/bare')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: FAIL — `regisPlugin` does not yet provide `historyService` to the router (type error or runtime 500).

- [ ] **Step 3: Wire `plugin.ts`**

In `plugins/regis-backend/src/plugin.ts`:

Add imports:

```ts
import { KnexReportHistoryStore } from './service/KnexReportHistoryStore';
import { ReportHistoryService } from './service/ReportHistoryService';
import { RegisHistoryRecorder } from './service/RegisHistoryRecorder';
```

Add `database` to the `deps` object:

```ts
        database: coreServices.database,
```

Add `database` to the `init({ … })` destructure.

Inside `init`, after the existing `const source = new HttpReportSource();` line, build the history store + service:

```ts
        const historyStore = await KnexReportHistoryStore.create(
          await database.getClient(),
        );
        const historyService = new ReportHistoryService({
          catalog,
          store: historyStore,
        });
```

Pass `historyService` to `createRouter`:

```ts
        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            reportService,
            aggregator,
            historyService,
          }),
        );
```

After the existing `regis-aggregate` scheduled task, add the recorder task (gated on `indexUrl`):

```ts
        const indexUrl = config.getOptionalString('regis.catalog.indexUrl');
        if (indexUrl) {
          const refreshMinutes =
            config.getOptionalNumber('regis.catalog.refreshMinutes') ?? 30;
          const recorder = new RegisHistoryRecorder({
            source,
            store: historyStore,
            indexUrl,
            logger,
          });
          await scheduler.scheduleTask({
            id: 'regis-history-record',
            frequency: { minutes: refreshMinutes },
            timeout: { minutes: 5 },
            initialDelay: { seconds: 20 },
            scope: 'global',
            fn: async () => {
              await recorder.record();
            },
          });
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: PASS (both new cases + the existing `/health` and `/report` cases).

- [ ] **Step 5: Run the full backend package test suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/plugin.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat(regis-backend): wire history store, recorder task, and /report/history"
```

---

## Task 10: Frontend API — `getHistory`

**Files:**
- Modify: `plugins/regis/src/api/RegisApi.ts`
- Modify: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis/src/api/RegisClient.test.ts`:

```ts
  it('GETs /report/history with an encoded entityRef', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageRef: 'r/n:1', snapshots: [] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getHistory('resource:default/library-nginx-1.27');
    expect(out.imageRef).toBe('r/n:1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/report/history?entityRef=resource%3Adefault%2Flibrary-nginx-1.27',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: FAIL — `client.getHistory` is not a function.

- [ ] **Step 3: Extend the API interface**

In `plugins/regis/src/api/RegisApi.ts`:

- add `ReportHistory` to the type import from `@regis/backstage-plugin-regis-common` and to the `export type { … }` re-export.
- add to the `RegisApi` interface:

```ts
  getHistory(entityRef: string): Promise<ReportHistory>;
```

- [ ] **Step 4: Implement it on the client**

In `plugins/regis/src/api/RegisClient.ts`:

- add `ReportHistory` to the type import from `./RegisApi`.
- add the method (after `listReports`):

```ts
  async getHistory(entityRef: string): Promise<ReportHistory> {
    return this.getJson<ReportHistory>(
      `/report/history?entityRef=${encodeURIComponent(entityRef)}`,
    );
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(regis): RegisClient.getHistory"
```

---

## Task 11: Trajectory card

**Files:**
- Create: `plugins/regis/src/components/RegisTrajectoryCard.tsx`
- Test: `plugins/regis/src/components/RegisTrajectoryCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisTrajectoryCard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportHistory } from '../api/RegisApi';
import { RegisTrajectoryCard } from './RegisTrajectoryCard';

const image: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'library-nginx-1.27', namespace: 'default' },
  spec: { type: 'container-image' },
};

const renderCard = (getHistory: () => Promise<ReportHistory>) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            getHistory,
            getReport: async () => {
              throw new Error('not used');
            },
            listReports: async () => [],
          },
        ],
      ]}
    >
      <EntityProvider entity={image}>
        <RegisTrajectoryCard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisTrajectoryCard', () => {
  it('renders a sparkline and the latest posture when history exists', async () => {
    await renderCard(async () => ({
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      snapshots: [
        { imageRef: 'r/n:1', snapshotDate: '2026-05-01', score: 70, tier: 'Silver', recordedAt: '2026-05-01T00:00:00.000Z' },
        { imageRef: 'r/n:1', snapshotDate: '2026-05-09', score: 100, tier: 'Gold', recordedAt: '2026-05-09T00:00:00.000Z' },
      ],
    }));
    expect(await screen.findByText('Trajectory')).toBeInTheDocument();
    expect(await screen.findByLabelText('score trajectory')).toBeInTheDocument();
    expect(screen.getByText(/latest Gold/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    await renderCard(async () => ({ imageRef: 'r/n:1', snapshots: [] }));
    expect(await screen.findByText('No history recorded yet.')).toBeInTheDocument();
  });
});
```

Add the `TestApiProvider` import at the top:

```tsx
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
```

(Replace the single `renderInTestApp` import line accordingly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisTrajectoryCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the card**

Create `plugins/regis/src/components/RegisTrajectoryCard.tsx`:

```tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { regisApiRef, type ReportHistory } from '../api/RegisApi';

const TIER_COLOR: Record<string, string> = {
  gold: '#d4af37',
  silver: '#9ca3af',
  bronze: '#cd7f32',
  none: '#9ca3af',
};

/** Dependency-free SVG sparkline of score over time, dots coloured by tier. */
function Sparkline({ history }: { history: ReportHistory }) {
  const pts = history.snapshots.filter(
    (s): s is typeof s & { score: number } => typeof s.score === 'number',
  );
  if (pts.length < 2) {
    return <span>Not enough history to plot a trend yet.</span>;
  }
  const W = 320;
  const H = 64;
  const P = 6;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (score: number) => H - P - (score / 100) * (H - 2 * P);
  const line = pts.map((s, i) => `${x(i)},${y(s.score)}`).join(' ');
  return (
    <svg width={W} height={H} role="img" aria-label="score trajectory">
      <polyline fill="none" stroke="currentColor" strokeWidth={2} points={line} />
      {pts.map((s, i) => (
        <circle
          key={s.snapshotDate}
          cx={x(i)}
          cy={y(s.score)}
          r={3}
          fill={TIER_COLOR[(s.tier ?? 'none').toLowerCase()] ?? 'currentColor'}
        >
          <title>{`${s.snapshotDate}: ${s.score} (${s.tier ?? 'none'})`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Score/tier trajectory of a container-image entity over time. */
export function RegisTrajectoryCard() {
  const { entity } = useEntity();
  const api = useApi(regisApiRef);
  const entityRef = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(
    () => api.getHistory(entityRef),
    [entityRef],
  );

  if (loading) {
    return (
      <InfoCard title="Trajectory">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Trajectory">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const snapshots = value?.snapshots ?? [];
  if (snapshots.length === 0) {
    return <InfoCard title="Trajectory">No history recorded yet.</InfoCard>;
  }

  const latest = snapshots[snapshots.length - 1];
  return (
    <InfoCard
      title="Trajectory"
      subheader={`${snapshots.length} snapshots · latest ${
        latest.tier ?? 'none'
      } (${latest.score ?? '—'})`}
    >
      <Sparkline history={value!} />
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisTrajectoryCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisTrajectoryCard.tsx plugins/regis/src/components/RegisTrajectoryCard.test.tsx
git commit -m "feat(regis): RegisTrajectoryCard with SVG sparkline"
```

---

## Task 12: Register the card

**Files:**
- Modify: `plugins/regis/src/plugin.tsx`

- [ ] **Step 1: Add the blueprint**

In `plugins/regis/src/plugin.tsx`, after the `aliasesCard` definition, add:

```tsx
const trajectoryCard = EntityCardBlueprint.make({
  name: 'trajectory',
  params: {
    filter: isContainerImage,
    loader: () =>
      import('./components/RegisTrajectoryCard').then(m => (
        <m.RegisTrajectoryCard />
      )),
  },
});
```

- [ ] **Step 2: Add it to the plugin extensions**

In the `extensions: [ … ]` array of `regisPlugin`, add `trajectoryCard` (after `aliasesCard`).

- [ ] **Step 3: Run the frontend package tests**

Run: `yarn workspace @regis/backstage-plugin-regis test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/regis/src/plugin.tsx
git commit -m "feat(regis): register trajectory card on container-image entities"
```

---

## Task 13: Full verification

- [ ] **Step 1: Run all three package test suites**

Run:
```bash
yarn workspace @regis/backstage-plugin-regis-common test
yarn workspace @regis/backstage-plugin-regis-backend test
yarn workspace @regis/backstage-plugin-regis test
```
Expected: all PASS.

- [ ] **Step 2: Type-check / lint the touched packages**

Run:
```bash
yarn workspace @regis/backstage-plugin-regis-common lint
yarn workspace @regis/backstage-plugin-regis-backend lint
yarn workspace @regis/backstage-plugin-regis lint
```
Expected: no errors. Fix any unused-import or formatting issues surfaced (e.g. the `validateReportIndex` import removed in Task 3).

- [ ] **Step 3: Final confirmation commit (only if lint produced fixes)**

```bash
git add -A
git commit -m "chore(regis): lint fixes for report history store"
```

---

## Notes for the implementer

- **`onConflict().merge()`** is supported by Knex on both SQLite (`better-sqlite3`) and Postgres — the two backends `TestDatabases`/production use here. No raw SQL needed.
- **`scope: 'global'`** on the recorder task is deliberate: the DB is shared across replicas, so only one replica should write each tick (contrast with the existing `regis-aggregate` task, which is `'local'` because it warms each replica's in-memory snapshot).
- **`startTestBackend`** provides a real in-memory database service, so the `/report/history` integration tests exercise the Knex store end-to-end (empty-series path). The seeded-series path is covered by the `KnexReportHistoryStore` and `ReportHistoryService` unit/integration tests.
- **Cross-repo dependency:** until the regis-side index generator emits `snapshotDate`, every snapshot is dated by the scheduler run date (day granularity) — functional, just less precise. No action needed in this repo.
- **Out of scope (follow-on slices on this same store):** portfolio aggregate dashboard, dedicated digest-moves view, drift hook (Phase 3 Slice E), retention/pruning policy.
