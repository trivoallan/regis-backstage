# Portfolio explorer drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a master-detail explorer the app home (`/`): a persistent facet rail scopes a portfolio trend, a switchable group-by breaks it down, an image list drills in, and a quick-look previews an image and links to its entity page.

**Architecture:** A new `GET /portfolio/explore` endpoint reuses the in-memory snapshot cache in `PortfolioTrendAggregator` to return, in one call, the scoped trend + per-group aggregates + scoped image list + scoped facets. The frontend `RegisExplorerPage` reads all state from the URL, calls `explore()` + `getPlaybooks()`, and composes focused components (`FacetRail`, `Breakdown`, `ImageList`, `QuickLookPanel`) built from Backstage/MUI components per the DLS. Tier colors reuse the existing `unionLadder`/`tierColor`.

**Tech Stack:** TypeScript, Backstage 1.51 (new frontend + backend systems), Jest + @testing-library/react + @backstage/frontend-test-utils, Material UI v4, react-router-dom `useSearchParams`.

**Conventions:** Colocated TDD (failing test first). Run one package's tests with `node_modules/.bin/backstage-cli repo test --watch=false <path>`. `node_modules/.bin/tsc` typechecks the repo. `node_modules/.bin/backstage-cli repo lint --since origin/main` lints. `yarn`/backstage-cli is not on PATH — always use `node_modules/.bin/...`. Frontend UI follows the [Backstage component design guidelines](https://backstage.io/docs/dls/component-design-guidelines/): reuse Backstage core components then MUI; layout via MUI primitives + `theme.spacing()`; theme palette for chrome (tier colors are data from the ladder, the one allowed inline color); `Typography` for text; interactive drill targets are real buttons/links.

**Dependency order:** common types → backend explore + router → frontend extractions (Sparkline, KpiStrip) + client → explorer components → wiring/migration → verification.

---

## File structure

**Create:**
- `plugins/regis/src/components/Sparkline.tsx` (+ `.test.tsx`) — extracted SVG sparkline.
- `plugins/regis/src/components/KpiStrip.tsx` (+ `.test.tsx`) — extracted KPI strip (one card per band + avg + total).
- `plugins/regis/src/components/FacetRail.tsx` (+ `.test.tsx`) — group-by + filter chips + add-facet.
- `plugins/regis/src/components/Breakdown.tsx` (+ `.test.tsx`) — per-group rows with tier-mix bar.
- `plugins/regis/src/components/ImageList.tsx` (+ `.test.tsx`) — scoped image table.
- `plugins/regis/src/components/QuickLookPanel.tsx` (+ `.test.tsx`) — image quick-look drawer.
- `plugins/regis/src/components/RegisExplorerPage.tsx` (+ `.test.tsx`) — orchestration + URL state.

**Modify:**
- `plugins/regis-common/src/report-api.ts` + `index.ts` — `ExploreResponse` + helpers.
- `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts` (+ `.test.ts`) — `explore()`.
- `plugins/regis-backend/src/router.ts` (+ `router.test.ts`) — `GET /portfolio/explore`.
- `plugins/regis/src/api/RegisApi.ts`, `RegisClient.ts` (+ `RegisClient.test.ts`) — `explore()`.
- `plugins/regis/src/components/RegisTrajectoryCard.tsx` — use the extracted `Sparkline`.
- `plugins/regis/src/plugin.tsx`, `routes.ts` — mount explorer at `/`, retire/redirect old pages, nav.
- `packages/app/src/modules/nav/Sidebar.tsx` — primary nav entry (if the sidebar hardcodes Regis links).

**Delete (in the migration task):**
- `plugins/regis/src/components/RegisCatalogPage.tsx` + `.test.tsx`, `RegisPortfolioTrendsPage.tsx` + `.test.tsx` (logic absorbed by the explorer; KpiStrip/ImageList carry forward their reusable parts).

---

## Task 1: Explore response types (regis-common)

**Files:**
- Modify: `plugins/regis-common/src/report-api.ts`
- Modify: `plugins/regis-common/src/index.ts`

- [ ] **Step 1: Add the types**

Append to `plugins/regis-common/src/report-api.ts` (after `PlaybooksResponse`):

```ts
/** Group-by dimension for the explorer. */
export type ExploreGroupBy = 'system' | 'owner' | 'playbook' | 'tier';

/** One aggregated group in the explorer breakdown. */
export interface ExploreGroup {
  key: string;
  count: number;
  avgScore: number;
  /** Tier name → image count, for the mix bar. */
  tiers: Record<string, number>;
}

/** One image row (latest snapshot) in the scoped explorer list. */
export interface ExploreImage {
  imageRef: string;
  tier?: string | null;
  score?: number;
  system?: string;
  owner?: string;
  playbook?: string;
  digest?: string;
}

/** Response of `GET /portfolio/explore`. */
export interface ExploreResponse {
  filters: { system?: string; owner?: string; playbook?: string; tier?: string };
  groupBy: ExploreGroupBy;
  trend: { bands: TrendBand[]; buckets: TrendBucket[] };
  groups: ExploreGroup[];
  images: ExploreImage[];
  facets: { systems: string[]; owners: string[]; playbooks: string[]; tiers: string[] };
}
```

- [ ] **Step 2: Export from the barrel**

In `plugins/regis-common/src/index.ts`, extend the `export type { ... } from './report-api';` block to add the new names:

```ts
export type {
  ReportEnvelope,
  ReportSummary,
  ReportSnapshot,
  ReportHistory,
  TrendBand,
  TrendBucket,
  PortfolioTrend,
  PlaybookLadder,
  PlaybooksResponse,
  ExploreGroupBy,
  ExploreGroup,
  ExploreImage,
  ExploreResponse,
} from './report-api';
```

- [ ] **Step 3: Verify it typechecks**

Run: `node_modules/.bin/tsc`
Expected: PASS (pure additive types).

- [ ] **Step 4: Commit**

```bash
git add plugins/regis-common/src/report-api.ts plugins/regis-common/src/index.ts
git commit -m "feat(common): explore response types"
```

---

## Task 2: aggregator.explore() (regis-backend)

**Files:**
- Modify: `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`
- Test: `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts` a new describe block. (Reuse the existing `snap` and `makeAggregator` helpers in that file; they build an aggregator over a stub store with `listSnapshots`.)

```ts
describe('PortfolioTrendAggregator.explore', () => {
  const snaps = [
    snap({ imageRef: 'a', snapshotDate: '2026-05-01', system: 'shop', owner: 'o1', playbook: 'default', tier: 'Gold', score: 100 }),
    snap({ imageRef: 'a', snapshotDate: '2026-06-01', system: 'shop', owner: 'o1', playbook: 'default', tier: 'Silver', score: 80 }), // latest for a
    snap({ imageRef: 'b', snapshotDate: '2026-06-01', system: 'shop', owner: 'o2', playbook: 'default', tier: 'Silver', score: 70 }),
    snap({ imageRef: 'c', snapshotDate: '2026-06-01', system: 'bank', owner: 'o2', playbook: 'pci-dss', tier: 'Certified', score: 78 }),
  ];

  it('uses the latest snapshot per image and groups the scoped set', async () => {
    const agg = makeAggregator(snaps);
    await agg.ensureFresh(1);
    const out = agg.explore({ days: 1, today: '2026-06-03', filters: { system: 'shop' }, groupBy: 'owner' });
    // image a's latest (Silver/80) wins over its earlier Gold/100; c excluded (bank)
    expect(out.images.map(i => [i.imageRef, i.tier]).sort()).toEqual([['a', 'Silver'], ['b', 'Silver']]);
    expect(out.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'o1', count: 1, avgScore: 80, tiers: { Silver: 1 } }),
        expect.objectContaining({ key: 'o2', count: 1, avgScore: 70, tiers: { Silver: 1 } }),
      ]),
    );
  });

  it('scopes facets to the current filter set', async () => {
    const agg = makeAggregator(snaps);
    await agg.ensureFresh(1);
    const out = agg.explore({ days: 1, today: '2026-06-03', filters: { system: 'shop' }, groupBy: 'owner' });
    expect(out.facets.systems).toEqual(['shop']);
    expect(out.facets.owners).toEqual(['o1', 'o2']);
    expect(out.facets.tiers).toEqual(['Silver']);
  });

  it('tier filters images/groups but not the trend; trend is the scoped TrendResult', async () => {
    const agg = makeAggregator(snaps);
    await agg.ensureFresh(1);
    const out = agg.explore({ days: 1, today: '2026-06-03', filters: { system: 'shop', tier: 'Silver' }, groupBy: 'tier' });
    expect(out.images).toHaveLength(2); // both shop images are Silver at latest
    expect(out.groups).toEqual([expect.objectContaining({ key: 'Silver', count: 2 })]);
    expect(out.trend.buckets).toHaveLength(1); // a TrendResult shape, days=1
    expect(Array.isArray(out.trend.bands)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`
Expected: FAIL — `explore` is not a function.

- [ ] **Step 3: Implement `explore`**

In `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`, update the common-type import to add the explore types:

```ts
import type {
  ExploreGroup,
  ExploreGroupBy,
  ExploreImage,
  IndexPlaybookEntry,
  PlaybookLadder,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';
```

Add this method to the class (after `playbookLadders()`):

```ts
  /** Latest snapshot per image (max snapshotDate wins). */
  private latestByImage(): ReportSnapshot[] {
    const latest = new Map<string, ReportSnapshot>();
    for (const s of this.snapshots) {
      const prev = latest.get(s.imageRef);
      if (!prev || s.snapshotDate > prev.snapshotDate) latest.set(s.imageRef, s);
    }
    return [...latest.values()];
  }

  /**
   * One-call data for an explorer level: scoped trend + per-group aggregates +
   * scoped image list + scoped facets. `tier` filters images/groups only — a
   * "filtered by current tier" time series is not meaningful — so the trend uses
   * system/owner/playbook only.
   */
  explore(opts: {
    days: number;
    today: string;
    filters: { system?: string; owner?: string; playbook?: string; tier?: string };
    groupBy: ExploreGroupBy;
  }): {
    trend: TrendResult;
    groups: ExploreGroup[];
    images: ExploreImage[];
    facets: { systems: string[]; owners: string[]; playbooks: string[]; tiers: string[] };
  } {
    const { days, today, filters, groupBy } = opts;
    const inScope = (s: ReportSnapshot): boolean =>
      (filters.system === undefined || s.system === filters.system) &&
      (filters.owner === undefined || s.owner === filters.owner) &&
      (filters.playbook === undefined || s.playbook === filters.playbook) &&
      (filters.tier === undefined || (s.tier ?? undefined) === filters.tier);

    const scoped = this.latestByImage().filter(inScope);

    const images: ExploreImage[] = scoped.map(s => ({
      imageRef: s.imageRef,
      tier: s.tier,
      score: s.score,
      system: s.system,
      owner: s.owner,
      playbook: s.playbook,
      digest: s.digest,
    }));

    const groupValue = (s: ReportSnapshot): string => {
      const v =
        groupBy === 'system' ? s.system
          : groupBy === 'owner' ? s.owner
            : groupBy === 'playbook' ? s.playbook
              : s.tier ?? undefined;
      return v ?? 'unknown';
    };
    const byGroup = new Map<string, ReportSnapshot[]>();
    for (const s of scoped) {
      const k = groupValue(s);
      const arr = byGroup.get(k);
      if (arr) arr.push(s);
      else byGroup.set(k, [s]);
    }
    const groups: ExploreGroup[] = [...byGroup.entries()]
      .map(([key, rows]) => {
        const scored = rows.filter(r => typeof r.score === 'number');
        const tiers: Record<string, number> = {};
        for (const r of rows) {
          const t = r.tier ?? 'untiered';
          tiers[t] = (tiers[t] ?? 0) + 1;
        }
        return {
          key,
          count: rows.length,
          avgScore: scored.length
            ? Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length)
            : 0,
          tiers,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    const distinct = (vals: Array<string | undefined | null>): string[] =>
      [...new Set(vals.filter((v): v is string => !!v))].sort();
    const facets = {
      systems: distinct(scoped.map(s => s.system)),
      owners: distinct(scoped.map(s => s.owner)),
      playbooks: distinct(scoped.map(s => s.playbook)),
      tiers: distinct(scoped.map(s => s.tier ?? undefined)),
    };

    const trend = this.trend(days, today, {
      system: filters.system,
      owner: filters.owner,
      playbook: filters.playbook,
    });

    return { trend, groups, images, facets };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/PortfolioTrendAggregator.ts plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts
git commit -m "feat(backend): aggregator.explore — scoped trend + groups + images + facets"
```

---

## Task 3: Router `GET /portfolio/explore`

**Files:**
- Modify: `plugins/regis-backend/src/router.ts`
- Test: `plugins/regis-backend/src/router.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/regis-backend/src/router.test.ts` (matching the existing `startTestBackend` + supertest style already used by the `/playbooks` tests):

```ts
  it('GET /portfolio/explore returns the explorer payload with the requested groupBy', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/explore?groupBy=owner&system=shop')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('owner');
    expect(res.body.filters).toEqual({ system: 'shop' });
    expect(res.body).toHaveProperty('groups');
    expect(res.body).toHaveProperty('images');
    expect(res.body).toHaveProperty('facets');
    expect(res.body.trend).toHaveProperty('bands');
  });

  it('defaults groupBy to system when missing/invalid', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/explore?groupBy=bogus')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('system');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/router.test.ts`
Expected: FAIL — `/portfolio/explore` 404s.

- [ ] **Step 3: Implement the route**

In `plugins/regis-backend/src/router.ts`, add `ExploreResponse` and `ExploreGroupBy` to the common import:

```ts
import {
  ExploreResponse,
  ExploreGroupBy,
  PlaybooksResponse,
  PortfolioTrend,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
} from '@regis/backstage-plugin-regis-common';
```

Add the route right after the `/playbooks` handler:

```ts
  router.get('/portfolio/explore', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const filters: { system?: string; owner?: string; playbook?: string; tier?: string } = {};
    const system = str(req.query.system);
    const owner = str(req.query.owner);
    const playbook = str(req.query.playbook);
    const tier = str(req.query.tier);
    if (system) filters.system = system;
    if (owner) filters.owner = owner;
    if (playbook) filters.playbook = playbook;
    if (tier) filters.tier = tier;
    const allowed: ExploreGroupBy[] = ['system', 'owner', 'playbook', 'tier'];
    const gb = str(req.query.groupBy) as ExploreGroupBy | undefined;
    const groupBy: ExploreGroupBy = gb && allowed.includes(gb) ? gb : 'system';
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    const { trend, groups, images, facets } = portfolioTrend.explore({
      days, today, filters, groupBy,
    });
    const body: ExploreResponse = { filters, groupBy, trend, groups, images, facets };
    res.json(body);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/router.test.ts`
Then the whole backend: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/router.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat(backend): GET /portfolio/explore route"
```

---

## Task 4: Extract Sparkline

**Files:**
- Create: `plugins/regis/src/components/Sparkline.tsx`
- Test: `plugins/regis/src/components/Sparkline.test.tsx`
- Modify: `plugins/regis/src/components/RegisTrajectoryCard.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/Sparkline.test.tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];
const history: ReportHistory = {
  imageRef: 'r/n:1',
  snapshots: [
    { imageRef: 'r/n:1', snapshotDate: '2026-05-01', score: 70, tier: 'Gold', recordedAt: '2026-05-01T00:00:00.000Z' },
    { imageRef: 'r/n:1', snapshotDate: '2026-06-01', score: 100, tier: 'Gold', recordedAt: '2026-06-01T00:00:00.000Z' },
  ],
};

describe('Sparkline', () => {
  it('plots a dot per scored snapshot, colored by the ladder', () => {
    render(<Sparkline history={history} ladder={ladder} />);
    const svg = screen.getByRole('img', { name: /score trajectory/i });
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    const fills = Array.from(svg.querySelectorAll('circle')).map(c => c.getAttribute('fill'));
    expect(fills).toContain('#d4af37');
  });

  it('shows a message when there are fewer than two scored points', () => {
    render(<Sparkline history={{ imageRef: 'x', snapshots: [] }} ladder={ladder} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/Sparkline.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create Sparkline (moved verbatim from RegisTrajectoryCard, ladder-driven)**

```tsx
// plugins/regis/src/components/Sparkline.tsx
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

/** Dependency-free SVG sparkline of score over time, dots colored by tier. */
export function Sparkline({
  history,
  ladder,
}: {
  history: ReportHistory;
  ladder: TrendBand[];
}) {
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
        <circle key={s.snapshotDate} cx={x(i)} cy={y(s.score)} r={3} fill={tierColor(s.tier, ladder)}>
          <title>{`${s.snapshotDate}: ${s.score} (${s.tier ?? 'none'})`}</title>
        </circle>
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Point RegisTrajectoryCard at the extracted Sparkline**

In `plugins/regis/src/components/RegisTrajectoryCard.tsx`, delete the local `function Sparkline(...) { ... }` definition, and replace the `import { tierColor, unionLadder } from './format';` line plus add the Sparkline import. The file's imports should become:

```ts
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportHistory } from '../api/RegisApi';
import { unionLadder } from './format';
import { Sparkline } from './Sparkline';
```

(`tierColor` is no longer used directly in this file — it lives in `Sparkline`. Keep `TrendBand`/`ReportHistory` imports only if still referenced; if `TrendBand` becomes unused after deleting the local Sparkline signature, remove it to satisfy lint.) The JSX usage `<Sparkline history={history} ladder={ladder} />` stays unchanged.

- [ ] **Step 5: Run tests to verify both pass**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/Sparkline.test.tsx plugins/regis/src/components/RegisTrajectoryCard.test.tsx`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/components/Sparkline.tsx plugins/regis/src/components/Sparkline.test.tsx plugins/regis/src/components/RegisTrajectoryCard.tsx
git commit -m "refactor(frontend): extract Sparkline from RegisTrajectoryCard"
```

---

## Task 5: KpiStrip

**Files:**
- Create: `plugins/regis/src/components/KpiStrip.tsx`
- Test: `plugins/regis/src/components/KpiStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/KpiStrip.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { KpiStrip } from './KpiStrip';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

const bands: TrendBand[] = [
  { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
  { key: 'none', label: 'Untiered', color: '#e5e7eb' },
];
const buckets: TrendBucket[] = [
  { date: '2026-06-01', counts: { rank1: 1, none: 0 }, total: 1, avgScore: 90 },
  { date: '2026-06-02', counts: { rank1: 2, none: 0 }, total: 2, avgScore: 92 },
];

describe('KpiStrip', () => {
  it('renders a KPI per band plus avg score and images, from the latest bucket', async () => {
    await renderInTestApp(<KpiStrip bands={bands} buckets={buckets} days={90} />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Untiered')).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // latest rank1 count / total
  });

  it('renders nothing for an empty series', async () => {
    const { container } = await renderInTestApp(<KpiStrip bands={bands} buckets={[]} days={90} />);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/KpiStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create KpiStrip (extracted from RegisPortfolioTrendsPage)**

```tsx
// plugins/regis/src/components/KpiStrip.tsx
import { InfoCard } from '@backstage/core-components';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

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

/** KPI strip: one card per band (count from the latest bucket) + avg score + images. */
export function KpiStrip({
  bands,
  buckets,
  days,
}: {
  bands: TrendBand[];
  buckets: TrendBucket[];
  days: number;
}) {
  if (buckets.length === 0) return null;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const at = (b: TrendBucket, key: string) => b.counts[key] ?? 0;
  const daysLabel = `${days}d`;
  return (
    <Grid container spacing={3}>
      {bands.map(band => (
        <Kpi
          key={band.key}
          label={band.label}
          value={String(at(last, band.key))}
          sub={`${delta(at(last, band.key), at(first, band.key))} over ${daysLabel}`}
        />
      ))}
      <Kpi label="Avg score" value={String(last.avgScore)} sub={`${delta(last.avgScore, first.avgScore)} over ${daysLabel}`} />
      <Kpi label="Images" value={String(last.total)} sub={`${delta(last.total, first.total)} over ${daysLabel}`} />
    </Grid>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/KpiStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/KpiStrip.tsx plugins/regis/src/components/KpiStrip.test.tsx
git commit -m "feat(frontend): KpiStrip component (extracted KPI cards)"
```

---

## Task 6: RegisClient.explore()

**Files:**
- Modify: `plugins/regis/src/api/RegisApi.ts`
- Modify: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe('RegisClient', ...)` in `plugins/regis/src/api/RegisClient.test.ts`:

```ts
  it('GETs /portfolio/explore with groupBy and filters', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groupBy: 'owner', filters: {}, trend: { bands: [], buckets: [] }, groups: [], images: [], facets: {} }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.explore({ groupBy: 'owner', system: 'shop', tier: 'Gold' });
    expect(out.groupBy).toBe('owner');
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toContain('/portfolio/explore?');
    expect(url).toContain('groupBy=owner');
    expect(url).toContain('system=shop');
    expect(url).toContain('tier=Gold');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: FAIL — `explore` is not a function.

- [ ] **Step 3: Extend the API interface**

In `plugins/regis/src/api/RegisApi.ts`, add the explore types to the import and re-export, and add the method:

```ts
import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  ExploreGroupBy,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type {
  ExploreGroupBy,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
};

export interface ExploreParams {
  groupBy: ExploreGroupBy;
  days?: number;
  system?: string;
  owner?: string;
  playbook?: string;
  tier?: string;
}

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
  getHistory(entityRef: string): Promise<ReportHistory>;
  getPortfolioTrend(
    days: number,
    filters?: { system?: string; owner?: string; playbook?: string },
  ): Promise<PortfolioTrend>;
  getPlaybooks(): Promise<PlaybooksResponse>;
  explore(params: ExploreParams): Promise<ExploreResponse>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
```

- [ ] **Step 4: Implement in the client**

In `plugins/regis/src/api/RegisClient.ts`, update the import to add the explore types and `ExploreParams`:

```ts
import type {
  ExploreParams,
  ExploreResponse,
  PlaybooksResponse,
  PortfolioTrend,
  RegisApi,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from './RegisApi';
```

Add the method after `getPlaybooks`:

```ts
  async explore(params: ExploreParams): Promise<ExploreResponse> {
    const p = new URLSearchParams({ groupBy: params.groupBy });
    if (params.days) p.set('days', String(params.days));
    if (params.system) p.set('system', params.system);
    if (params.owner) p.set('owner', params.owner);
    if (params.playbook) p.set('playbook', params.playbook);
    if (params.tier) p.set('tier', params.tier);
    return this.getJson<ExploreResponse>(`/portfolio/explore?${p.toString()}`);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(frontend): RegisClient.explore"
```

---

## Task 7: FacetRail

**Files:**
- Create: `plugins/regis/src/components/FacetRail.tsx`
- Test: `plugins/regis/src/components/FacetRail.test.tsx`

The rail is presentational: it shows the group-by selector, the active-filter chips (removable), and add-facet selectors. It calls back to the parent to mutate URL state. State type:

```ts
// (defined inside FacetRail.tsx)
export type FacetKey = 'system' | 'owner' | 'playbook' | 'tier';
export interface ExploreState {
  groupBy: ExploreGroupBy;
  filters: Partial<Record<FacetKey, string>>;
}
```

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/FacetRail.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { FacetRail } from './FacetRail';

const facets = { systems: ['shop', 'bank'], owners: ['o1'], playbooks: ['default'], tiers: ['Gold'] };

describe('FacetRail', () => {
  it('shows active filters as deletable chips and removes one on delete', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail
        state={{ groupBy: 'owner', filters: { system: 'shop' } }}
        facets={facets}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('system: shop')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('remove system filter'));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: {} });
  });

  it('changes the group-by via the selector', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail state={{ groupBy: 'system', filters: {} }} facets={facets} onChange={onChange} />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Group by'));
    fireEvent.click(await screen.findByRole('option', { name: 'owner' }));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: {} });
  });

  it('adds a facet value from the add-facet selector', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <FacetRail state={{ groupBy: 'owner', filters: {} }} facets={facets} onChange={onChange} />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Filter by system'));
    fireEvent.click(await screen.findByRole('option', { name: 'bank' }));
    expect(onChange).toHaveBeenCalledWith({ groupBy: 'owner', filters: { system: 'bank' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/FacetRail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement FacetRail**

```tsx
// plugins/regis/src/components/FacetRail.tsx
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import type { ExploreGroupBy } from '@regis/backstage-plugin-regis-common';

export type FacetKey = 'system' | 'owner' | 'playbook' | 'tier';
export interface ExploreState {
  groupBy: ExploreGroupBy;
  filters: Partial<Record<FacetKey, string>>;
}
interface Facets {
  systems: string[];
  owners: string[];
  playbooks: string[];
  tiers: string[];
}

const GROUP_BYS: ExploreGroupBy[] = ['system', 'owner', 'playbook', 'tier'];
const FACET_DEFS: Array<{ key: FacetKey; label: string; from: keyof Facets }> = [
  { key: 'system', label: 'system', from: 'systems' },
  { key: 'owner', label: 'owner', from: 'owners' },
  { key: 'playbook', label: 'playbook', from: 'playbooks' },
  { key: 'tier', label: 'tier', from: 'tiers' },
];

export function FacetRail({
  state,
  facets,
  onChange,
}: {
  state: ExploreState;
  facets: Facets;
  onChange: (next: ExploreState) => void;
}) {
  const setGroupBy = (groupBy: ExploreGroupBy) => onChange({ ...state, groupBy });
  const addFilter = (key: FacetKey, value: string) =>
    onChange({ ...state, filters: { ...state.filters, [key]: value } });
  const removeFilter = (key: FacetKey) => {
    const filters = { ...state.filters };
    delete filters[key];
    onChange({ ...state, filters });
  };

  return (
    <Box display="flex" flexDirection="column" gridGap={16}>
      <FormControl fullWidth>
        <InputLabel id="regis-groupby">Group by</InputLabel>
        <Select
          labelId="regis-groupby"
          aria-label="Group by"
          value={state.groupBy}
          onChange={e => setGroupBy(e.target.value as ExploreGroupBy)}
        >
          {GROUP_BYS.map(g => (
            <MenuItem key={g} value={g}>{g}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <Typography variant="overline" color="textSecondary">Active filters</Typography>
        <Box display="flex" flexWrap="wrap" gridGap={6}>
          {Object.entries(state.filters).map(([key, value]) => (
            <Chip
              key={key}
              label={`${key}: ${value}`}
              onDelete={() => removeFilter(key as FacetKey)}
              deleteIcon={<span aria-label={`remove ${key} filter`}>✕</span>}
              size="small"
            />
          ))}
          {Object.keys(state.filters).length === 0 && (
            <Typography variant="caption" color="textSecondary">none</Typography>
          )}
        </Box>
      </Box>

      {FACET_DEFS.filter(f => state.filters[f.key] === undefined).map(f => {
        const options = facets[f.from];
        if (options.length === 0) return null;
        return (
          <FormControl fullWidth key={f.key}>
            <InputLabel id={`regis-facet-${f.key}`}>{`Filter by ${f.label}`}</InputLabel>
            <Select
              labelId={`regis-facet-${f.key}`}
              aria-label={`Filter by ${f.label}`}
              value=""
              onChange={e => addFilter(f.key, e.target.value as string)}
            >
              {options.map(o => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/FacetRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/FacetRail.tsx plugins/regis/src/components/FacetRail.test.tsx
git commit -m "feat(frontend): FacetRail (group-by + removable filter chips + add-facet)"
```

---

## Task 8: Breakdown

**Files:**
- Create: `plugins/regis/src/components/Breakdown.tsx`
- Test: `plugins/regis/src/components/Breakdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/Breakdown.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { Breakdown } from './Breakdown';
import type { ExploreGroup, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];
const groups: ExploreGroup[] = [
  { key: 'team-payments', count: 3, avgScore: 71, tiers: { Gold: 1, Bronze: 2 } },
];

describe('Breakdown', () => {
  it('renders a row per group and drills on click', async () => {
    const onDrill = jest.fn();
    await renderInTestApp(<Breakdown groups={groups} ladder={ladder} onDrill={onDrill} />);
    const row = screen.getByRole('button', { name: /team-payments/ });
    expect(row).toBeInTheDocument();
    expect(screen.getByText('71')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onDrill).toHaveBeenCalledWith('team-payments');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/Breakdown.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Breakdown**

```tsx
// plugins/regis/src/components/Breakdown.tsx
import Box from '@material-ui/core/Box';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import type { ExploreGroup, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

function MixBar({ tiers, ladder }: { tiers: Record<string, number>; ladder: TrendBand[] }) {
  const total = Object.values(tiers).reduce((a, n) => a + n, 0) || 1;
  return (
    <Box display="flex" width={90} height={8} borderRadius={2} overflow="hidden">
      {Object.entries(tiers).map(([tier, n]) => (
        <Box key={tier} width={`${(n / total) * 100}%`} style={{ backgroundColor: tierColor(tier, ladder) }} />
      ))}
    </Box>
  );
}

/** Per-group breakdown for the current group-by; each row drills (adds the group as a filter). */
export function Breakdown({
  groups,
  ladder,
  onDrill,
}: {
  groups: ExploreGroup[];
  ladder: TrendBand[];
  onDrill: (key: string) => void;
}) {
  if (groups.length === 0) {
    return <Typography variant="body2" color="textSecondary">No groups in scope.</Typography>;
  }
  return (
    <List dense>
      {groups.map(g => (
        <ListItem key={g.key} button onClick={() => onDrill(g.key)} aria-label={`drill into ${g.key}`}>
          <Box display="flex" alignItems="center" gridGap={12} width="100%">
            <Typography variant="body2" style={{ flex: 1 }}>{g.key}</Typography>
            <MixBar tiers={g.tiers} ladder={ladder} />
            <Typography variant="caption" color="textSecondary">{g.count} img</Typography>
            <Typography variant="body2">{g.avgScore}</Typography>
          </Box>
        </ListItem>
      ))}
    </List>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/Breakdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/Breakdown.tsx plugins/regis/src/components/Breakdown.test.tsx
git commit -m "feat(frontend): Breakdown (per-group rows with tier-mix bar, drill on click)"
```

---

## Task 9: ImageList

**Files:**
- Create: `plugins/regis/src/components/ImageList.tsx`
- Test: `plugins/regis/src/components/ImageList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/ImageList.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { ImageList } from './ImageList';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];
const images: ExploreImage[] = [
  { imageRef: 'r/a:1', tier: 'Gold', score: 100, system: 'shop' },
];

describe('ImageList', () => {
  it('lists images with a colored tier swatch and selects on row click', async () => {
    const onSelect = jest.fn();
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={onSelect} />);
    const cell = await screen.findByText('Gold');
    const swatch = cell.querySelector('[data-testid="tier-swatch"]');
    expect(swatch).toHaveStyle({ backgroundColor: '#d4af37' });
    fireEvent.click(screen.getByText('r/a:1'));
    expect(onSelect).toHaveBeenCalledWith('r/a:1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImageList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ImageList**

```tsx
// plugins/regis/src/components/ImageList.tsx
import { Table, type TableColumn } from '@backstage/core-components';
import Box from '@material-ui/core/Box';
import Link from '@material-ui/core/Link';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

function TierCell({ tier, ladder }: { tier?: string | null; ladder: TrendBand[] }) {
  return (
    <Box component="span" display="inline-flex" alignItems="center" gridGap={6}>
      <Box
        component="span"
        data-testid="tier-swatch"
        width={10}
        height={10}
        borderRadius={2}
        style={{ backgroundColor: tierColor(tier, ladder) }}
      />
      {tier ?? '—'}
    </Box>
  );
}

/** Scoped image list; clicking a row opens the quick-look. */
export function ImageList({
  images,
  ladder,
  onSelect,
}: {
  images: ExploreImage[];
  ladder: TrendBand[];
  onSelect: (imageRef: string) => void;
}) {
  const columns: TableColumn<ExploreImage>[] = [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => (
        <Link component="button" type="button" onClick={() => onSelect(row.imageRef)}>
          {row.imageRef}
        </Link>
      ),
    },
    { title: 'Tier', field: 'tier', render: row => <TierCell tier={row.tier} ladder={ladder} /> },
    { title: 'Score', field: 'score', type: 'numeric' },
  ];
  return (
    <Table
      title={`${images.length} images`}
      columns={columns}
      data={images}
      options={{ search: true, paging: images.length > 20, pageSize: 20, padding: 'dense' }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImageList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/ImageList.tsx plugins/regis/src/components/ImageList.test.tsx
git commit -m "feat(frontend): ImageList (scoped table, colored tier, select on click)"
```

---

## Task 10: QuickLookPanel

**Files:**
- Create: `plugins/regis/src/components/QuickLookPanel.tsx`
- Test: `plugins/regis/src/components/QuickLookPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/QuickLookPanel.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { fireEvent, screen } from '@testing-library/react';
import { regisApiRef } from '../api/RegisApi';
import { QuickLookPanel } from './QuickLookPanel';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];

const api = {
  getHistory: async () => ({
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    snapshots: [
      { imageRef: 'x', snapshotDate: '2026-05-01', score: 70, tier: 'Gold', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'x', snapshotDate: '2026-06-01', score: 100, tier: 'Gold', recordedAt: '2026-06-01T00:00:00.000Z' },
    ],
  }),
  getReport: async () => { throw new Error('not used'); },
  listReports: async () => [],
  getPortfolioTrend: async () => { throw new Error('not used'); },
  getPlaybooks: async () => ({ playbooks: [] }),
  explore: async () => { throw new Error('not used'); },
};

const render = (onClose = jest.fn()) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <QuickLookPanel
        imageRef="registry-1.docker.io/library/nginx:1.27"
        tier="Gold"
        score={100}
        ladder={ladder}
        onClose={onClose}
      />
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('QuickLookPanel', () => {
  it('shows tier/score, a trajectory, and a link to the full entity page', async () => {
    await render();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /score trajectory/i })).toBeInTheDocument();
    expect(screen.getByText(/open full page/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/QuickLookPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement QuickLookPanel**

```tsx
// plugins/regis/src/components/QuickLookPanel.tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Drawer from '@material-ui/core/Drawer';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import CloseIcon from '@material-ui/icons/Close';
import { slugForImageRef, type TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';
import { tierColor } from './format';
import { Sparkline } from './Sparkline';

/** Right-hand quick-look for one image: tier/score + trajectory + link to the entity page. */
export function QuickLookPanel({
  imageRef,
  tier,
  score,
  ladder,
  onClose,
}: {
  imageRef: string;
  tier?: string | null;
  score?: number;
  ladder: TrendBand[];
  onClose: () => void;
}) {
  const api = useApi(regisApiRef);
  // The provider mints image Resources named slugForImageRef(imageRef) in the
  // 'default' namespace — derive the entity ref to link to the full page.
  const entityRef = `resource:default/${slugForImageRef(imageRef)}`;
  const { value: history, loading } = useAsync(() => api.getHistory(entityRef), [entityRef]);

  return (
    <Drawer anchor="right" open onClose={onClose} variant="temporary">
      <Box width={320} p={2} display="flex" flexDirection="column" gridGap={12} role="region" aria-label="image quick look">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" noWrap>{imageRef}</Typography>
          <IconButton size="small" aria-label="close quick look" onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        {tier && (
          <Chip label={`${tier}${score !== undefined ? ` · ${score}` : ''}`} style={{ backgroundColor: tierColor(tier, ladder), color: '#fff', alignSelf: 'flex-start' }} />
        )}
        <Typography variant="overline" color="textSecondary">Trajectory</Typography>
        {loading ? <Progress /> : history ? <Sparkline history={history} ladder={ladder} /> : <Typography variant="body2">No history.</Typography>}
        <EntityRefLink entityRef={entityRef}>Open full page ↗</EntityRefLink>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/QuickLookPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/QuickLookPanel.tsx plugins/regis/src/components/QuickLookPanel.test.tsx
git commit -m "feat(frontend): QuickLookPanel (drawer with trajectory + entity link)"
```

---

## Task 11: RegisExplorerPage

**Files:**
- Create: `plugins/regis/src/components/RegisExplorerPage.tsx`
- Test: `plugins/regis/src/components/RegisExplorerPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// plugins/regis/src/components/RegisExplorerPage.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { screen, waitFor } from '@testing-library/react';
import { regisApiRef } from '../api/RegisApi';
import { RegisExplorerPage } from './RegisExplorerPage';

const explore = jest.fn().mockResolvedValue({
  filters: {},
  groupBy: 'system',
  trend: {
    bands: [{ key: 'rank1', label: 'Rank 1', color: '#2e7d32' }],
    buckets: [{ date: '2026-06-01', counts: { rank1: 2 }, total: 2, avgScore: 90 }],
  },
  groups: [{ key: 'shop', count: 2, avgScore: 90, tiers: { Gold: 2 } }],
  images: [{ imageRef: 'r/a:1', tier: 'Gold', score: 100, system: 'shop' }],
  facets: { systems: ['shop'], owners: [], playbooks: [], tiers: ['Gold'] },
});

const api = {
  explore,
  getPlaybooks: async () => ({ playbooks: [{ id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] }] }),
  getReport: async () => { throw new Error('x'); },
  listReports: async () => [],
  getHistory: async () => ({ imageRef: 'x', snapshots: [] }),
  getPortfolioTrend: async () => { throw new Error('x'); },
};

describe('RegisExplorerPage', () => {
  it('renders the scoped trend, breakdown and image list from explore()', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisExplorerPage />
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    await waitFor(() => expect(explore).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: /portfolio posture over time/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drill into shop/i })).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    // group-by from default state
    expect(explore.mock.calls[0][0]).toMatchObject({ groupBy: 'system' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RegisExplorerPage**

```tsx
// plugins/regis/src/components/RegisExplorerPage.tsx
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import type { ExploreGroupBy } from '@regis/backstage-plugin-regis-common';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';
import { PortfolioStackedArea } from './portfolioChart';
import { KpiStrip } from './KpiStrip';
import { FacetRail, type ExploreState, type FacetKey } from './FacetRail';
import { Breakdown } from './Breakdown';
import { ImageList } from './ImageList';
import { QuickLookPanel } from './QuickLookPanel';

const WINDOW_DAYS = 90;
const FACET_KEYS: FacetKey[] = ['system', 'owner', 'playbook', 'tier'];

function stateFromParams(params: URLSearchParams): ExploreState {
  const gb = params.get('groupBy');
  const groupBy: ExploreGroupBy =
    gb === 'owner' || gb === 'playbook' || gb === 'tier' ? gb : 'system';
  const filters: ExploreState['filters'] = {};
  for (const k of FACET_KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }
  return { groupBy, filters };
}

function paramsFromState(state: ExploreState): URLSearchParams {
  const p = new URLSearchParams();
  p.set('groupBy', state.groupBy);
  for (const k of FACET_KEYS) {
    const v = state.filters[k];
    if (v) p.set(k, v);
  }
  return p;
}

export function RegisExplorerPage() {
  const api = useApi(regisApiRef);
  const [params, setParams] = useSearchParams();
  const state = stateFromParams(params);
  const [selected, setSelected] = useState<{ imageRef: string; tier?: string | null; score?: number } | null>(null);

  const setState = useCallback(
    (next: ExploreState) => setParams(paramsFromState(next)),
    [setParams],
  );

  const { value, loading, error } = useAsync(
    () =>
      Promise.all([
        api.explore({ groupBy: state.groupBy, days: WINDOW_DAYS, ...state.filters }),
        api.getPlaybooks(),
      ]),
    [params.toString()],
  );

  const [data, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);

  const drill = (key: string) =>
    setState({ ...state, filters: { ...state.filters, [state.groupBy]: key } });

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    if (!data) return null;
    if (data.images.length === 0) {
      return <Typography>No images match this scope yet.</Typography>;
    }
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <InfoCard title="Scope">
            <FacetRail state={state} facets={data.facets} onChange={setState} />
          </InfoCard>
        </Grid>
        <Grid item xs={12} md={9}>
          <Box display="flex" flexDirection="column" gridGap={16}>
            <KpiStrip bands={data.trend.bands} buckets={data.trend.buckets} days={WINDOW_DAYS} />
            <InfoCard title="Posture over time">
              <PortfolioStackedArea bands={data.trend.bands} buckets={data.trend.buckets} />
            </InfoCard>
            <InfoCard title={`By ${state.groupBy}`}>
              <Breakdown groups={data.groups} ladder={ladder} onDrill={drill} />
            </InfoCard>
            <ImageList
              images={data.images}
              ladder={ladder}
              onSelect={ref => {
                const img = data.images.find(i => i.imageRef === ref);
                setSelected(img ? { imageRef: img.imageRef, tier: img.tier, score: img.score } : { imageRef: ref });
              }}
            />
          </Box>
        </Grid>
        {selected && (
          <QuickLookPanel
            imageRef={selected.imageRef}
            tier={selected.tier}
            score={selected.score}
            ladder={ladder}
            onClose={() => setSelected(null)}
          />
        )}
      </Grid>
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Portfolio" subtitle="Explore image posture across the portfolio" />
      <Content>{body()}</Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisExplorerPage.tsx plugins/regis/src/components/RegisExplorerPage.test.tsx
git commit -m "feat(frontend): RegisExplorerPage (URL-driven master-detail explorer)"
```

---

## Task 12: Wire the explorer at `/`, retire the old pages

**Files:**
- Modify: `plugins/regis/src/plugin.tsx`
- Modify: `plugins/regis/src/routes.ts`
- Delete: `plugins/regis/src/components/RegisCatalogPage.tsx` + `.test.tsx`
- Delete: `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx` + `.test.tsx`

- [ ] **Step 1: Repoint the routes**

Replace the contents of `plugins/regis/src/routes.ts` with:

```ts
import { createRouteRef } from '@backstage/frontend-plugin-api';

/** The explorer is the app home. */
export const rootRouteRef = createRouteRef();
```

(Drop `portfolioRouteRef`; the explorer is the single Regis page.)

- [ ] **Step 2: Update plugin.tsx**

In `plugins/regis/src/plugin.tsx`:

Remove the `catalogPage` and `portfolioTrendsPage` `PageBlueprint` definitions and their import of `portfolioRouteRef`. Replace them with one explorer page at `/`:

```tsx
import { rootRouteRef } from './routes';
// ...
const explorerPage = PageBlueprint.make({
  params: {
    path: '/',
    routeRef: rootRouteRef,
    loader: () =>
      import('./components/RegisExplorerPage').then(m => <m.RegisExplorerPage />),
  },
});
```

Update the `extensions` array: replace `catalogPage, portfolioTrendsPage` with `explorerPage`. The `TimelineIcon` import is no longer needed unless used elsewhere — remove it if unused. Keep all entity cards/tabs (`scorecardCard`, `reportTab`, `serviceImagesCard`, `playbookImagesCard`, `aliasesCard`, `trajectoryCard`) and `regisApi`.

- [ ] **Step 3: Delete the retired pages and their tests**

```bash
git rm plugins/regis/src/components/RegisCatalogPage.tsx plugins/regis/src/components/RegisCatalogPage.test.tsx plugins/regis/src/components/RegisPortfolioTrendsPage.tsx plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx
```

- [ ] **Step 4: Check for dangling references**

Run: `grep -rn "RegisCatalogPage\|RegisPortfolioTrendsPage\|portfolioRouteRef" plugins/regis/src packages/app/src`
Expected: no matches (other than nothing). If `packages/app/src/modules/nav/Sidebar.tsx` hard-codes a link to `/regis` or `/regis-portfolio`, update it to point at `/` (a single "Portfolio" item). If a route ref is referenced by a removed import, fix that import.

- [ ] **Step 5: Typecheck + run the frontend package**

Run: `node_modules/.bin/tsc`
Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS. (The deleted pages' tests are gone; the explorer + extracted components cover their behavior.)

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/plugin.tsx plugins/regis/src/routes.ts packages/app/src
git commit -m "feat(frontend): mount explorer at / and retire the standalone catalog/trends pages"
```

---

## Task 13: Full verification

**Files:** none (verification + any lint fixes).

- [ ] **Step 1: Regenerate API reports**

Run: `node_modules/.bin/backstage-cli repo fix`
Expected: updates `report.api.md` if exported APIs changed; no manual edits.

- [ ] **Step 2: Typecheck the whole repo**

Run: `node_modules/.bin/tsc`
Expected: PASS, no errors.

- [ ] **Step 3: Full test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false`
Expected: PASS — all packages.

- [ ] **Step 4: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: exit 0.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run the app (`node_modules/.bin/backstage-cli repo start` per the project's run docs), open `/`, confirm: the explorer loads the scoped trend + breakdown + image list; changing Group by and adding/removing filter chips re-queries and updates the URL; clicking a breakdown row drills; clicking an image opens the quick-look with a trajectory and an "Open full page" link.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: regenerate api report for portfolio explorer"
```

---

## Self-review notes

- **Spec coverage:** `ExploreResponse` types (Task 1); backend `explore()` reusing the snapshot cache — latest-per-image, scoped facets, group aggregates, scoped trend, tier filters images/groups only (Task 2); `GET /portfolio/explore` (Task 3); extracted `Sparkline` (Task 4) and `KpiStrip` (Task 5); `RegisClient.explore` (Task 6); `FacetRail` (Task 7), `Breakdown` (Task 8), `ImageList` (Task 9), `QuickLookPanel` with `slugForImageRef`-derived entity ref (Task 10); `RegisExplorerPage` with URL state + `getPlaybooks` union ladder (Task 11); explorer mounted at `/`, old pages retired/redirected, nav (Task 12); verification (Task 13). All spec sections map to a task.
- **DLS:** Backstage `Page`/`Header`/`Content`/`InfoCard`/`Table`/`EntityRefLink`/`Progress`/`ResponseErrorPanel`; MUI `Grid`/`Box`/`Drawer`/`Chip onDelete`/`Select`/`List`; `Typography` for text; tier color is the only inline `backgroundColor` (data from the ladder); drill targets are `button`/`Link` with accessible names; trend SVG keeps `role="img"`.
- **Type consistency:** `ExploreResponse`/`ExploreGroup`/`ExploreImage`/`ExploreGroupBy` shared from common; `explore()` aggregator return matches the response fields; `ExploreState`/`FacetKey` from `FacetRail` reused by the page; `unionLadder`/`tierColor` reused; `Sparkline(history, ladder)` and `KpiStrip(bands, buckets, days)` signatures consistent across consumers.
- **Out of scope (per spec):** transitivity/CVE blast-radius, simultaneous multi-dimension drill, write/intake — not touched.
- **Risk flagged:** the `'default'` namespace assumption in `slugForImageRef`-derived entity refs (Task 10) — if the provider mints into another namespace, the quick-look link needs that namespace; verify against `buildEntities` config at implementation time.
