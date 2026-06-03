# Portfolio Trend Filters (system / owner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-select **system** and **owner** filters to the Portfolio Trends dashboard by denormalising `owner`/`system` onto report snapshots, filtering the warmed cache in-memory, and exposing snapshot-derived facets.

**Architecture:** `owner`/`system` are added to `ReportSnapshot` and to the `regis_report_snapshots` table (idempotent boot-time column migration); the recorder populates them from the index. `PortfolioTrendAggregator.trend(days, today, filters)` filters the cached array (AND across set fields) before the unchanged pure `aggregateTrend`; `facets()` returns the distinct universe. `GET /portfolio/trend` gains `system`/`owner` query params and returns `filters` + `facets`. The page adds two dropdowns populated from facets.

**Tech Stack:** Backstage backend (`coreServices`, Knex), Jest + `better-sqlite3` (`TestDatabases`), Backstage frontend (`@material-ui/core` Select), React.

**Spec:** `docs/superpowers/specs/2026-06-03-regis-backstage-portfolio-trend-filters-design.md`

**Base:** this branch is stacked on `tritri/portfolio-trend-dashboard` — the dashboard code (`PortfolioTrendAggregator`, `/portfolio/trend`, `RegisPortfolioTrendsPage`, `aggregateTrend`) is already present.

---

## File structure

**`plugins/regis-common/`:**
- `src/report-api.ts` — `ReportSnapshot` gains `owner?`/`system?`; `PortfolioTrend` gains `filters`/`facets`.

**`plugins/regis-backend/`:**
- `src/service/RegisHistoryRecorder.ts` — `toSnapshots` maps `owner`/`system`.
- `src/service/KnexReportHistoryStore.ts` — `owner`/`system` columns + idempotent migration + read mapping.
- `src/service/PortfolioTrendAggregator.ts` — `trend(days, today, filters?)` + `facets()`.
- `src/router.ts` — `system`/`owner` query params; response `filters` + `facets`.

**`plugins/regis/`:**
- `src/api/RegisApi.ts` + `src/api/RegisClient.ts` — `getPortfolioTrend(days, filters?)`.
- `src/components/RegisPortfolioTrendsPage.tsx` — filter dropdowns + state + filtered empty state.

**`examples/`:**
- `regis-dataset.cjs` — `buildHistory` adds `owner`/`system`; regenerate `regis-history.json`.

**Conventions:** fresh worktree — Task 0 installs deps. Test: `yarn workspace <pkg> test <file>` (fallback `cd plugins/<pkg> && CI=true ../../node_modules/.bin/backstage-cli package test <file>`). `<pkg>` ∈ `@regis/backstage-plugin-regis-common`, `@regis/backstage-plugin-regis-backend`, `@regis/backstage-plugin-regis`. Commit after each task.

---

## Task 0: Install dependencies (prerequisite)

- [ ] **Step 1: Install** — Run: `yarn install` — Expected: completes; `node_modules/` exists.
- [ ] **Step 2: Toolchain check** — Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/service/aggregateTrend.test.ts` — Expected: PASS (confirms runner works on the inherited dashboard code).

---

## Task 1: Contract — snapshot owner/system + trend filters/facets

**Files:** Modify `plugins/regis-common/src/report-api.ts`; Test `plugins/regis-common/src/report-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-common/src/report-api.test.ts`:

```ts
import type { ReportSnapshot, PortfolioTrend } from './report-api';

describe('filter contract', () => {
  it('snapshot carries owner/system and trend carries filters/facets', () => {
    const snap: ReportSnapshot = {
      imageRef: 'r/n:1',
      snapshotDate: '2026-06-03',
      recordedAt: '2026-06-03T00:00:00.000Z',
      owner: 'group:default/team-x',
      system: 'shop',
    };
    const trend: PortfolioTrend = {
      generatedAt: '2026-06-03T00:00:00.000Z',
      days: 90,
      filters: { system: 'shop' },
      facets: { systems: ['shop'], owners: ['group:default/team-x'] },
      buckets: [],
    };
    expect(snap.system).toBe('shop');
    expect(trend.facets.systems).toEqual(['shop']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-api`
Expected: FAIL — `owner`/`system` not on `ReportSnapshot`, `filters`/`facets` not on `PortfolioTrend`.

- [ ] **Step 3: Extend the types**

In `plugins/regis-common/src/report-api.ts`, add to `interface ReportSnapshot` (after `playbook?`):

```ts
  owner?: string;
  system?: string;
```

And extend `interface PortfolioTrend` to:

```ts
export interface PortfolioTrend {
  generatedAt: string; // ISO datetime
  days: number;
  filters: { system?: string; owner?: string };
  facets: { systems: string[]; owners: string[] };
  buckets: TrendBucket[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test report-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-common/src/report-api.ts plugins/regis-common/src/report-api.test.ts
git commit -m "feat(regis-common): snapshot owner/system + trend filters/facets"
```

---

## Task 2: Recorder maps owner/system

**Files:** Modify `plugins/regis-backend/src/service/RegisHistoryRecorder.ts`; Test `plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts` (inside the existing `describe('toSnapshots', …)`):

```ts
  it('maps owner and system from the index entry', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [
        {
          imageRef: 'r/n:1',
          reportUrl: 'https://x/r.json',
          owner: 'group:default/team-x',
          system: 'shop',
        },
      ],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s.owner).toBe('group:default/team-x');
    expect(s.system).toBe('shop');
  });
```

(Reuses the existing `RUN` constant and `ReportIndex` import in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test RegisHistoryRecorder`
Expected: FAIL — `s.owner`/`s.system` undefined.

- [ ] **Step 3: Map the fields**

In `plugins/regis-backend/src/service/RegisHistoryRecorder.ts`, inside the `toSnapshots` map callback, add after `playbook: e.playbook,`:

```ts
    owner: e.owner,
    system: e.system,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test RegisHistoryRecorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/RegisHistoryRecorder.ts plugins/regis-backend/src/service/RegisHistoryRecorder.test.ts
git commit -m "feat(regis-backend): recorder denormalises owner/system onto snapshots"
```

---

## Task 3: Store columns + idempotent migration

**Files:** Modify `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`; Test `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts` (inside the existing `describe`, reusing `databases`/`snap`):

```ts
  it('round-trips owner and system', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);
    await store.append([
      snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', owner: 'group:default/team-x', system: 'shop' }),
    ]);
    const [row] = await store.listSnapshots();
    expect(row.owner).toBe('group:default/team-x');
    expect(row.system).toBe('shop');
  }, 60_000);

  it('adds owner/system columns to a pre-existing table without them', async () => {
    const knex = await databases.init('SQLITE_3');
    // Simulate the merged #8 schema (no owner/system columns).
    await knex.schema.createTable('regis_report_snapshots', t => {
      t.text('image_ref').notNullable();
      t.text('snapshot_date').notNullable();
      t.text('digest').nullable();
      t.text('tier').nullable();
      t.integer('score').nullable();
      t.text('playbook').nullable();
      t.text('report_url').nullable();
      t.text('recorded_at').notNullable();
      t.primary(['image_ref', 'snapshot_date']);
    });
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'owner')).toBe(false);

    const store = await KnexReportHistoryStore.create(knex); // should migrate
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'owner')).toBe(true);
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'system')).toBe(true);

    await store.append([snap({ imageRef: 'a:1', system: 'shop' })]);
    expect((await store.listSnapshots())[0].system).toBe('shop');

    // idempotent: a second create is a no-op
    await KnexReportHistoryStore.create(knex);
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'system')).toBe(true);
  }, 60_000);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test KnexReportHistoryStore`
Expected: FAIL — columns missing / not migrated.

- [ ] **Step 3: Add columns, migration, and read mapping**

In `plugins/regis-backend/src/service/KnexReportHistoryStore.ts`:

Extend the `Row` interface with:

```ts
  owner: string | null;
  system: string | null;
```

In `create`, add the two columns to the `createTable` block (after `report_url`):

```ts
        t.text('owner').nullable();
        t.text('system').nullable();
```

And, **after** the create/catch block and **before** `return new KnexReportHistoryStore(db);`, add the idempotent column migration:

```ts
    for (const col of ['owner', 'system'] as const) {
      if (!(await db.schema.hasColumn(TABLE, col))) {
        await db.schema.alterTable(TABLE, t => t.text(col).nullable());
      }
    }
```

In `append`, add to the row object (after `playbook`):

```ts
      owner: s.owner ?? null,
      system: s.system ?? null,
```

In **both** `getByImageRef` and `listSnapshots` row mappers, add (after `playbook`):

```ts
      owner: r.owner ?? undefined,
      system: r.system ?? undefined,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test KnexReportHistoryStore`
Expected: PASS (both new cases + existing).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/KnexReportHistoryStore.ts plugins/regis-backend/src/service/KnexReportHistoryStore.test.ts
git commit -m "feat(regis-backend): owner/system columns + idempotent migration"
```

---

## Task 4: Aggregator filtering + facets

**Files:** Modify `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`; Test `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`:

```ts
  it('filters by system/owner and exposes sorted facets', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 100, owner: 'group:default/team-x', system: 'shop', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'b:1', snapshotDate: '2026-05-01', tier: 'Bronze', score: 60, owner: 'group:default/team-y', system: 'billing', recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const agg = new PortfolioTrendAggregator({ store, logger: mockServices.logger.mock() });
    await agg.refresh();

    expect(agg.facets()).toEqual({
      systems: ['billing', 'shop'],
      owners: ['group:default/team-x', 'group:default/team-y'],
    });

    const shopOnly = agg.trend(1, '2026-06-03', { system: 'shop' });
    expect(shopOnly[0]).toMatchObject({ gold: 1, bronze: 0, total: 1 });

    const both = agg.trend(1, '2026-06-03', { system: 'shop', owner: 'group:default/team-y' });
    expect(both[0].total).toBe(0); // shop AND team-y matches nothing

    const all = agg.trend(1, '2026-06-03');
    expect(all[0].total).toBe(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test PortfolioTrendAggregator`
Expected: FAIL — `trend` takes no filters / `facets` undefined.

- [ ] **Step 3: Implement filtering + facets**

In `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`, replace the `trend` method and add `facets`:

```ts
  /** Compute the trend for the cached snapshots, optionally filtered (AND across set fields). */
  trend(
    days: number,
    today: string,
    filters: { system?: string; owner?: string } = {},
  ): TrendBucket[] {
    const filtered = this.snapshots.filter(
      s =>
        (filters.system === undefined || s.system === filters.system) &&
        (filters.owner === undefined || s.owner === filters.owner),
    );
    return aggregateTrend(filtered, { days, today });
  }

  /** Distinct, sorted, non-empty system/owner values across the full cached set. */
  facets(): { systems: string[]; owners: string[] } {
    const systems = new Set<string>();
    const owners = new Set<string>();
    for (const s of this.snapshots) {
      if (s.system) systems.add(s.system);
      if (s.owner) owners.add(s.owner);
    }
    return {
      systems: [...systems].sort(),
      owners: [...owners].sort(),
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test PortfolioTrendAggregator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/PortfolioTrendAggregator.ts plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts
git commit -m "feat(regis-backend): aggregator system/owner filtering + facets"
```

---

## Task 5: Endpoint query params + response shape

**Files:** Modify `plugins/regis-backend/src/router.ts`; Test `plugins/regis-backend/src/router.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `plugins/regis-backend/src/router.test.ts` (inside the existing describe):

```ts
  it('GET /portfolio/trend returns filters echo and facets', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=7&system=shop')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.filters).toEqual({ system: 'shop' });
    expect(res.body.facets).toEqual({ systems: [], owners: [] }); // empty store
    expect(res.body.buckets).toHaveLength(7);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: FAIL — `filters`/`facets` absent from the response.

- [ ] **Step 3: Read params + extend the response**

In `plugins/regis-backend/src/router.ts`, replace the `/portfolio/trend` handler body with:

```ts
  router.get('/portfolio/trend', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    const system =
      typeof req.query.system === 'string' && req.query.system ? req.query.system : undefined;
    const owner =
      typeof req.query.owner === 'string' && req.query.owner ? req.query.owner : undefined;
    const filters: { system?: string; owner?: string } = {};
    if (system) filters.system = system;
    if (owner) filters.owner = owner;
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    const body: PortfolioTrend = {
      // The true freshness of the served buckets (from the cache), not request time.
      generatedAt: portfolioTrend.lastRefreshIso(),
      days,
      filters,
      facets: portfolioTrend.facets(),
      buckets: portfolioTrend.trend(days, today, filters),
    };
    res.json(body);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test router`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/router.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat(regis-backend): /portfolio/trend system/owner params + facets"
```

---

## Task 6: Frontend client — filters in the query

**Files:** Modify `plugins/regis/src/api/RegisApi.ts`, `plugins/regis/src/api/RegisClient.ts`; Test `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis/src/api/RegisClient.test.ts`:

```ts
  it('GETs /portfolio/trend with system/owner filters when provided', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: 'x', days: 90, filters: {}, facets: { systems: [], owners: [] }, buckets: [] }),
    });
    const client = clientWith(fetchImpl);
    await client.getPortfolioTrend(90, { system: 'shop', owner: 'group:default/team-x' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/portfolio/trend?days=90&system=shop&owner=group%3Adefault%2Fteam-x',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: FAIL — `getPortfolioTrend` ignores filters / signature mismatch.

- [ ] **Step 3: Extend the API + client**

In `plugins/regis/src/api/RegisApi.ts`, change the interface method to:

```ts
  getPortfolioTrend(
    days: number,
    filters?: { system?: string; owner?: string },
  ): Promise<PortfolioTrend>;
```

In `plugins/regis/src/api/RegisClient.ts`, replace `getPortfolioTrend` with:

```ts
  async getPortfolioTrend(
    days: number,
    filters: { system?: string; owner?: string } = {},
  ): Promise<PortfolioTrend> {
    const params = new URLSearchParams({ days: String(days) });
    if (filters.system) params.set('system', filters.system);
    if (filters.owner) params.set('owner', filters.owner);
    return this.getJson<PortfolioTrend>(`/portfolio/trend?${params.toString()}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisClient`
Expected: PASS (the existing `getPortfolioTrend(90)` test still passes — `URLSearchParams` yields `?days=90`).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(regis): client passes system/owner filters"
```

---

## Task 7: Page filter dropdowns

**Files:** Modify `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx`, `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`. First extend the fixture `trend` to include facets (change its object to include `filters: {}, facets: { systems: ['shop', 'billing'], owners: ['group:default/team-x'] }`). Then add:

```ts
  it('populates the System dropdown from facets and refetches on change', async () => {
    const getPortfolioTrend = jest.fn().mockResolvedValue(trend);
    await renderPage(getPortfolioTrend);
    // initial call: no filters
    expect(getPortfolioTrend).toHaveBeenCalledWith(90, { system: undefined, owner: undefined });
    // open the System select and pick "shop"
    const systemSelect = await screen.findByLabelText('System');
    fireEvent.mouseDown(systemSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'shop' }));
    // refetch with the filter
    expect(getPortfolioTrend).toHaveBeenCalledWith(90, { system: 'shop', owner: undefined });
  });

  it('shows a filtered empty state', async () => {
    await renderPage(async () => ({
      generatedAt: 'x', days: 90, filters: { system: 'shop' },
      facets: { systems: ['shop'], owners: [] }, buckets: [],
    }));
    expect(await screen.findByText(/no history for this filter/i)).toBeInTheDocument();
  });
```

Add `fireEvent` to the existing testing-library import: `import { fireEvent, screen } from '@testing-library/react';`. Update the `renderPage` mock object so the `getPortfolioTrend` it injects is the passed `jest.fn` (it already is). Ensure the page-test's `regisApiRef` mock keeps `getReport`/`listReports`/`getHistory` stubs.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisPortfolioTrendsPage`
Expected: FAIL — no System dropdown; filtered empty text absent; initial call signature differs.

- [ ] **Step 3: Implement the dropdowns + filter state**

Replace `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx` with:

```tsx
import { useState } from 'react';
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
import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import { regisApiRef } from '../api/RegisApi';
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

function FacetSelect(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const labelId = `regis-facet-${props.label.toLowerCase()}`;
  return (
    <FormControl fullWidth>
      <InputLabel id={labelId}>{props.label}</InputLabel>
      <Select
        labelId={labelId}
        value={props.value}
        onChange={e => props.onChange(e.target.value as string)}
      >
        <MenuItem value="">All</MenuItem>
        {props.options.map(o => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export function RegisPortfolioTrendsPage() {
  const api = useApi(regisApiRef);
  const [system, setSystem] = useState('');
  const [owner, setOwner] = useState('');
  const { value, loading, error } = useAsync(
    () =>
      api.getPortfolioTrend(WINDOW_DAYS, {
        system: system || undefined,
        owner: owner || undefined,
      }),
    [system, owner],
  );

  const facets = value?.facets ?? { systems: [], owners: [] };
  const filtered = Boolean(system || owner);

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    const buckets = value?.buckets ?? [];
    if (buckets.length === 0) {
      return (
        <Typography>
          {filtered
            ? 'No history for this filter.'
            : 'No portfolio history recorded yet.'}
        </Typography>
      );
    }

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const daysLabel = value?.days !== undefined ? `${value.days}d` : '';
    return (
      <Grid container spacing={3}>
        <Kpi label="Gold" value={String(last.gold)} sub={`${delta(last.gold, first.gold)} over ${daysLabel}`} />
        <Kpi label="Silver" value={String(last.silver)} sub={`${delta(last.silver, first.silver)} over ${daysLabel}`} />
        <Kpi label="Bronze" value={String(last.bronze)} sub={`${delta(last.bronze, first.bronze)} over ${daysLabel}`} />
        <Kpi label="Avg score" value={String(last.avgScore)} sub={`${delta(last.avgScore, first.avgScore)} over ${daysLabel}`} />
        <Kpi label="Images" value={String(last.total)} sub={`${delta(last.total, first.total)} over ${daysLabel}`} />
        <Grid item xs={12}>
          <InfoCard title={`Posture over the last ${daysLabel}`}>
            <PortfolioStackedArea buckets={buckets} />
          </InfoCard>
        </Grid>
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Portfolio Trends" subtitle="Image posture across the portfolio over time" />
      <Content>
        <Grid container spacing={2} style={{ marginBottom: 16 }}>
          <Grid item xs={6} sm={3}>
            <FacetSelect label="System" value={system} options={facets.systems} onChange={setSystem} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <FacetSelect label="Owner" value={owner} options={facets.owners} onChange={setOwner} />
          </Grid>
        </Grid>
        {body()}
      </Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis test RegisPortfolioTrendsPage`
Expected: PASS. (If the MUI `Select` label query needs an adjustment — e.g. `getByLabelText` not matching — open the select via its `role="button"` found by the label text and select the option by `role="option"`; adapt minimally.)

- [ ] **Step 5: Run the full frontend suite**

Run: `yarn workspace @regis/backstage-plugin-regis test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/components/RegisPortfolioTrendsPage.tsx plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx
git commit -m "feat(regis): system/owner filter dropdowns on the portfolio page"
```

---

## Task 8: Example data — owner/system in history seed

**Files:** Modify `examples/regis-dataset.cjs`; Generate `examples/regis-history.json`

- [ ] **Step 1: Add owner/system to generated snapshots**

In `examples/regis-dataset.cjs`, inside `buildHistory`'s `snapshots.push({ … })`, add (after `playbook: img.playbook,`), matching the form `buildIndex` uses:

```js
        owner: `group:default/${img.owner}`,
        system: img.system,
```

- [ ] **Step 2: Regenerate the dataset**

Run: `node examples/regis-dataset.cjs`
Expected: stdout reports files written; `examples/regis-history.json` updated.

- [ ] **Step 3: Sanity-check**

Run: `node -e "const h=require('./examples/regis-history.json'); const s=[...new Set(h.map(x=>x.system))]; const o=[...new Set(h.map(x=>x.owner))]; console.log('systems', s); console.log('owners', o);"`
Expected: prints the distinct systems (e.g. `[ 'shop' ]`) and owners (`group:default/team-...`), confirming every snapshot now carries them.

- [ ] **Step 4: Commit**

```bash
git add examples/regis-dataset.cjs examples/regis-history.json
git commit -m "docs(examples): owner/system on history snapshots for filter demo"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run all three suites**

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
Expected: no errors. (`@material-ui/core` is already a declared dependency of `plugins/regis`; the Select/FormControl/etc. imports need no new dependency.)

- [ ] **Step 3: Final commit (only if lint produced fixes)**

```bash
git add -A
git commit -m "chore(regis): lint fixes for portfolio trend filters"
```

---

## Notes for the implementer

- **`aggregateTrend` is unchanged** — filtering happens before it, in `PortfolioTrendAggregator.trend`. Don't touch the pure function.
- **In-memory store needs no read change** for owner/system: it spreads the stored `ReportSnapshot` (`{ ...s, tier: … }`), so the new fields round-trip automatically once they're on the type. Only the Knex store maps columns explicitly.
- **Migration runs on boot** via `KnexReportHistoryStore.create` (called in `plugin.ts` each init) — the `hasColumn`/`alterTable` loop adds the columns to the production table merged in #8, then is a no-op.
- **Facets are always the full universe** (not narrowed by the current filter), so the dropdowns let you switch freely.
- **Out of scope (later slices):** multi-select, SQL/rollup aggregation, catalog-derived facets, humanised owner labels, a `days` range picker.
