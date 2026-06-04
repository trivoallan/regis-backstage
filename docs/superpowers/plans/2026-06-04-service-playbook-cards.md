# Service & playbook image cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the shared `RegisImagePostureCard` (used by the "Images of this service" and "Assessed images" cards) with a roll-up health header, worst-first sorting, and detail-view-consistent tier/score visuals; add a playbook-only drill-down link.

**Architecture:** Frontend-only in `plugins/regis`. Per-set derivations live in a pure, unit-tested `rollup.ts`. The roll-up header is a reusable `PostureRollup` component. `RegisImagePostureCard` composes them and reuses `tierColor` / `scoreBarColor` from `format.ts`. The playbook card passes a `deepLink` to the explorer scoped by playbook id.

**Tech Stack:** TypeScript, React, Backstage new-frontend-system, Material-UI v4 (`@material-ui/core`), `@backstage/core-components` (`InfoCard`, `Table`, `Link`), Jest + `@backstage/frontend-test-utils`.

**Test runner (this repo):** `node_modules/.bin/backstage-cli repo test --watch=false <path>` (yarn does NOT put backstage-cli on PATH).

---

## Reference: data shapes (already exported)

- `ReportSummary` (`@regis/backstage-plugin-regis-common`, re-exported from `../api/RegisApi`): `{ entityRef: string; status: 'ok' | 'error' | 'pending'; imageRef?: string; tier?: string | null; score?: number; byTag?: Record<string, number>; error?: string }`.
- `TrendBand`: `{ key: string; label: string; color: string }`. `unionLadder(playbooks)` (in `format.ts`) flattens playbook ladders to a best→worst `TrendBand[]`.
- `format.ts` exports `tierColor(tier, ladder)` and `scoreBarColor(score)`.
- `REGIS_ANNOTATION_PLAYBOOK_ID = 'regis.io/playbook-id'` (`@regis/backstage-plugin-regis-common`) — a playbook Resource's original playbook id (e.g. `default`), which equals the explorer's `playbook` facet value.
- The explorer is mounted at `/` and reads URL params `groupBy` + `playbook` (among `system|owner|playbook|tier`).

## File structure

- Create: `plugins/regis/src/components/rollup.ts` (+ `rollup.test.ts`) — pure per-set derivations.
- Create: `plugins/regis/src/components/PostureRollup.tsx` (+ `.test.tsx`) — reusable roll-up header.
- Modify: `plugins/regis/src/components/RegisImagePostureCard.tsx` (+ its test) — roll-up + sorted richer table + optional deep link.
- Modify: `plugins/regis/src/components/imageRelations.ts` — add `playbookExploreLink`.
- Modify: `plugins/regis/src/components/RegisRelatedImagesCards.tsx` (+ its test) — wire the playbook deep link.

---

## Task 1: Pure module `rollup.ts`

**Files:**
- Create: `plugins/regis/src/components/rollup.ts`
- Test: `plugins/regis/src/components/rollup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/rollup.test.ts`:

```ts
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import type { ReportSummary } from '../api/RegisApi';
import {
  tierRank,
  mix,
  worstTier,
  missingCount,
  sortSummariesWorstFirst,
} from './rollup';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#g' },
  { key: 'Silver', label: 'Silver', color: '#s' },
  { key: 'Bronze', label: 'Bronze', color: '#b' },
];

const row = (p: Partial<ReportSummary>): ReportSummary => ({
  entityRef: p.entityRef ?? 'resource:default/x',
  status: p.status ?? 'ok',
  imageRef: p.imageRef,
  tier: p.tier,
  score: p.score,
});

describe('tierRank', () => {
  it('maps tier key to its ladder index', () => {
    const r = tierRank(ladder);
    expect(r.get('Gold')).toBe(0);
    expect(r.get('Bronze')).toBe(2);
    expect(r.get('Nope')).toBeUndefined();
  });
});

describe('mix', () => {
  it('counts per tier in ladder order, untiered bucket last', () => {
    const rows = [
      row({ tier: 'Gold' }),
      row({ tier: 'Gold' }),
      row({ tier: 'Silver' }),
      row({ tier: 'Bronze' }),
      row({ status: 'pending', tier: null }),
    ];
    expect(mix(rows, ladder)).toEqual([
      { key: 'Gold', label: 'Gold', color: '#g', count: 2 },
      { key: 'Silver', label: 'Silver', color: '#s', count: 1 },
      { key: 'Bronze', label: 'Bronze', color: '#b', count: 1 },
      { key: 'untiered', label: 'untiered', color: '#c4c4c4', count: 1 },
    ]);
  });
  it('omits zero-count tiers and the untiered bucket when empty', () => {
    expect(mix([row({ tier: 'Gold' })], ladder)).toEqual([
      { key: 'Gold', label: 'Gold', color: '#g', count: 1 },
    ]);
  });
});

describe('worstTier', () => {
  it('returns the lowest-ranked tier present and its count', () => {
    const rows = [row({ tier: 'Gold' }), row({ tier: 'Bronze' }), row({ tier: 'Bronze' })];
    expect(worstTier(rows, ladder)).toEqual({ label: 'Bronze', count: 2 });
  });
  it('returns null when every laddered row is at the best tier', () => {
    expect(worstTier([row({ tier: 'Gold' }), row({ tier: 'Gold' })], ladder)).toBeNull();
  });
  it('returns null when no row has a laddered tier', () => {
    expect(worstTier([row({ status: 'pending', tier: null })], ladder)).toBeNull();
  });
});

describe('missingCount', () => {
  it('counts rows whose status is not ok', () => {
    const rows = [row({ status: 'ok' }), row({ status: 'pending' }), row({ status: 'error' })];
    expect(missingCount(rows)).toBe(2);
  });
});

describe('sortSummariesWorstFirst', () => {
  it('orders missing first, then worst tier, then lowest score; non-mutating', () => {
    const rows = [
      row({ entityRef: 'gold', tier: 'Gold', score: 95 }),
      row({ entityRef: 'silver', tier: 'Silver', score: 82 }),
      row({ entityRef: 'bronze', tier: 'Bronze', score: 55 }),
      row({ entityRef: 'missing', status: 'pending', tier: null }),
    ];
    const input = [...rows];
    const out = sortSummariesWorstFirst(rows, ladder);
    expect(out.map(r => r.entityRef)).toEqual(['missing', 'bronze', 'silver', 'gold']);
    expect(rows).toEqual(input); // input untouched
  });
  it('breaks ties within a tier by ascending score', () => {
    const rows = [
      row({ entityRef: 'hi', tier: 'Silver', score: 88 }),
      row({ entityRef: 'lo', tier: 'Silver', score: 80 }),
    ];
    expect(sortSummariesWorstFirst(rows, ladder).map(r => r.entityRef)).toEqual(['lo', 'hi']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/rollup.test.ts`
Expected: FAIL — `Cannot find module './rollup'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/rollup.ts`:

```ts
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import type { ReportSummary } from '../api/RegisApi';

/** Neutral color for images with no laddered tier (unknown tier or no report). */
const UNTIERED_COLOR = '#c4c4c4';

export interface MixEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

/** Tier key → ladder index (0 = best). */
export function tierRank(ladder: TrendBand[]): Map<string, number> {
  return new Map(ladder.map((b, i) => [b.key, i]));
}

/** Per-tier counts in ladder order, with a trailing "untiered" bucket. Zero-count entries omitted. */
export function mix(rows: ReportSummary[], ladder: TrendBand[]): MixEntry[] {
  const out: MixEntry[] = [];
  let laddered = 0;
  for (const b of ladder) {
    const count = rows.filter(r => r.tier === b.key).length;
    if (count > 0) out.push({ key: b.key, label: b.label, color: b.color, count });
    laddered += count;
  }
  const untiered = rows.length - laddered;
  if (untiered > 0) {
    out.push({ key: 'untiered', label: 'untiered', color: UNTIERED_COLOR, count: untiered });
  }
  return out;
}

/** Lowest-ranked tier present among laddered rows, or null when all are best / none laddered. */
export function worstTier(
  rows: ReportSummary[],
  ladder: TrendBand[],
): { label: string; count: number } | null {
  const rank = tierRank(ladder);
  let worst = -1;
  for (const r of rows) {
    const idx = r.tier ? rank.get(r.tier) : undefined;
    if (idx !== undefined && idx > worst) worst = idx;
  }
  if (worst <= 0) return null;
  const band = ladder[worst];
  const count = rows.filter(r => r.tier === band.key).length;
  return { label: band.label, count };
}

/** Rows with no usable report. */
export function missingCount(rows: ReportSummary[]): number {
  return rows.filter(r => r.status !== 'ok').length;
}

/** Worst-first ordering: missing/error first, then worst tier rank, then ascending score. Stable, non-mutating. */
export function sortSummariesWorstFirst(
  rows: ReportSummary[],
  ladder: TrendBand[],
): ReportSummary[] {
  const rank = tierRank(ladder);
  const missing = (r: ReportSummary) => (r.status !== 'ok' ? 0 : 1);
  const rnk = (r: ReportSummary) =>
    (r.tier ? rank.get(r.tier) : undefined) ?? Number.POSITIVE_INFINITY;
  const score = (r: ReportSummary) => r.score ?? Number.NEGATIVE_INFINITY;
  return [...rows].sort(
    (a, b) =>
      missing(a) - missing(b) || rnk(b) - rnk(a) || score(a) - score(b),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/rollup.ts plugins/regis/src/components/rollup.test.ts
git commit -m "feat(frontend): rollup.ts — per-set posture derivations"
```

---

## Task 2: `PostureRollup` component

**Files:**
- Create: `plugins/regis/src/components/PostureRollup.tsx`
- Test: `plugins/regis/src/components/PostureRollup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/PostureRollup.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import type { ReportSummary } from '../api/RegisApi';
import { PostureRollup } from './PostureRollup';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const row = (p: Partial<ReportSummary>): ReportSummary => ({
  entityRef: p.entityRef ?? 'resource:default/x',
  status: p.status ?? 'ok',
  tier: p.tier,
  score: p.score,
});

describe('PostureRollup', () => {
  it('shows counts, the worst tier, and the no-report count', () => {
    const rows = [
      row({ entityRef: 'a', tier: 'Gold' }),
      row({ entityRef: 'b', tier: 'Bronze' }),
      row({ entityRef: 'c', status: 'pending', tier: null }),
    ];
    render(<PostureRollup rows={rows} ladder={ladder} />);
    expect(screen.getByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    expect(screen.getByText(/Worst: Bronze · 1/)).toBeInTheDocument();
    expect(screen.getByText(/1 no report/)).toBeInTheDocument();
  });

  it('hides the worst indicator when all images are at the best tier', () => {
    render(<PostureRollup rows={[row({ tier: 'Gold' })]} ladder={ladder} />);
    expect(screen.queryByText(/Worst:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no report/)).not.toBeInTheDocument();
  });

  it('renders nothing for an empty set', () => {
    const { container } = render(<PostureRollup rows={[]} ladder={ladder} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureRollup.test.tsx`
Expected: FAIL — `Cannot find module './PostureRollup'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/PostureRollup.tsx`:

```tsx
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { Box, Typography } from '@material-ui/core';
import type { ReportSummary } from '../api/RegisApi';
import { mix, missingCount, worstTier } from './rollup';

/** Roll-up header: tier-mix bar + counts + worst tier + no-report count. */
export function PostureRollup(props: {
  rows: ReportSummary[];
  ladder: TrendBand[];
}) {
  const { rows, ladder } = props;
  if (rows.length === 0) return null;

  const entries = mix(rows, ladder);
  const worst = worstTier(rows, ladder);
  const missing = missingCount(rows);
  const total = rows.length;

  return (
    <Box mb={1.5}>
      <Box display="flex" height={14} borderRadius={4} overflow="hidden" mb={1}>
        {entries.map(e => (
          <Box
            key={e.key}
            height="100%"
            bgcolor={e.color}
            width={`${(e.count / total) * 100}%`}
            title={`${e.count} ${e.label}`}
          />
        ))}
      </Box>
      <Box display="flex" flexWrap="wrap" gridGap={14} alignItems="center">
        {entries.map(e => (
          <Typography key={e.key} variant="body2" component="span">
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 2,
                background: e.color,
                marginRight: 5,
              }}
            />
            {e.count} {e.label}
          </Typography>
        ))}
        {worst && (
          <Typography
            variant="caption"
            component="span"
            style={{ marginLeft: 'auto', fontWeight: 600 }}
          >
            Worst: {worst.label} · {worst.count}
          </Typography>
        )}
        {missing > 0 && (
          <Typography variant="caption" component="span" color="textSecondary">
            {missing} no report
          </Typography>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureRollup.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/PostureRollup.tsx plugins/regis/src/components/PostureRollup.test.tsx
git commit -m "feat(frontend): PostureRollup (tier-mix header)"
```

---

## Task 3: Enrich `RegisImagePostureCard`

**Files:**
- Modify (replace whole file): `plugins/regis/src/components/RegisImagePostureCard.tsx`
- Test (replace whole file): `plugins/regis/src/components/RegisImagePostureCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `plugins/regis/src/components/RegisImagePostureCard.test.tsx` with:

```tsx
import '@testing-library/jest-dom';
import { screen, within } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisImagePostureCard } from './RegisImagePostureCard';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
  { entityRef: 'resource:default/other', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/o:1' },
];

const playbooks = async () => ({
  playbooks: [
    {
      id: 'default',
      tiers: [
        { key: 'Gold', label: 'Gold', color: '#d4af37' },
        { key: 'Silver', label: 'Silver', color: '#9ca3af' },
        { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
      ],
    },
  ],
});

const renderCard = (props: { imageRefs: string[]; exploreLink?: string }) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            listReports: async () => summaries,
            getReport: async () => { throw new Error('not used'); },
            getPlaybooks: playbooks,
            getHistory: async () => { throw new Error('not used'); },
            getPortfolioTrend: async () => { throw new Error('not used'); },
          },
        ],
      ]}
    >
      <RegisImagePostureCard title="Images" {...props} />
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisImagePostureCard', () => {
  it('summarizes only the given images and rolls up the tier mix', async () => {
    renderCard({ imageRefs: ['resource:default/a', 'resource:default/b'] });
    expect(await screen.findByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    expect(screen.queryByText('r/o:1')).not.toBeInTheDocument();
  });

  it('sorts rows worst-first (Bronze before Gold)', async () => {
    renderCard({ imageRefs: ['resource:default/a', 'resource:default/b'] });
    const rows = await screen.findAllByText(/r\/[ab]:1/);
    expect(rows[0]).toHaveTextContent('r/b:1'); // Bronze first
    expect(rows[1]).toHaveTextContent('r/a:1'); // Gold second
  });

  it('shows the explorer deep link only when provided', async () => {
    renderCard({
      imageRefs: ['resource:default/a'],
      exploreLink: '/?groupBy=playbook&playbook=default',
    });
    const link = await screen.findByText('View in explorer');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      '/?groupBy=playbook&playbook=default',
    );
  });

  it('omits the deep link when not provided', async () => {
    renderCard({ imageRefs: ['resource:default/a'] });
    await screen.findByText('r/a:1');
    expect(screen.queryByText('View in explorer')).not.toBeInTheDocument();
  });

  it('shows an empty state when none of the given images have a report', async () => {
    renderCard({ imageRefs: ['resource:default/missing'] });
    expect(await screen.findByText(/No Regis-tracked images/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisImagePostureCard.test.tsx`
Expected: FAIL — the current card has no `1 Gold` rollup text / no `View in explorer` link / different sort.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `plugins/regis/src/components/RegisImagePostureCard.tsx` with:

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
import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { scoreBarColor, tierColor, unionLadder } from './format';
import { sortSummariesWorstFirst } from './rollup';
import { PostureRollup } from './PostureRollup';

function makeColumns(ladder: TrendBand[]): TableColumn<ReportSummary>[] {
  return [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => (
        <EntityRefLink entityRef={row.entityRef}>
          {row.imageRef ?? row.entityRef}
        </EntityRefLink>
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
            <div style={{ width: 64, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${row.score}%`, height: '100%', background: scoreBarColor(row.score) }} />
            </div>
          )}
        </Box>
      ),
    },
  ];
}

/** Posture summary of a given set of image entityRefs (shared by the service and playbook cards). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
  exploreLink?: string;
}) {
  const { title, imageRefs, exploreLink } = props;
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );

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

  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);
  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
  }

  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  return (
    <InfoCard title={title} deepLink={deepLink}>
      <PostureRollup rows={rows} ladder={ladder} />
      <Table
        columns={makeColumns(ladder)}
        data={sortSummariesWorstFirst(rows, ladder)}
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

> Note: this removes the old `distribution()` subheader helper — the tier mix now
> lives in `PostureRollup`. If anything else in the repo imported `distribution`
> from this file, it didn't (it was file-private), so deletion is safe.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisImagePostureCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisImagePostureCard.tsx plugins/regis/src/components/RegisImagePostureCard.test.tsx
git commit -m "feat(frontend): roll-up header + worst-first table + deep link in RegisImagePostureCard"
```

---

## Task 4: Wire the playbook deep link

**Files:**
- Modify: `plugins/regis/src/components/imageRelations.ts`
- Modify: `plugins/regis/src/components/RegisRelatedImagesCards.tsx`
- Test: `plugins/regis/src/components/imageRelations.test.ts` (append) and `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (helper)**

Append to `plugins/regis/src/components/imageRelations.test.ts` (create the file if it does not exist, with the import line):

```ts
import { playbookExploreLink } from './imageRelations';

describe('playbookExploreLink', () => {
  it('builds an explorer link scoped to the playbook id', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'regis-playbook-default', annotations: { 'regis.io/playbook-id': 'default' } },
      spec: { type: 'regis-playbook' },
    } as any;
    expect(playbookExploreLink(entity)).toBe('/?groupBy=playbook&playbook=default');
  });
  it('returns undefined when the playbook id annotation is absent', () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'p' },
      spec: { type: 'regis-playbook' },
    } as any;
    expect(playbookExploreLink(entity)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/imageRelations.test.ts`
Expected: FAIL — `playbookExploreLink` is not exported.

- [ ] **Step 3: Write the implementation (helper)**

In `plugins/regis/src/components/imageRelations.ts`, add the import and the function (append at the end):

```ts
import { REGIS_ANNOTATION_PLAYBOOK_ID } from '@regis/backstage-plugin-regis-common';

/** Explorer route scoped to a playbook entity's id, or undefined when unknown. */
export function playbookExploreLink(entity: Entity): string | undefined {
  const id = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK_ID];
  return id ? `/?groupBy=playbook&playbook=${encodeURIComponent(id)}` : undefined;
}
```

(The `Entity` type is already imported at the top of `imageRelations.ts`.)

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/imageRelations.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (card wiring)**

Add these two tests inside `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx` (reuse the existing `renderWith`, `api`, and `summaries`; the playbook entity must carry the relation `dependencyOf` to the image and the `regis.io/playbook-id` annotation):

```tsx
  it('playbook card links to the explorer scoped by playbook id', async () => {
    const playbook = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'regis-playbook-default', annotations: { 'regis.io/playbook-id': 'default' } },
      spec: { type: 'regis-playbook' },
      relations: [{ type: 'dependencyOf', targetRef: 'resource:default/img-a' }],
    } as any;
    renderWith(playbook, <RegisPlaybookImagesCard />);
    const link = await screen.findByText('View in explorer');
    expect(link.closest('a')).toHaveAttribute('href', '/?groupBy=playbook&playbook=default');
  });

  it('service card shows no explorer link', async () => {
    const service = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'svc' },
      spec: { type: 'service' },
      relations: [{ type: 'dependsOn', targetRef: 'resource:default/img-a' }],
    } as any;
    renderWith(service, <RegisServiceImagesCard />);
    await screen.findByText('r/a:1');
    expect(screen.queryByText('View in explorer')).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`
Expected: FAIL — the playbook card renders no `View in explorer` link yet.

- [ ] **Step 7: Write the implementation (card wiring)**

Replace the entire contents of `plugins/regis/src/components/RegisRelatedImagesCards.tsx` with:

```tsx
import { useEntity } from '@backstage/plugin-catalog-react';
import { RegisImagePostureCard } from './RegisImagePostureCard';
import { imageRefsFromRelations, playbookExploreLink } from './imageRelations';

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
      exploreLink={playbookExploreLink(entity)}
    />
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add plugins/regis/src/components/imageRelations.ts plugins/regis/src/components/imageRelations.test.ts plugins/regis/src/components/RegisRelatedImagesCards.tsx plugins/regis/src/components/RegisRelatedImagesCards.test.tsx
git commit -m "feat(frontend): playbook card deep-links into the scoped explorer"
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
Expected: no errors. Fix any unused-import (e.g. a stray `Typography`) or `gridGap` issues flagged in the touched files.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(frontend): lint/typecheck fixes for service/playbook cards"
```

---

## Open question (carry into review, not a blocker)

The playbook deep link uses `regis.io/playbook-id` → `/?groupBy=playbook&playbook=<id>`. This matches how the explorer `playbook` facet is valued in the demo (playbook ids `default` / `pci-dss`). Verify against a running app that the facet value equals the playbook id; if a deployment sanitises it differently, adjust `playbookExploreLink`.
