# Portfolio Trend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated "Portfolio Trends" page that shows the whole image portfolio's posture over time (tier distribution + average score, 90-day daily as-of carry-forward) from the persistent report-history store.

**Architecture:** Approach 1 — a new `listSnapshots()` store read, a **pure** delta-based `aggregateTrend()` function, and a **warmed-cache** `PortfolioTrendAggregator` (mirrors `CatalogAggregator`) behind a `GET /portfolio/trend` endpoint. The frontend page renders KPI cards + a dependency-free stacked-area SVG. The data-access seam (`listSnapshots`) and the warmed cache are the documented scaling points for 170k+ images.

**Tech Stack:** Backstage new backend system (`coreServices`, `scheduler`, `database`/Knex), Jest (`backstage-cli`), `better-sqlite3` for integration tests, Backstage new frontend system (`PageBlueprint`), React + inline SVG.

**Spec:** `docs/superpowers/specs/2026-06-03-regis-backstage-portfolio-trend-dashboard-design.md`

---

## File structure

**`plugins/regis-common/`:**
- `src/report-api.ts` — add `TrendBucket` + `PortfolioTrend` types.
- `src/index.ts` — export them.

**`plugins/regis-backend/`:**
- `src/service/aggregateTrend.ts` — pure delta-based aggregation (the core algorithm).
- `src/service/ReportHistoryStore.ts` — add `listSnapshots()` to the interface + in-memory impl.
- `src/service/KnexReportHistoryStore.ts` — add `listSnapshots()` SQL impl.
- `src/service/PortfolioTrendAggregator.ts` — warmed-cache aggregator + volume guard.
- `src/router.ts` — add `GET /portfolio/trend`; extend `RouterOptions`.
- `src/plugin.ts` — build the aggregator, schedule its warm-up, pass it to the router.

**`plugins/regis/`:**
- `src/api/RegisApi.ts` — add `getPortfolioTrend`; re-export `PortfolioTrend`.
- `src/api/RegisClient.ts` — implement `getPortfolioTrend`.
- `src/components/RegisPortfolioTrendsPage.tsx` — the page (KPI cards + stacked-area SVG).
- `src/components/portfolioChart.tsx` — the dependency-free SVG chart (kept separate from the page for focus + testability).
- `src/routes.ts` — add `portfolioRouteRef`.
- `src/plugin.tsx` — register the page extension (with title + icon → nav item).

**Conventions:**
- This is a **fresh worktree with no `node_modules`** — Task 0 installs them.
- Run a single package's tests with `yarn workspace <pkg> test <file>`. If that errors with `command not found: backstage-cli`, use the direct binary: `cd plugins/<pkg> && CI=true ../../node_modules/.bin/backstage-cli package test <file>` (CI=true runs once instead of watch). `<pkg>` ∈ `@regis/backstage-plugin-regis-common`, `@regis/backstage-plugin-regis-backend`, `@regis/backstage-plugin-regis`.
- Commit after each task with the message shown.

---

## Task 0: Install dependencies (prerequisite)

**Files:** none (environment setup).

- [ ] **Step 1: Install**

Run: `yarn install`
Expected: completes without errors; a `node_modules/` directory now exists at the worktree root.

- [ ] **Step 2: Sanity-check the toolchain on an existing test**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/service/ReportHistoryStore.test.ts`
Expected: PASS (confirms `node_modules` installed and the test runner is invocable). If it errors with `command not found: backstage-cli`, use `cd plugins/regis-backend && CI=true ../../node_modules/.bin/backstage-cli package test src/service/ReportHistoryStore.test.ts` instead — that is the fallback form for every test command below.

---

## Task 1: Contract types — `TrendBucket` + `PortfolioTrend`

**Files:**
- Modify: `plugins/regis-common/src/report-api.ts`
- Modify: `plugins/regis-common/src/index.ts`
- Test: `plugins/regis-common/src/report-api.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-common/src/report-api.test.ts`:

```ts
import type { TrendBucket, PortfolioTrend } from './report-api';

describe('portfolio trend types', () => {
  it('shapes a bucket and a trend', () => {
    const bucket: TrendBucket = {
      date: '2026-06-03',
      gold: 1,
      silver: 0,
      bronze: 0,
      none: 0,
      total: 1,
      avgScore: 90,
    };
    const trend: PortfolioTrend = {
      generatedAt: '2026-06-03T00:00:00.000Z',
      days: 90,
      buckets: [bucket],
    };
    expect(trend.buckets[0].total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-api`
Expected: FAIL — `TrendBucket` / `PortfolioTrend` not exported (type error).

- [ ] **Step 3: Add the types**

Append to `plugins/regis-common/src/report-api.ts`:

```ts
/** One daily bucket of the portfolio's posture distribution. */
export interface TrendBucket {
  date: string; // ISO date (YYYY-MM-DD)
  gold: number;
  silver: number;
  bronze: number;
  none: number; // images whose as-of snapshot has no/unknown tier
  total: number; // gold + silver + bronze + none
  avgScore: number; // mean score across images with a numeric score (0 if none)
}

/** Portfolio posture over time, as served by `GET /portfolio/trend`. */
export interface PortfolioTrend {
  generatedAt: string; // ISO datetime
  days: number;
  buckets: TrendBucket[];
}
```

- [ ] **Step 4: Export from the package index**

In `plugins/regis-common/src/index.ts`, extend the `./report-api` type export to:

```ts
export type {
  ReportEnvelope,
  ReportSummary,
  ReportSnapshot,
  ReportHistory,
  TrendBucket,
  PortfolioTrend,
} from './report-api';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-common/src/report-api.ts plugins/regis-common/src/index.ts plugins/regis-common/src/report-api.test.ts
git commit -m "feat(regis-common): TrendBucket/PortfolioTrend types"
```

---

## Task 2: Pure aggregation — `aggregateTrend`

**Files:**
- Create: `plugins/regis-backend/src/service/aggregateTrend.ts`
- Test: `plugins/regis-backend/src/service/aggregateTrend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/aggregateTrend.test.ts`:

```ts
import { aggregateTrend } from './aggregateTrend';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('aggregateTrend', () => {
  it('produces one bucket per day ending at today', () => {
    const out = aggregateTrend([], { days: 3, today: '2026-06-03' });
    expect(out.map(b => b.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(out.every(b => b.total === 0 && b.avgScore === 0)).toBe(true);
  });

  it('carries a pre-window snapshot forward across all days (as-of)', () => {
    const out = aggregateTrend(
      [snap({ snapshotDate: '2026-05-01', tier: 'Gold', score: 100 })],
      { days: 2, today: '2026-06-03' },
    );
    expect(out).toEqual([
      { date: '2026-06-02', gold: 1, silver: 0, bronze: 0, none: 0, total: 1, avgScore: 100 },
      { date: '2026-06-03', gold: 1, silver: 0, bronze: 0, none: 0, total: 1, avgScore: 100 },
    ]);
  });

  it('applies an in-window tier transition on its date', () => {
    const out = aggregateTrend(
      [
        snap({ snapshotDate: '2026-05-01', tier: 'Bronze', score: 60 }),
        snap({ snapshotDate: '2026-06-02', tier: 'Gold', score: 100 }),
      ],
      { days: 3, today: '2026-06-03' },
    );
    expect(out.map(b => ({ d: b.date, g: b.gold, b: b.bronze, s: b.avgScore }))).toEqual([
      { d: '2026-06-01', g: 0, b: 1, s: 60 },
      { d: '2026-06-02', g: 1, b: 0, s: 100 },
      { d: '2026-06-03', g: 1, b: 0, s: 100 },
    ]);
  });

  it('counts an image only from its first in-window snapshot', () => {
    const out = aggregateTrend(
      [snap({ snapshotDate: '2026-06-03', tier: 'Silver', score: 80 })],
      { days: 2, today: '2026-06-03' },
    );
    expect(out[0].total).toBe(0); // 2026-06-02: not yet present
    expect(out[1]).toMatchObject({ silver: 1, total: 1, avgScore: 80 });
  });

  it('puts null/unknown tiers in the none bucket and excludes them from avgScore', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', tier: null, score: undefined }),
        snap({ imageRef: 'b:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 90 }),
      ],
      { days: 1, today: '2026-06-03' },
    );
    expect(out[0]).toEqual({
      date: '2026-06-03', gold: 1, silver: 0, bronze: 0, none: 1, total: 2, avgScore: 90,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test aggregateTrend`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the algorithm**

Create `plugins/regis-backend/src/service/aggregateTrend.ts`:

```ts
import type {
  ReportSnapshot,
  TrendBucket,
} from '@regis/backstage-plugin-regis-common';

type Tier = 'gold' | 'silver' | 'bronze' | 'none';

function tierOf(t?: string | null): Tier {
  const v = (t ?? '').toLowerCase();
  return v === 'gold' || v === 'silver' || v === 'bronze' ? v : 'none';
}

/** Add `delta` days to an ISO date (UTC), returning a YYYY-MM-DD string. */
function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface State {
  tier: Tier;
  score?: number;
}
interface Counters {
  gold: number;
  silver: number;
  bronze: number;
  none: number;
  total: number;
  scoreSum: number;
  scored: number;
}

function applyState(c: Counters, st: State | undefined, sign: 1 | -1): void {
  if (!st) return;
  c[st.tier] += sign;
  c.total += sign;
  if (typeof st.score === 'number') {
    c.scoreSum += sign * st.score;
    c.scored += sign;
  }
}

/**
 * Daily as-of carry-forward distribution of portfolio posture over `days`
 * ending at `today`. Delta/event-based: O(snapshots + days), never
 * O(days * images). `today` is injected for deterministic tests.
 */
export function aggregateTrend(
  snapshots: ReportSnapshot[],
  opts: { days: number; today: string },
): TrendBucket[] {
  const { days, today } = opts;
  const windowStart = isoAddDays(today, -(days - 1));

  // Group by image, sorted by snapshotDate ascending.
  const byImage = new Map<string, ReportSnapshot[]>();
  for (const s of snapshots) {
    const arr = byImage.get(s.imageRef);
    if (arr) arr.push(s);
    else byImage.set(s.imageRef, [s]);
  }
  for (const arr of byImage.values()) {
    arr.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  const counters: Counters = {
    gold: 0, silver: 0, bronze: 0, none: 0, total: 0, scoreSum: 0, scored: 0,
  };
  const state = new Map<string, State>();
  // Events strictly within the window, bucketed by date: image -> new state.
  const eventsByDate = new Map<string, Array<{ image: string; st: State }>>();

  for (const [image, arr] of byImage) {
    let baseline: State | undefined;
    for (const s of arr) {
      const st: State = { tier: tierOf(s.tier), score: s.score };
      if (s.snapshotDate <= windowStart) {
        baseline = st; // latest snapshot at/before window start wins
      } else if (s.snapshotDate <= today) {
        const list = eventsByDate.get(s.snapshotDate);
        if (list) list.push({ image, st });
        else eventsByDate.set(s.snapshotDate, [{ image, st }]);
      }
      // snapshots after `today` are ignored
    }
    if (baseline) {
      state.set(image, baseline);
      applyState(counters, baseline, 1);
    }
  }

  const buckets: TrendBucket[] = [];
  for (let i = 0; i < days; i++) {
    const date = isoAddDays(windowStart, i);
    for (const { image, st } of eventsByDate.get(date) ?? []) {
      applyState(counters, state.get(image), -1);
      state.set(image, st);
      applyState(counters, st, 1);
    }
    buckets.push({
      date,
      gold: counters.gold,
      silver: counters.silver,
      bronze: counters.bronze,
      none: counters.none,
      total: counters.total,
      avgScore: counters.scored
        ? Math.round(counters.scoreSum / counters.scored)
        : 0,
    });
  }
  return buckets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test aggregateTrend`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/aggregateTrend.ts plugins/regis-backend/src/service/aggregateTrend.test.ts
git commit -m "feat(regis-backend): pure delta-based aggregateTrend"
```

---

## Task 3: Store `listSnapshots()`

**Files:**
- Modify: `plugins/regis-backend/src/service/ReportHistoryStore.ts`
- Modify: `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`
- Test: `plugins/regis-backend/src/service/ReportHistoryStore.test.ts` (extend)
- Test: `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Add to `plugins/regis-backend/src/service/ReportHistoryStore.test.ts` (inside the existing `describe('InMemoryReportHistoryStore', …)`):

```ts
  it('listSnapshots returns every stored row', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      snap({ imageRef: 'a:1', snapshotDate: '2026-05-01' }),
      snap({ imageRef: 'b:1', snapshotDate: '2026-05-02' }),
    ]);
    const all = await store.listSnapshots();
    expect(all).toHaveLength(2);
    expect(new Set(all.map(s => s.imageRef))).toEqual(new Set(['a:1', 'b:1']));
  });
```

Add to `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts` (inside the existing `describe`, as a new `it` using the same `databases`/`snap` helpers):

```ts
  it('listSnapshots returns all rows across images', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);
    await store.append([
      snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', score: 70 }),
      snap({ imageRef: 'b:1', snapshotDate: '2026-05-02', score: 90 }),
    ]);
    const all = await store.listSnapshots();
    expect(all).toHaveLength(2);
    expect(all.map(s => s.imageRef).sort()).toEqual(['a:1', 'b:1']);
  }, 60_000);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryStore`
Expected: FAIL — `store.listSnapshots` is not a function (both files).

- [ ] **Step 3: Add to the interface + in-memory impl**

In `plugins/regis-backend/src/service/ReportHistoryStore.ts`, add to the `ReportHistoryStore` interface:

```ts
  /** All snapshots across all images (data access for aggregation). */
  listSnapshots(): Promise<ReportSnapshot[]>;
```

And to `InMemoryReportHistoryStore`:

```ts
  async listSnapshots(): Promise<ReportSnapshot[]> {
    return [...this.rows.values()].map(s => ({ ...s, tier: s.tier ?? undefined }));
  }
```

- [ ] **Step 4: Add the Knex impl**

In `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`, add a method to the class (mirroring `getByImageRef`'s row mapping):

```ts
  async listSnapshots(): Promise<ReportSnapshot[]> {
    const rows = await this.db<Row>(TABLE).select('*');
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test ReportHistoryStore KnexReportHistoryStore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/service/ReportHistoryStore.ts plugins/regis-backend/src/service/KnexReportHistoryStore.ts plugins/regis-backend/src/service/ReportHistoryStore.test.ts plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts
git commit -m "feat(regis-backend): ReportHistoryStore.listSnapshots"
```

---

## Task 4: Warmed-cache `PortfolioTrendAggregator`

**Files:**
- Create: `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`
- Test: `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`:

```ts
import { mockServices } from '@backstage/backend-test-utils';
import { PortfolioTrendAggregator } from './PortfolioTrendAggregator';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';

describe('PortfolioTrendAggregator', () => {
  it('refreshes from the store and computes a trend for the cached snapshots', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 100, recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const agg = new PortfolioTrendAggregator({
      store,
      logger: mockServices.logger.mock(),
    });
    await agg.refresh();
    const buckets = agg.trend(2, '2026-06-03');
    expect(buckets).toHaveLength(2);
    expect(buckets[1]).toMatchObject({ gold: 1, total: 1, avgScore: 100 });
  });

  it('ensureFresh only reloads when stale', async () => {
    const store = new InMemoryReportHistoryStore();
    let now = 1000;
    const agg = new PortfolioTrendAggregator({
      store,
      logger: mockServices.logger.mock(),
      now: () => now,
    });
    const spy = jest.spyOn(store, 'listSnapshots');
    await agg.ensureFresh(5000);
    await agg.ensureFresh(5000); // still fresh -> no second load
    expect(spy).toHaveBeenCalledTimes(1);
    now = 1000 + 6000; // now stale
    await agg.ensureFresh(5000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('warns when the snapshot volume exceeds the in-memory threshold', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'b:1', snapshotDate: '2026-05-01', recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const logger = mockServices.logger.mock();
    const warn = jest.spyOn(logger, 'warn');
    const agg = new PortfolioTrendAggregator({ store, logger, rowWarnThreshold: 1 });
    await agg.refresh();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/SQL|rollup|volume/i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test PortfolioTrendAggregator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the aggregator**

Create `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`:

```ts
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ReportSnapshot,
  TrendBucket,
} from '@regis/backstage-plugin-regis-common';
import { aggregateTrend } from './aggregateTrend';
import type { ReportHistoryStore } from './ReportHistoryStore';

export interface PortfolioTrendAggregatorDeps {
  store: ReportHistoryStore;
  logger: LoggerService;
  /** Log a warning past this many loaded rows (scaling signal). Default 500_000. */
  rowWarnThreshold?: number;
  now?: () => number;
}

/**
 * Caches all snapshots (the expensive read at scale) and computes the trend
 * per request from the cache — per-request cost is O(snapshots + days), and the
 * DB read runs only on refresh. Mirrors CatalogAggregator. The `store.listSnapshots`
 * + in-memory compute is the documented seam to swap for a SQL/rollup impl at
 * very large volumes.
 */
export class PortfolioTrendAggregator {
  private snapshots: ReportSnapshot[] = [];
  private lastRunAt = 0;
  private inFlight: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly rowWarnThreshold: number;

  constructor(private readonly deps: PortfolioTrendAggregatorDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.rowWarnThreshold = deps.rowWarnThreshold ?? 500_000;
  }

  async refresh(): Promise<void> {
    this.snapshots = await this.deps.store.listSnapshots();
    this.lastRunAt = this.now();
    if (this.snapshots.length > this.rowWarnThreshold) {
      this.deps.logger.warn(
        `regis: portfolio trend loaded ${this.snapshots.length} snapshots in memory ` +
          `(> ${this.rowWarnThreshold}); consider the SQL/rollup aggregation path`,
      );
    }
  }

  async ensureFresh(maxAgeMs: number): Promise<void> {
    const isFresh = this.lastRunAt !== 0 && this.now() - this.lastRunAt < maxAgeMs;
    if (isFresh) return;
    if (!this.inFlight) {
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = null;
      });
    }
    await this.inFlight;
  }

  /** Compute the trend for the cached snapshots. `today` = ISO date. */
  trend(days: number, today: string): TrendBucket[] {
    return aggregateTrend(this.snapshots, { days, today });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test PortfolioTrendAggregator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/PortfolioTrendAggregator.ts plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts
git commit -m "feat(regis-backend): PortfolioTrendAggregator (warmed cache + volume guard)"
```

---

## Task 5: Endpoint `GET /portfolio/trend` + wiring

**Files:**
- Modify: `plugins/regis-backend/src/router.ts`
- Modify: `plugins/regis-backend/src/plugin.ts`
- Test: `plugins/regis-backend/src/router.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Add to `plugins/regis-backend/src/router.test.ts` (inside the existing `describe('regis-backend routes', …)`):

```ts
  it('GET /portfolio/trend returns a bounded daily series', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=7')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets).toHaveLength(7);
    expect(typeof res.body.generatedAt).toBe('string');
  });

  it('GET /portfolio/trend clamps days out of range', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=9999')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(365);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: FAIL — route 404 / `portfolioTrend` not wired.

- [ ] **Step 3: Extend the router**

In `plugins/regis-backend/src/router.ts`:

Add the import:

```ts
import type { PortfolioTrendAggregator } from './service/PortfolioTrendAggregator';
```

Add to `RouterOptions`:

```ts
  portfolioTrend: PortfolioTrendAggregator;
```

Destructure it:

```ts
  const { httpAuth, reportService, aggregator, historyService, portfolioTrend } =
    options;
```

After the `/report/history` handler, add:

```ts
  router.get('/portfolio/trend', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      generatedAt: new Date().toISOString(),
      days,
      buckets: portfolioTrend.trend(days, today),
    });
  });
```

- [ ] **Step 4: Wire it in `plugin.ts`**

In `plugins/regis-backend/src/plugin.ts`:

Add the import:

```ts
import { PortfolioTrendAggregator } from './service/PortfolioTrendAggregator';
```

After `historyService` is built, add:

```ts
        const portfolioTrend = new PortfolioTrendAggregator({
          store: historyStore,
          logger,
          rowWarnThreshold: config.getOptionalNumber(
            'regis.portfolio.inMemoryRowLimit',
          ),
        });
```

Pass it to `createRouter`:

```ts
        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            reportService,
            aggregator,
            historyService,
            portfolioTrend,
          }),
        );
```

After the `regis-aggregate` scheduled task, add a warm-up task:

```ts
        // Warm the portfolio-trend cache (the expensive listSnapshots read)
        // periodically. `scope: 'local'` warms each replica's own cache.
        await scheduler.scheduleTask({
          id: 'regis-portfolio-trend',
          frequency: { minutes: 30 },
          timeout: { minutes: 5 },
          initialDelay: { seconds: 25 },
          scope: 'local',
          fn: async () => {
            await portfolioTrend.refresh();
          },
        });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: PASS (both new cases + existing).

- [ ] **Step 6: Run the full backend suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-backend/src/router.ts plugins/regis-backend/src/plugin.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat(regis-backend): GET /portfolio/trend endpoint + wiring"
```

---

## Task 6: Frontend API — `getPortfolioTrend`

**Files:**
- Modify: `plugins/regis/src/api/RegisApi.ts`
- Modify: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis/src/api/RegisClient.test.ts`:

```ts
  it('GETs /portfolio/trend with the days param', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: 'x', days: 90, buckets: [] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getPortfolioTrend(90);
    expect(out.days).toBe(90);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/portfolio/trend?days=90',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: FAIL — `client.getPortfolioTrend` is not a function.

- [ ] **Step 3: Extend the API + client**

In `plugins/regis/src/api/RegisApi.ts`:
- add `PortfolioTrend` to the import from `@regis/backstage-plugin-regis-common` and to the `export type { … }` re-export.
- add to the `RegisApi` interface:

```ts
  getPortfolioTrend(days: number): Promise<PortfolioTrend>;
```

In `plugins/regis/src/api/RegisClient.ts`:
- add `PortfolioTrend` to the type import from `./RegisApi`.
- add the method (after `getHistory`):

```ts
  async getPortfolioTrend(days: number): Promise<PortfolioTrend> {
    return this.getJson<PortfolioTrend>(`/portfolio/trend?days=${encodeURIComponent(days)}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(regis): RegisClient.getPortfolioTrend"
```

---

## Task 7: Stacked-area SVG chart component

**Files:**
- Create: `plugins/regis/src/components/portfolioChart.tsx`
- Test: `plugins/regis/src/components/portfolioChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/portfolioChart.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PortfolioStackedArea } from './portfolioChart';
import type { TrendBucket } from '@regis/backstage-plugin-regis-common';

const buckets: TrendBucket[] = [
  { date: '2026-06-01', gold: 1, silver: 1, bronze: 0, none: 0, total: 2, avgScore: 80 },
  { date: '2026-06-02', gold: 2, silver: 0, bronze: 0, none: 0, total: 2, avgScore: 95 },
];

describe('PortfolioStackedArea', () => {
  it('renders an svg with one stacked band polygon per tier plus a score line', () => {
    render(<PortfolioStackedArea buckets={buckets} />);
    const svg = screen.getByRole('img', { name: /portfolio posture over time/i });
    expect(svg).toBeInTheDocument();
    // 4 tier bands + 1 score polyline
    expect(svg.querySelectorAll('polygon')).toHaveLength(4);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('renders nothing meaningful for an empty series', () => {
    render(<PortfolioStackedArea buckets={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test portfolioChart`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chart**

Create `plugins/regis/src/components/portfolioChart.tsx`:

```tsx
import type { TrendBucket } from '@regis/backstage-plugin-regis-common';

const TIER_COLOR: Record<string, string> = {
  gold: '#d4af37',
  silver: '#9ca3af',
  bronze: '#cd7f32',
  none: '#e5e7eb',
};
const BANDS = ['gold', 'silver', 'bronze', 'none'] as const;

/** Dependency-free stacked-area chart of tier counts + an average-score line. */
export function PortfolioStackedArea({ buckets }: { buckets: TrendBucket[] }) {
  if (buckets.length === 0) return <span>No data yet.</span>;

  const W = 760;
  const H = 280;
  const P = 32;
  const n = buckets.length;
  const maxTotal = Math.max(1, ...buckets.map(b => b.total));
  const x = (i: number) =>
    P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const yCount = (v: number) => H - P - (v / maxTotal) * (H - 2 * P);
  const yScore = (v: number) => H - P - (v / 100) * (H - 2 * P);

  // Cumulative stack: each band's top edge is the running sum up to and including it.
  const cumulativeTops = buckets.map(b => {
    let acc = 0;
    return BANDS.map(tier => (acc += b[tier]));
  });

  const bands = BANDS.map((tier, bandIdx) => {
    const topPts = buckets.map((_, i) => `${x(i)},${yCount(cumulativeTops[i][bandIdx])}`);
    const bottomPts = buckets
      .map((_, i) => {
        const below = bandIdx === 0 ? 0 : cumulativeTops[i][bandIdx - 1];
        return `${x(i)},${yCount(below)}`;
      })
      .reverse();
    return { tier, points: [...topPts, ...bottomPts].join(' ') };
  });

  const scoreLine = buckets.map((b, i) => `${x(i)},${yScore(b.avgScore)}`).join(' ');

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="portfolio posture over time"
    >
      {bands.map(band => (
        <polygon
          key={band.tier}
          points={band.points}
          fill={TIER_COLOR[band.tier]}
          fillOpacity={0.85}
          stroke="none"
        />
      ))}
      <polyline
        points={scoreLine}
        fill="none"
        stroke="#111827"
        strokeWidth={2}
        strokeDasharray="4 2"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test portfolioChart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/portfolioChart.tsx plugins/regis/src/components/portfolioChart.test.tsx
git commit -m "feat(regis): dependency-free stacked-area portfolio chart"
```

---

## Task 8: Portfolio Trends page

**Files:**
- Create: `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx`
- Test: `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { regisApiRef, type PortfolioTrend } from '../api/RegisApi';
import { RegisPortfolioTrendsPage } from './RegisPortfolioTrendsPage';

const trend: PortfolioTrend = {
  generatedAt: '2026-06-03T00:00:00.000Z',
  days: 2,
  buckets: [
    { date: '2026-06-02', gold: 1, silver: 1, bronze: 0, none: 0, total: 2, avgScore: 80 },
    { date: '2026-06-03', gold: 2, silver: 0, bronze: 0, none: 0, total: 2, avgScore: 95 },
  ],
};

const renderPage = (getPortfolioTrend: () => Promise<PortfolioTrend>) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            getPortfolioTrend,
            getReport: async () => { throw new Error('not used'); },
            listReports: async () => [],
            getHistory: async () => { throw new Error('not used'); },
          },
        ],
      ]}
    >
      <RegisPortfolioTrendsPage />
    </TestApiProvider>,
  );

describe('RegisPortfolioTrendsPage', () => {
  it('renders KPI cards and the chart from the latest bucket', async () => {
    await renderPage(async () => trend);
    expect(await screen.findByText('Portfolio Trends')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /portfolio posture over time/i })).toBeInTheDocument();
    // latest avg score KPI
    expect(screen.getByText('95')).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    await renderPage(async () => ({ generatedAt: 'x', days: 90, buckets: [] }));
    expect(await screen.findByText(/no portfolio history recorded yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisPortfolioTrendsPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

Create `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx`:

```tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  InfoCard,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { regisApiRef, type PortfolioTrend } from '../api/RegisApi';
import { PortfolioStackedArea } from './portfolioChart';

const WINDOW_DAYS = 90;

function delta(latest: number, first: number): string {
  const d = latest - first;
  if (d === 0) return '±0';
  return d > 0 ? `▲ ${d}` : `▼ ${Math.abs(d)}`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Grid item xs={6} sm={4} md={2}>
      <InfoCard title={label}>
        <Typography variant="h4">{value}</Typography>
        <Typography variant="caption" color="textSecondary">{sub}</Typography>
      </InfoCard>
    </Grid>
  );
}

export function RegisPortfolioTrendsPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => api.getPortfolioTrend(WINDOW_DAYS),
    [],
  );

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    const trend = value as PortfolioTrend;
    const buckets = trend?.buckets ?? [];
    if (buckets.length === 0) return <Typography>No portfolio history recorded yet.</Typography>;

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    return (
      <Grid container spacing={3}>
        <Kpi label="Gold" value={String(last.gold)} sub={`${delta(last.gold, first.gold)} over ${trend.days}d`} />
        <Kpi label="Silver" value={String(last.silver)} sub={`${delta(last.silver, first.silver)} over ${trend.days}d`} />
        <Kpi label="Bronze" value={String(last.bronze)} sub={`${delta(last.bronze, first.bronze)} over ${trend.days}d`} />
        <Kpi label="Avg score" value={String(last.avgScore)} sub={`${delta(last.avgScore, first.avgScore)} over ${trend.days}d`} />
        <Kpi label="Images" value={String(last.total)} sub={`${delta(last.total, first.total)} over ${trend.days}d`} />
        <Grid item xs={12}>
          <InfoCard title={`Posture over the last ${trend.days} days`}>
            <PortfolioStackedArea buckets={buckets} />
          </InfoCard>
        </Grid>
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Portfolio Trends" subtitle="Image posture across the portfolio over time" />
      <Content>{body()}</Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisPortfolioTrendsPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisPortfolioTrendsPage.tsx plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx
git commit -m "feat(regis): Portfolio Trends page (KPI cards + chart)"
```

---

## Task 9: Register the page + nav item

**Files:**
- Modify: `plugins/regis/src/routes.ts`
- Modify: `plugins/regis/src/plugin.tsx`

- [ ] **Step 1: Add a route ref**

In `plugins/regis/src/routes.ts`, add:

```ts
export const portfolioRouteRef = createRouteRef();
```

- [ ] **Step 2: Register the page extension (title + icon → nav item)**

In `plugins/regis/src/plugin.tsx`:

Add the icon import near the top, and **extend the existing `./routes` import** (do not add a second import line from `./routes` — the linter rejects duplicate imports):

```ts
import TimelineIcon from '@material-ui/icons/Timeline';
```

Change the existing line `import { rootRouteRef } from './routes';` to:

```ts
import { rootRouteRef, portfolioRouteRef } from './routes';
```

Add the page extension after the `catalogPage` definition:

```tsx
const portfolioTrendsPage = PageBlueprint.make({
  name: 'portfolio-trends',
  params: {
    path: '/regis-portfolio',
    title: 'Portfolio Trends',
    icon: <TimelineIcon />,
    routeRef: portfolioRouteRef,
    loader: () =>
      import('./components/RegisPortfolioTrendsPage').then(m => (
        <m.RegisPortfolioTrendsPage />
      )),
  },
});
```

Add `portfolioTrendsPage` to the `extensions: [ … ]` array of `regisPlugin` (after `catalogPage`).

- [ ] **Step 3: Build the frontend package to confirm it compiles**

Run: `yarn workspace @regis/backstage-plugin-regis test`
Expected: PASS (existing + new suites compile and pass; the new extension wiring type-checks).

- [ ] **Step 4: Commit**

```bash
git add plugins/regis/src/routes.ts plugins/regis/src/plugin.tsx
git commit -m "feat(regis): register Portfolio Trends page + nav item"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run all three package suites**

Run:
```bash
yarn workspace @regis/backstage-plugin-regis-common test
yarn workspace @regis/backstage-plugin-regis-backend test
yarn workspace @regis/backstage-plugin-regis test
```
Expected: all PASS.

- [ ] **Step 2: Lint the touched packages**

Run:
```bash
yarn workspace @regis/backstage-plugin-regis-common lint
yarn workspace @regis/backstage-plugin-regis-backend lint
yarn workspace @regis/backstage-plugin-regis lint
```
Expected: no errors. Fix any unused-import / formatting issues surfaced.

- [ ] **Step 3: Final commit (only if lint produced fixes)**

```bash
git add -A
git commit -m "chore(regis): lint fixes for portfolio trend dashboard"
```

---

## Notes for the implementer

- **`aggregateTrend` uses `new Date(...)` with an explicit ISO string** — this is normal Node/app code (deterministic because `today` is passed in), not a workflow script, so `Date` is fine.
- **The warmed cache caches `listSnapshots()`** (the expensive read), then computes the trend per request from the cached array — so `days` can vary per request without invalidating the cache. The documented scaling seam is to replace `store.listSnapshots()` + in-memory `aggregateTrend` with a SQL/rollup `getPortfolioTrend` behind the same aggregator.
- **The page appears in the sidebar** because its `PageBlueprint` sets `title` + `icon` (the app's `NavContentBlueprint` builds nav items from page extensions that expose `core.title`/`core.icon`). The existing `/regis` page omits them, which is why it has no nav entry.
- **Out of scope (separate slices):** system/owner filters (need the denormalised `owner`/`system` columns), the SQL/rollup aggregation implementation, the digest-moves view, and retention/pruning.
- **Demo:** with the backend running and the history store seeded (`historySeedUrl`), the page at `/regis-portfolio` shows the 90-day carry-forward trend; the seeded `search` decline (Gold→Silver→Bronze) shifts the stacked bands over the window.
