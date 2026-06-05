# Portfolio explorer health-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Portfolio explorer around a compact "Portfolio health" header (replacing the heavy KpiStrip) and make the image list worst-first with tier chips and score bars.

**Architecture:** Frontend-only in `plugins/regis`. A pure `portfolioHealth.ts` derives the health summary from the trend `bands` + `buckets` (the same data the old KpiStrip used). `PortfolioHealth` renders it. `ImageList` reuses `tierRank` from `rollup.ts` to sort worst-first and adopts the redesign's tier chips / score bars. `RegisExplorerPage` reorders the body, drops `KpiStrip`, and shows a scope-summary subtitle.

**Tech Stack:** TypeScript, React, Backstage new-frontend-system, Material-UI v4 (`@material-ui/core`), `@backstage/core-components` (`InfoCard`, `Table`), Jest + `@backstage/frontend-test-utils`.

**Test runner (this repo):** `node_modules/.bin/backstage-cli repo test --watch=false <path>` (yarn does NOT put backstage-cli on PATH).

---

## Reference: data shapes (already exported from `@regis/backstage-plugin-regis-common`)

- `TrendBand`: `{ key: string; label: string; color: string }`.
- `TrendBucket`: `{ date?: string; counts: Record<string, number>; total: number; avgScore: number }`.
- `ExploreImage`: `{ imageRef: string; tier?: string | null; score?: number; system?: string; owner?: string; playbook?: string }`.
- `format.ts` exports `tierColor(tier, ladder)`, `scoreBarColor(score)`, `unionLadder(playbooks)`.
- `rollup.ts` exports `tierRank(ladder): Map<string, number>`.
- `RegisExplorerPage` has `const WINDOW_DAYS = 90` and already computes `ladder = unionLadder(...)`.

## File structure

- Create: `plugins/regis/src/components/portfolioHealth.ts` (+ `.test.ts`) — pure summary.
- Create: `plugins/regis/src/components/PortfolioHealth.tsx` (+ `.test.tsx`) — health header.
- Modify: `plugins/regis/src/components/ImageList.tsx` (+ its test) — worst-first + chips + score bars.
- Modify: `plugins/regis/src/components/RegisExplorerPage.tsx` (+ its test) — reorder, drop KpiStrip, scope summary.
- Delete: `plugins/regis/src/components/KpiStrip.tsx` + `KpiStrip.test.tsx`.

---

## Task 1: Pure module `portfolioHealth.ts`

**Files:**
- Create: `plugins/regis/src/components/portfolioHealth.ts`
- Test: `plugins/regis/src/components/portfolioHealth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/portfolioHealth.test.ts`:

```ts
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { summarizeTrend, formatDelta } from './portfolioHealth';

const bands: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#g' },
  { key: 'Silver', label: 'Silver', color: '#s' },
  { key: 'Bronze', label: 'Bronze', color: '#b' },
];

const bucket = (counts: Record<string, number>, total: number, avgScore: number): TrendBucket => ({
  counts,
  total,
  avgScore,
});

describe('formatDelta', () => {
  it('formats up, down and zero', () => {
    expect(formatDelta(4)).toBe('▲ 4');
    expect(formatDelta(-3)).toBe('▼ 3');
    expect(formatDelta(0)).toBe('±0');
  });
});

describe('summarizeTrend', () => {
  it('summarizes mix, worst, kpis and deltas from first/last buckets', () => {
    const first = bucket({ Gold: 8, Silver: 6, Bronze: 5 }, 19, 78);
    const last = bucket({ Gold: 11, Silver: 7, Bronze: 4 }, 22, 82);
    expect(summarizeTrend(bands, [first, last])).toEqual({
      mix: [
        { key: 'Gold', label: 'Gold', color: '#g', count: 11 },
        { key: 'Silver', label: 'Silver', color: '#s', count: 7 },
        { key: 'Bronze', label: 'Bronze', color: '#b', count: 4 },
      ],
      worst: { label: 'Bronze', count: 4 },
      avgScore: 82,
      images: 22,
      scoreDelta: 4,
      imagesDelta: 3,
    });
  });
  it('omits zero-count bands and returns null worst when only the best band has counts', () => {
    const b = bucket({ Gold: 5 }, 5, 100);
    const out = summarizeTrend(bands, [b]);
    expect(out.mix).toEqual([{ key: 'Gold', label: 'Gold', color: '#g', count: 5 }]);
    expect(out.worst).toBeNull();
  });
  it('uses a single bucket as both first and last (zero deltas)', () => {
    const b = bucket({ Gold: 3, Bronze: 1 }, 4, 70);
    const out = summarizeTrend(bands, [b]);
    expect(out.scoreDelta).toBe(0);
    expect(out.imagesDelta).toBe(0);
    expect(out.worst).toEqual({ label: 'Bronze', count: 1 });
  });
  it('returns an empty/zeroed result for no buckets', () => {
    expect(summarizeTrend(bands, [])).toEqual({
      mix: [],
      worst: null,
      avgScore: 0,
      images: 0,
      scoreDelta: 0,
      imagesDelta: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/portfolioHealth.test.ts`
Expected: FAIL — `Cannot find module './portfolioHealth'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/portfolioHealth.ts`:

```ts
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

export interface MixEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface PortfolioHealthSummary {
  mix: MixEntry[];
  worst: { label: string; count: number } | null;
  avgScore: number;
  images: number;
  scoreDelta: number;
  imagesDelta: number;
}

/** `▲ N` / `▼ N` / `±0` for a signed delta. */
export function formatDelta(d: number): string {
  if (d === 0) return '±0';
  return d > 0 ? `▲ ${d}` : `▼ ${Math.abs(d)}`;
}

/**
 * Health summary from the trend series: per-band counts of the latest bucket
 * (ladder order, zero omitted), the worst band present, the latest avg score and
 * image count, and deltas from the first bucket. Empty when there are no buckets.
 */
export function summarizeTrend(
  bands: TrendBand[],
  buckets: TrendBucket[],
): PortfolioHealthSummary {
  if (buckets.length === 0) {
    return { mix: [], worst: null, avgScore: 0, images: 0, scoreDelta: 0, imagesDelta: 0 };
  }
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const at = (b: TrendBucket, key: string) => b.counts[key] ?? 0;

  const mix: MixEntry[] = bands
    .map(b => ({ key: b.key, label: b.label, color: b.color, count: at(last, b.key) }))
    .filter(e => e.count > 0);

  let worst: { label: string; count: number } | null = null;
  for (let i = bands.length - 1; i >= 0; i--) {
    const count = at(last, bands[i].key);
    if (count > 0) {
      worst = i === 0 ? null : { label: bands[i].label, count };
      break;
    }
  }

  return {
    mix,
    worst,
    avgScore: last.avgScore,
    images: last.total,
    scoreDelta: last.avgScore - first.avgScore,
    imagesDelta: last.total - first.total,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/portfolioHealth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/portfolioHealth.ts plugins/regis/src/components/portfolioHealth.test.ts
git commit -m "feat(frontend): portfolioHealth.ts — health summary from trend"
```

---

## Task 2: `PortfolioHealth` component

**Files:**
- Create: `plugins/regis/src/components/PortfolioHealth.tsx`
- Test: `plugins/regis/src/components/PortfolioHealth.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/PortfolioHealth.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { PortfolioHealth } from './PortfolioHealth';

const bands: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const buckets: TrendBucket[] = [
  { counts: { Gold: 8, Silver: 6, Bronze: 5 }, total: 19, avgScore: 78 },
  { counts: { Gold: 11, Silver: 7, Bronze: 4 }, total: 22, avgScore: 82 },
];

describe('PortfolioHealth', () => {
  it('shows the mix, worst tier and the headline KPIs with deltas', async () => {
    await renderInTestApp(<PortfolioHealth bands={bands} buckets={buckets} days={90} />);
    expect(await screen.findByText('11 Gold')).toBeInTheDocument();
    expect(screen.getByText('4 Bronze')).toBeInTheDocument();
    expect(screen.getByText(/Worst: Bronze · 4/)).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText(/▲ 4 \/ 90d/)).toBeInTheDocument();
    expect(screen.getByText(/▲ 3 \/ 90d/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tier distribution: 11 Gold, 7 Silver, 4 Bronze/)).toBeInTheDocument();
  });

  it('renders nothing when there are no buckets', async () => {
    const { container } = await renderInTestApp(
      <PortfolioHealth bands={bands} buckets={[]} days={90} />,
    );
    expect(container.querySelector('[aria-label^="Tier distribution"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PortfolioHealth.test.tsx`
Expected: FAIL — `Cannot find module './PortfolioHealth'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/PortfolioHealth.tsx`:

```tsx
import { InfoCard } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { formatDelta, summarizeTrend } from './portfolioHealth';

function Kpi(props: { label: string; value: string; delta: string; days: number }) {
  return (
    <Box>
      <Typography variant="caption" color="textSecondary" component="div" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {props.label}
      </Typography>
      <Typography variant="h4" component="div">{props.value}</Typography>
      <Typography variant="caption" component="div">{`${props.delta} / ${props.days}d`}</Typography>
    </Box>
  );
}

/** Portfolio health header: tier-mix bar + worst tier + headline KPIs with deltas. */
export function PortfolioHealth(props: {
  bands: TrendBand[];
  buckets: TrendBucket[];
  days: number;
}) {
  const { bands, buckets, days } = props;
  if (buckets.length === 0) return null;

  const h = summarizeTrend(bands, buckets);
  const total = h.mix.reduce((n, e) => n + e.count, 0) || 1;
  const barLabel = `Tier distribution: ${h.mix.map(e => `${e.count} ${e.label}`).join(', ')}`;

  return (
    <InfoCard title="Portfolio health">
      <Box display="flex" gridGap={24} alignItems="center" flexWrap="wrap">
        <Box flex="1 1 320px" minWidth={240}>
          <Box
            display="flex"
            height={16}
            borderRadius={5}
            overflow="hidden"
            mb={1}
            role="img"
            aria-label={barLabel}
          >
            {h.mix.map(e => (
              <Box key={e.key} height="100%" bgcolor={e.color} width={`${(e.count / total) * 100}%`} title={`${e.count} ${e.label}`} />
            ))}
          </Box>
          <Box display="flex" flexWrap="wrap" gridGap={12} alignItems="center">
            {h.mix.map(e => (
              <Typography key={e.key} variant="body2" component="span">
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: e.color, marginRight: 5 }} />
                {e.count} {e.label}
              </Typography>
            ))}
            {h.worst && (
              <Typography variant="caption" component="span" style={{ marginLeft: 'auto', fontWeight: 600, color: '#c0392b' }}>
                Worst: {h.worst.label} · {h.worst.count}
              </Typography>
            )}
          </Box>
        </Box>
        <Box display="flex" gridGap={24}>
          <Kpi label="Avg score" value={String(h.avgScore)} delta={formatDelta(h.scoreDelta)} days={days} />
          <Kpi label="Images" value={String(h.images)} delta={formatDelta(h.imagesDelta)} days={days} />
        </Box>
      </Box>
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PortfolioHealth.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/PortfolioHealth.tsx plugins/regis/src/components/PortfolioHealth.test.tsx
git commit -m "feat(frontend): PortfolioHealth header (mix + worst + KPIs)"
```

---

## Task 3: Worst-first `ImageList` with chips + score bars

**Files:**
- Modify (replace whole file): `plugins/regis/src/components/ImageList.tsx`
- Test (replace whole file): `plugins/regis/src/components/ImageList.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `plugins/regis/src/components/ImageList.test.tsx` with:

```tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { ImageList } from './ImageList';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const images: ExploreImage[] = [
  { imageRef: 'r/gold:1', tier: 'Gold', score: 95, system: 'shop' },
  { imageRef: 'r/bronze:1', tier: 'Bronze', score: 55, system: 'shop' },
  { imageRef: 'r/silver:1', tier: 'Silver', score: 80, system: 'shop' },
];

describe('ImageList', () => {
  it('sorts worst-first and renders a colored tier chip', async () => {
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={jest.fn()} />);
    const rows = await screen.findAllByText(/r\/(gold|silver|bronze):1/);
    expect(rows[0]).toHaveTextContent('r/bronze:1');
    expect(rows[2]).toHaveTextContent('r/gold:1');
    const chip = (await screen.findByText('Bronze')).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#cd7f32' });
  });

  it('selects on row click', async () => {
    const onSelect = jest.fn();
    await renderInTestApp(<ImageList images={images} ladder={ladder} onSelect={onSelect} />);
    fireEvent.click(await screen.findByText('r/bronze:1'));
    expect(onSelect).toHaveBeenCalledWith('r/bronze:1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImageList.test.tsx`
Expected: FAIL — current `ImageList` renders a swatch (no `.MuiChip-root`) and does not sort.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `plugins/regis/src/components/ImageList.tsx` with:

```tsx
import { Table, type TableColumn } from '@backstage/core-components';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Link from '@material-ui/core/Link';
import type { ExploreImage, TrendBand } from '@regis/backstage-plugin-regis-common';
import { scoreBarColor, tierColor } from './format';
import { tierRank } from './rollup';

/** Worst tier first (lowest rank index last → highest first), then ascending score. */
function sortImagesWorstFirst(images: ExploreImage[], ladder: TrendBand[]): ExploreImage[] {
  const rank = tierRank(ladder);
  const rnk = (img: ExploreImage) =>
    (img.tier ? rank.get(img.tier) : undefined) ?? ladder.length;
  const score = (img: ExploreImage) => img.score ?? -1;
  return [...images].sort((a, b) => rnk(b) - rnk(a) || score(a) - score(b));
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
    {
      title: 'Tier',
      field: 'tier',
      render: row =>
        row.tier ? (
          <Chip
            size="small"
            label={row.tier}
            style={{ backgroundColor: tierColor(row.tier, ladder), color: '#fff' }}
          />
        ) : (
          <>—</>
        ),
    },
    {
      title: 'Score',
      field: 'score',
      type: 'numeric',
      render: row => (
        <Box display="flex" alignItems="center" gridGap={8} justifyContent="flex-end">
          <span>{row.score ?? '—'}</span>
          {row.score !== undefined && (
            <div style={{ width: 60, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${row.score}%`, height: '100%', background: scoreBarColor(row.score) }} />
            </div>
          )}
        </Box>
      ),
    },
  ];
  return (
    <Table
      title={`${images.length} images · worst first`}
      columns={columns}
      data={sortImagesWorstFirst(images, ladder)}
      options={{ search: true, paging: images.length > 20, pageSize: 20, padding: 'dense' }}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImageList.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/ImageList.tsx plugins/regis/src/components/ImageList.test.tsx
git commit -m "feat(frontend): worst-first ImageList with tier chips + score bars"
```

---

## Task 4: Reorganize `RegisExplorerPage`, drop `KpiStrip`

**Files:**
- Modify: `plugins/regis/src/components/RegisExplorerPage.tsx`
- Delete: `plugins/regis/src/components/KpiStrip.tsx`, `plugins/regis/src/components/KpiStrip.test.tsx`
- Test: `plugins/regis/src/components/RegisExplorerPage.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

In `plugins/regis/src/components/RegisExplorerPage.test.tsx`, ADD this test inside the top-level `describe('RegisExplorerPage', ...)` (reuse the existing `api`/`explore` mock and render setup; the existing mock returns `trend.bands = [{key:'rank1',label:'Rank 1',color:'#2e7d32'}]`, `buckets=[{counts:{rank1:2},total:2,avgScore:90}]`):

```tsx
  it('shows the portfolio health header instead of the KpiStrip', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisExplorerPage />
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    expect(await screen.findByText('Portfolio health')).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    // the per-band KpiStrip card title ("Rank 1") is gone
    expect(screen.queryByText('Rank 1')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: FAIL — "Portfolio health" not present (page still renders `KpiStrip`, which shows "Rank 1").

- [ ] **Step 3: Edit `RegisExplorerPage.tsx`**

Read the file first. Then make these exact changes:

1. Replace the import line `import { KpiStrip } from './KpiStrip';` with `import { PortfolioHealth } from './PortfolioHealth';`.

2. In the JSX, replace the `KpiStrip` element:
```tsx
          <KpiStrip bands={data.trend.bands} buckets={data.trend.buckets} days={WINDOW_DAYS} />
```
with:
```tsx
          <PortfolioHealth bands={data.trend.bands} buckets={data.trend.buckets} days={WINDOW_DAYS} />
```

3. Add a scope-summary helper. Near the top of the file (after the imports), add:
```tsx
function scopeSummary(
  filters: ExploreState['filters'],
  imageCount: number,
  days: number,
): string {
  const active = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  const head = active.length > 0 ? active.join(' · ') : 'All images';
  return `${head} · ${imageCount} images · ${days}d`;
}
```
(`ExploreState` is already imported from `./FacetRail`. If it is not, add it to that import.)

4. Change the `<Header>` subtitle to the scope summary. `data` is already destructured at component scope (`const [data, playbooksResp] = value ?? [undefined, undefined];`), so it is in scope where `<Header>` is rendered. Replace the existing header line:
```tsx
      <Header title="Portfolio" subtitle="Explore image posture across the portfolio" />
```
with:
```tsx
      <Header
        title="Portfolio"
        subtitle={
          data
            ? scopeSummary(state.filters, data.images.length, WINDOW_DAYS)
            : 'Explore image posture across the portfolio'
        }
      />
```
(`data` is `undefined` during loading/error, so the fallback subtitle is used then.)

- [ ] **Step 4: Delete the KpiStrip files**

```bash
git rm plugins/regis/src/components/KpiStrip.tsx plugins/regis/src/components/KpiStrip.test.tsx
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: PASS — including the existing tests (area chart role, drill button, image) and the new health-header test.

- [ ] **Step 6: Confirm no dangling KpiStrip references**

Run: `grep -rn "KpiStrip" plugins/regis/src`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis/src/components/RegisExplorerPage.tsx plugins/regis/src/components/RegisExplorerPage.test.tsx
git commit -m "feat(frontend): explorer health header + scope summary; drop KpiStrip"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the whole plugin test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS — all tests green.

- [ ] **Step 2: Typecheck**

Run: `yarn tsc`
Expected: no type errors.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: no errors. Fix any unused-import / `no-nested-ternary` / `gridGap` issues flagged in the touched files (`gridGap` is an established pattern — act only on errors, not warnings).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(frontend): lint/typecheck fixes for explorer health-first"
```

---

## Open question (carry into review, not a blocker)

`summarizeTrend` derives `worst` from band order (best→worst). The trend `bands`
served by the backend are authoritatively ordered (config-declared ladders, post
PR #20). If a deployment serves discovery-ranked bands, `worst` could be wrong —
but that affects the backend trend response, not this frontend change.
