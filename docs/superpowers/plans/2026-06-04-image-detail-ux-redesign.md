# Image detail UX redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the per-image catalog detail view (overview scorecard + Regis tab) into an actionable posture report: rich scorecard, playbook attribution, a "path to the next tier" module, and a failures-first filterable rule table.

**Architecture:** Frontend-only changes in `plugins/regis`. All "what blocks the next tier / what's failing / category scores" logic lives in one pure, React-free module (`posture.ts`) that is unit-tested exhaustively. The Regis tab is split into three focused presentational components (`PostureSummary`, `NextTierPath`, `RuleTable`) orchestrated by a slimmed `RegisTabContent`. Everything derives from data the report already carries — no backend, router, or schema change.

**Tech Stack:** TypeScript, React, Backstage new-frontend-system, Material-UI v4 (`@material-ui/core`), `@backstage/core-components` (`InfoCard`, `Table`, `Progress`, `ResponseErrorPanel`), Jest + `@backstage/frontend-test-utils` + `@testing-library/react`.

**Test runner (this repo):** `backstage-cli` is not on PATH via yarn. Run tests with the binary directly:
`node_modules/.bin/backstage-cli repo test --watch=false <path>`

---

## Reference: data shapes (already exported from `@regis/backstage-plugin-regis-common`)

- `ReportEnvelope = { report: Report; meta: {...} }` — returned by `api.getReport(ref)`.
- `Report.tier?: string | null`
- `Report.rules?: { slug; description; level?: string; tags?: string[]; passed: boolean; status: 'passed'|'failed'|'incomplete'; message: string }[]`
- `Report.rules_summary?: { score?: number; total?: string[]; passed?: string[]; by_tag?: { [tag]: { rules: string[]; passed_rules: string[]; score: number } } }`
- `Report.badges?: { scope: string; value?: string|null; class: 'success'|'warning'|'error'|'information'; label?: string }[]`
- `Report.playbooks?: { playbook_name: string; playbook_version?: string|null }[]`
- `Report.request: { repository: string; tag: string; timestamp: string; ... }`
- `PlaybooksResponse = { playbooks: PlaybookLadder[] }`, `PlaybookLadder = { id: string; tiers: TrendBand[] }`, `TrendBand = { key: string; label: string; color: string }`. **`tiers` is ordered best→worst.**
- `api.getPlaybooks(): Promise<PlaybooksResponse>` and `unionLadder(playbooks)` (in `format.ts`) flatten ladders to a `TrendBand[]`.

---

## File structure

- Create: `plugins/regis/src/components/posture.ts` — pure derivation (no React).
- Create: `plugins/regis/src/components/posture.test.ts`
- Create: `plugins/regis/src/components/PostureSummary.tsx` + `.test.tsx`
- Create: `plugins/regis/src/components/NextTierPath.tsx` + `.test.tsx`
- Create: `plugins/regis/src/components/RuleTable.tsx` + `.test.tsx`
- Modify: `plugins/regis/src/components/RegisScorecardCard.tsx` (+ existing `.test.tsx`)
- Modify: `plugins/regis/src/components/RegisTabContent.tsx` (+ new `.test.tsx`)
- Modify: `plugins/regis/src/components/format.ts` (add `badgeClassColor`)

---

## Task 1: Pure derivation module `posture.ts`

**Files:**
- Create: `plugins/regis/src/components/posture.ts`
- Test: `plugins/regis/src/components/posture.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/posture.test.ts`:

```ts
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import {
  nextTier,
  blockingRules,
  tierProgress,
  countByStatus,
  categoryScores,
  sortRulesForTable,
  type Rule,
} from './posture';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const rule = (p: Partial<Rule>): Rule => ({
  slug: p.slug ?? 's',
  description: p.description ?? 'd',
  level: p.level,
  tags: p.tags,
  passed: p.status === 'passed',
  status: p.status ?? 'failed',
  message: p.message ?? 'm',
});

describe('nextTier', () => {
  it('returns the tier just above the current one', () => {
    expect(nextTier(ladder, 'Silver')).toBe('Gold');
  });
  it('returns null at the top tier', () => {
    expect(nextTier(ladder, 'Gold')).toBeNull();
  });
  it('aims for the lowest rung when untiered', () => {
    expect(nextTier(ladder, null)).toBe('Bronze');
  });
  it('returns null for an unknown tier', () => {
    expect(nextTier(ladder, 'Platinum')).toBeNull();
  });
  it('returns null for an empty ladder', () => {
    expect(nextTier([], 'Silver')).toBeNull();
  });
});

describe('blockingRules', () => {
  it('returns failed/incomplete rules whose level is the next tier', () => {
    const rules = [
      rule({ slug: 'a', level: 'Gold', status: 'failed' }),
      rule({ slug: 'b', level: 'Gold', status: 'incomplete' }),
      rule({ slug: 'c', level: 'Gold', status: 'passed' }),
      rule({ slug: 'd', level: 'Silver', status: 'failed' }),
    ];
    expect(blockingRules(rules, 'Gold').map(r => r.slug)).toEqual(['a', 'b']);
  });
  it('returns nothing when there is no next tier', () => {
    expect(blockingRules([rule({ level: 'Gold' })], null)).toEqual([]);
  });
});

describe('tierProgress', () => {
  it('counts satisfied vs required rules for the next tier', () => {
    const rules = [
      rule({ level: 'Gold', status: 'passed' }),
      rule({ level: 'Gold', status: 'failed' }),
      rule({ level: 'Gold', status: 'incomplete' }),
      rule({ level: 'Silver', status: 'passed' }),
    ];
    expect(tierProgress(rules, 'Gold')).toEqual({ satisfied: 1, required: 3 });
  });
  it('is zero/zero when there is no next tier', () => {
    expect(tierProgress([rule({})], null)).toEqual({ satisfied: 0, required: 0 });
  });
});

describe('countByStatus', () => {
  it('tallies the three states', () => {
    const rules = [
      rule({ status: 'passed' }),
      rule({ status: 'passed' }),
      rule({ status: 'failed' }),
      rule({ status: 'incomplete' }),
    ];
    expect(countByStatus(rules)).toEqual({ passed: 2, failed: 1, incomplete: 1 });
  });
});

describe('categoryScores', () => {
  it('maps by_tag to sorted worst-first entries', () => {
    const out = categoryScores({
      by_tag: {
        security: { rules: ['a', 'b'], passed_rules: ['a'], score: 50 },
        hygiene: { rules: ['c'], passed_rules: ['c'], score: 90 },
      },
    });
    expect(out).toEqual([
      { tag: 'security', score: 50, total: 2, passed: 1 },
      { tag: 'hygiene', score: 90, total: 1, passed: 1 },
    ]);
  });
  it('returns [] when by_tag is absent', () => {
    expect(categoryScores(undefined)).toEqual([]);
    expect(categoryScores({})).toEqual([]);
  });
});

describe('sortRulesForTable', () => {
  it('orders failures before passes, then worst category first', () => {
    const scores = categoryScores({
      by_tag: {
        security: { rules: [], passed_rules: [], score: 40 },
        hygiene: { rules: [], passed_rules: [], score: 90 },
      },
    });
    const rules = [
      rule({ slug: 'pass-sec', tags: ['security'], status: 'passed' }),
      rule({ slug: 'fail-hyg', tags: ['hygiene'], status: 'failed' }),
      rule({ slug: 'fail-sec', tags: ['security'], status: 'failed' }),
    ];
    expect(sortRulesForTable(rules, scores).map(r => r.slug)).toEqual([
      'fail-sec',
      'fail-hyg',
      'pass-sec',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/posture.test.ts`
Expected: FAIL — `Cannot find module './posture'`.

- [ ] **Step 3: Write the minimal implementation**

Create `plugins/regis/src/components/posture.ts`:

```ts
import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';

export type Rule = NonNullable<Report['rules']>[number];
export type RulesSummary = NonNullable<Report['rules_summary']>;

export interface CategoryScore {
  tag: string;
  score: number;
  total: number;
  passed: number;
}
export interface TierProgress {
  satisfied: number;
  required: number;
}
export interface StatusCounts {
  passed: number;
  failed: number;
  incomplete: number;
}

/**
 * The tier one rung above `currentTier` in a best→worst ladder, or null when
 * already at the top, when the tier is unknown, or when the ladder is empty.
 * An untiered image (no current tier) aims for the lowest rung.
 */
export function nextTier(
  ladder: TrendBand[],
  currentTier: string | null | undefined,
): string | null {
  if (ladder.length === 0) return null;
  if (!currentTier) return ladder[ladder.length - 1].key;
  const i = ladder.findIndex(
    t => t.key === currentTier || t.label === currentTier,
  );
  if (i <= 0) return null;
  return ladder[i - 1].key;
}

/** Failed/incomplete rules attached to the next tier — what blocks promotion. */
export function blockingRules(
  rules: Rule[],
  nextTierName: string | null,
): Rule[] {
  if (!nextTierName) return [];
  return rules.filter(r => r.status !== 'passed' && r.level === nextTierName);
}

/** Satisfied vs required rule counts for the next tier (drives the gauge). */
export function tierProgress(
  rules: Rule[],
  nextTierName: string | null,
): TierProgress {
  if (!nextTierName) return { satisfied: 0, required: 0 };
  const required = rules.filter(r => r.level === nextTierName);
  const satisfied = required.filter(r => r.status === 'passed').length;
  return { satisfied, required: required.length };
}

export function countByStatus(rules: Rule[]): StatusCounts {
  const c: StatusCounts = { passed: 0, failed: 0, incomplete: 0 };
  for (const r of rules) {
    if (r.status === 'passed') c.passed++;
    else if (r.status === 'incomplete') c.incomplete++;
    else c.failed++;
  }
  return c;
}

/** `by_tag` → entries sorted worst-score-first (ties broken alphabetically). */
export function categoryScores(
  summary: RulesSummary | undefined,
): CategoryScore[] {
  const byTag = summary?.by_tag;
  if (!byTag) return [];
  return Object.entries(byTag)
    .map(([tag, g]) => ({
      tag,
      score: g.score,
      total: g.rules.length,
      passed: g.passed_rules.length,
    }))
    .sort((a, b) => a.score - b.score || a.tag.localeCompare(b.tag));
}

/**
 * Default table order: failed/incomplete before passed, then worst category
 * first (a rule's category rank is its best-ranked — i.e. worst-scoring — tag).
 */
export function sortRulesForTable(
  rules: Rule[],
  scores: CategoryScore[],
): Rule[] {
  const rank = new Map(scores.map((s, i) => [s.tag, i]));
  const catRank = (r: Rule) => {
    let best = Number.POSITIVE_INFINITY;
    for (const t of r.tags ?? []) {
      const idx = rank.get(t);
      if (idx !== undefined) best = Math.min(best, idx);
    }
    return best;
  };
  const statusRank = (r: Rule) => (r.status === 'passed' ? 1 : 0);
  return [...rules].sort(
    (a, b) => statusRank(a) - statusRank(b) || catRank(a) - catRank(b),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/posture.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/posture.ts plugins/regis/src/components/posture.test.ts
git commit -m "feat(frontend): posture.ts — pure tier/rule derivation"
```

---

## Task 2: `badgeClassColor` helper in `format.ts`

**Files:**
- Modify: `plugins/regis/src/components/format.ts`
- Test: `plugins/regis/src/components/format.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

Append to (or create) `plugins/regis/src/components/format.test.ts`:

```ts
import { badgeClassColor } from './format';

describe('badgeClassColor', () => {
  it('maps each badge class to a color', () => {
    expect(badgeClassColor('success')).toBe('#1e7d34');
    expect(badgeClassColor('warning')).toBe('#a86700');
    expect(badgeClassColor('error')).toBe('#c0392b');
    expect(badgeClassColor('information')).toBe('#1565c0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts`
Expected: FAIL — `badgeClassColor is not a function` / not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `plugins/regis/src/components/format.ts`:

```ts
/** Color for a report badge `class`, matching the report's semantic palette. */
export function badgeClassColor(
  cls: 'success' | 'warning' | 'error' | 'information',
): string {
  switch (cls) {
    case 'success':
      return '#1e7d34';
    case 'warning':
      return '#a86700';
    case 'error':
      return '#c0392b';
    default:
      return '#1565c0';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/format.ts plugins/regis/src/components/format.test.ts
git commit -m "feat(frontend): badgeClassColor helper"
```

---

## Task 3: Redesign `RegisScorecardCard`

**Files:**
- Modify: `plugins/regis/src/components/RegisScorecardCard.tsx`
- Test: `plugins/regis/src/components/RegisScorecardCard.test.tsx` (exists — extend)

- [ ] **Step 1: Write the failing test**

Replace the body of `plugins/regis/src/components/RegisScorecardCard.test.tsx` with:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisScorecardCard } from './RegisScorecardCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'svc',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const playbooks = {
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
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisScorecardCard', () => {
  it('shows score, tier chip in ladder color, next-tier hint, badges, counts and playbook footnote', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
          badges: [
            { scope: 'security', value: 'B', class: 'warning' },
            { scope: 'hygiene', value: 'A', class: 'success' },
          ],
          rules: [
            { slug: 'g1', description: 'd', level: 'Gold', passed: true, status: 'passed', message: '' },
            { slug: 'g2', description: 'd', level: 'Gold', passed: false, status: 'failed', message: '' },
            { slug: 'g3', description: 'd', level: 'Gold', passed: false, status: 'incomplete', message: '' },
          ],
          rules_summary: { score: 73, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });

    expect(await screen.findByText('73')).toBeInTheDocument();
    const chip = (await screen.findByText('Silver')).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#9ca3af' });
    // next tier = Gold, 2 of 3 Gold rules still failing/incomplete
    expect(await screen.findByText(/2 rules left for Gold/i)).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('hygiene')).toBeInTheDocument();
    expect(screen.getByText(/via base-image-policy/i)).toBeInTheDocument();
  });

  it('shows the top-tier state with no next-tier hint', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Gold',
          rules: [],
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });
    expect(await screen.findByText(/Top tier/i)).toBeInTheDocument();
    expect(screen.queryByText(/rules left for/i)).not.toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    await renderCard({
      getReport: async () => {
        throw new Error('boom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisScorecardCard.test.tsx`
Expected: FAIL — "2 rules left for Gold" / badges / footnote not found.

- [ ] **Step 3: Write the implementation**

Replace `plugins/regis/src/components/RegisScorecardCard.tsx` with:

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
import { Box, Chip, Typography } from '@material-ui/core';
import { regisApiRef } from '../api/RegisApi';
import { badgeClassColor, tierColor, unionLadder } from './format';
import { countByStatus, nextTier, tierProgress } from './posture';

/** Compact circular score gauge filled to next-tier rule satisfaction. */
function Gauge(props: { score: number; ratio: number; color: string }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, props.ratio)));
  return (
    <Box position="relative" width={96} height={96} flex="none">
      <svg viewBox="0 0 100 100" width={96} height={96}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eee" strokeWidth={9} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={props.color}
          strokeWidth={9}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <Box position="absolute" top={0} left={0} right={0} bottom={0}
        display="flex" alignItems="center" justifyContent="center">
        <Typography variant="h5" component="span">{props.score}</Typography>
      </Box>
    </Box>
  );
}

/** Overview posture card: gauge + tier + next-tier hint + domain badges + counts. */
export function RegisScorecardCard() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);

  const { value, loading, error } = useAsync(
    () => Promise.all([api.getReport(ref), api.getPlaybooks()]),
    [ref],
  );

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const [envelope, playbooksResp] = value!;
  const report = envelope.report;
  const ladder = unionLadder(playbooksResp.playbooks);
  const rules = report.rules ?? [];
  const score = report.rules_summary?.score ?? 0;
  const counts = countByStatus(rules);
  const next = nextTier(ladder, report.tier);
  const progress = tierProgress(rules, next);
  const ratio = progress.required > 0 ? progress.satisfied / progress.required : 1;
  const remaining = progress.required - progress.satisfied;
  const playbookName = report.playbooks?.[0]?.playbook_name;

  return (
    <InfoCard title="Regis posture">
      <Box display="flex" gridGap={18} alignItems="center" mb={1.5}>
        <Gauge score={score} ratio={ratio} color={tierColor(report.tier, ladder)} />
        <Box>
          {report.tier && (
            <Chip
              size="small"
              label={report.tier}
              style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
            />
          )}
          <Typography variant="body2" color="textSecondary" component="div">
            {next
              ? `${remaining} rules left for ${next}`
              : 'Top tier — maintained'}
          </Typography>
          <Typography variant="body2" component="div">
            {counts.passed} passed · {counts.failed} failed · {counts.incomplete} incomplete
          </Typography>
        </Box>
      </Box>
      {(report.badges?.length ?? 0) > 0 && (
        <Box display="flex" flexWrap="wrap" gridGap={6} mb={1}>
          {report.badges!.map(b => (
            <Chip
              key={b.scope}
              size="small"
              label={`${b.scope}${b.value ? ` · ${b.value}` : ''}`}
              style={{ backgroundColor: badgeClassColor(b.class), color: '#fff' }}
            />
          ))}
        </Box>
      )}
      {playbookName && (
        <Typography variant="caption" color="textSecondary">
          via {playbookName}
        </Typography>
      )}
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisScorecardCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisScorecardCard.tsx plugins/regis/src/components/RegisScorecardCard.test.tsx
git commit -m "feat(frontend): redesign RegisScorecardCard (gauge + next-tier + badges)"
```

---

## Task 4: `PostureSummary` component

**Files:**
- Create: `plugins/regis/src/components/PostureSummary.tsx`
- Test: `plugins/regis/src/components/PostureSummary.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/PostureSummary.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { PostureSummary } from './PostureSummary';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const report = {
  schemaVersion: 1,
  tier: 'Silver',
  playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
  request: { repository: 'library/nginx', tag: '1.25', timestamp: '2026-06-04T00:00:00Z' },
  rules_summary: {
    score: 73,
    by_tag: {
      security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
      hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
    },
  },
} as any;

describe('PostureSummary', () => {
  it('renders repo:tag, tier, score, playbook attribution and category bars', () => {
    render(<PostureSummary report={report} ladder={ladder} />);
    expect(screen.getByText('library/nginx:1.25')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText(/73/)).toBeInTheDocument();
    expect(screen.getByText('base-image-policy')).toBeInTheDocument();
    expect(screen.getByText(/v2\.3/)).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('hygiene')).toBeInTheDocument();
  });

  it('omits category bars when by_tag is absent', () => {
    render(
      <PostureSummary
        report={{ ...report, rules_summary: { score: 50 } } as any}
        ladder={ladder}
      />,
    );
    expect(screen.queryByText('security')).not.toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureSummary.test.tsx`
Expected: FAIL — `Cannot find module './PostureSummary'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/PostureSummary.tsx`:

```tsx
import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';
import { InfoCard } from '@backstage/core-components';
import { Box, Chip, Typography } from '@material-ui/core';
import { tierColor } from './format';
import { categoryScores } from './posture';

function barColor(score: number): string {
  if (score >= 90) return '#1e7d34';
  if (score >= 60) return '#e6a700';
  return '#c0392b';
}

/** Header card for the Regis tab: identity, tier, score, attribution, by-tag bars. */
export function PostureSummary(props: { report: Report; ladder: TrendBand[] }) {
  const { report, ladder } = props;
  const cats = categoryScores(report.rules_summary);
  const score = report.rules_summary?.score;
  const pb = report.playbooks?.[0];
  const tierNames = ladder.map(t => t.label).join(' → ');

  return (
    <InfoCard>
      <Box display="flex" alignItems="center" gridGap={12}>
        <Typography variant="h6" component="span">
          {report.request.repository}:{report.request.tag}
        </Typography>
        {report.tier && (
          <Chip
            size="small"
            label={report.tier}
            style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
          />
        )}
        {score !== undefined && (
          <Typography variant="h6" component="span" style={{ marginLeft: 'auto' }}>
            {score}/100
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="textSecondary" component="div" style={{ margin: '6px 0 14px' }}>
        {pb ? (
          <>
            Evaluated by playbook <strong>{pb.playbook_name}</strong>
            {pb.playbook_version ? ` v${pb.playbook_version}` : ''}
          </>
        ) : (
          'Playbook unknown'
        )}
        {ladder.length > 0 ? ` · ladder: ${tierNames}` : ''}
      </Typography>

      {cats.length > 0 && (
        <Box display="grid" gridTemplateColumns="1fr 1fr" gridGap="10px 24px">
          {cats.map(c => (
            <Box key={c.tag}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="caption">{c.tag}</Typography>
                <Typography variant="caption">{c.score}%</Typography>
              </Box>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: '#eee',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${c.score}%`,
                    height: '100%',
                    background: barColor(c.score),
                  }}
                />
              </div>
            </Box>
          ))}
        </Box>
      )}
    </InfoCard>
  );
}
```

> A plain `<div>` bar is used instead of MUI v4 `LinearProgress` because per-bar
> fill color is awkward to theme on `LinearProgress` in v4; the `<div>` gives a
> deterministic color from `barColor`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureSummary.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/PostureSummary.tsx plugins/regis/src/components/PostureSummary.test.tsx
git commit -m "feat(frontend): PostureSummary (header + attribution + category bars)"
```

---

## Task 5: `NextTierPath` component

**Files:**
- Create: `plugins/regis/src/components/NextTierPath.tsx`
- Test: `plugins/regis/src/components/NextTierPath.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/NextTierPath.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { NextTierPath } from './NextTierPath';
import type { Rule } from './posture';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
];

const rules: Rule[] = [
  { slug: 'a', description: 'Run as non-root', level: 'Gold', passed: false, status: 'failed', message: 'no USER' },
  { slug: 'b', description: 'Provenance verified', level: 'Gold', passed: false, status: 'incomplete', message: 'cosign offline' },
  { slug: 'c', description: 'Passing gold rule', level: 'Gold', passed: true, status: 'passed', message: '' },
];

describe('NextTierPath', () => {
  it('lists blocking rules for the next tier with an investigate marker for incompletes', () => {
    render(<NextTierPath rules={rules} tier="Silver" ladder={ladder} />);
    expect(screen.getByText(/Path to Gold/i)).toBeInTheDocument();
    expect(screen.getByText('Run as non-root')).toBeInTheDocument();
    expect(screen.getByText('Provenance verified')).toBeInTheDocument();
    expect(screen.getByText(/investigate/i)).toBeInTheDocument();
    expect(screen.queryByText('Passing gold rule')).not.toBeInTheDocument();
  });

  it('shows the maintained state at the top tier', () => {
    render(<NextTierPath rules={[]} tier="Gold" ladder={ladder} />);
    expect(screen.getByText(/Top tier/i)).toBeInTheDocument();
  });

  it('renders nothing when the ladder is unknown', () => {
    const { container } = render(<NextTierPath rules={rules} tier="Silver" ladder={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/NextTierPath.test.tsx`
Expected: FAIL — `Cannot find module './NextTierPath'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/NextTierPath.tsx`:

```tsx
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { InfoCard, StatusError, StatusWarning } from '@backstage/core-components';
import { List, ListItem, ListItemIcon, ListItemText } from '@material-ui/core';
import { blockingRules, nextTier, type Rule } from './posture';

/** Actionable "what blocks the next tier" checklist, or a top-tier state. */
export function NextTierPath(props: {
  rules: Rule[];
  tier: string | null | undefined;
  ladder: TrendBand[];
}) {
  const { rules, tier, ladder } = props;
  if (ladder.length === 0) return null;

  const next = nextTier(ladder, tier);
  if (!next) {
    return <InfoCard title="Top tier — posture maintained" />;
  }

  const blocking = blockingRules(rules, next);
  return (
    <InfoCard title={`Path to ${next}`}>
      <List dense>
        {blocking.map(r => (
          <ListItem key={r.slug}>
            <ListItemIcon>
              {r.status === 'incomplete' ? <StatusWarning /> : <StatusError />}
            </ListItemIcon>
            <ListItemText
              primary={r.description}
              secondary={
                r.status === 'incomplete' ? `To investigate — ${r.message}` : r.message
              }
            />
          </ListItem>
        ))}
      </List>
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/NextTierPath.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/NextTierPath.tsx plugins/regis/src/components/NextTierPath.test.tsx
git commit -m "feat(frontend): NextTierPath (promotion checklist)"
```

---

## Task 6: `RuleTable` component

**Files:**
- Create: `plugins/regis/src/components/RuleTable.tsx`
- Test: `plugins/regis/src/components/RuleTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RuleTable.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { RuleTable } from './RuleTable';
import type { Rule } from './posture';

const rules: Rule[] = [
  { slug: 'fail-sec', description: 'Run as non-root', tags: ['security'], level: 'Gold', passed: false, status: 'failed', message: 'no USER' },
  { slug: 'inc-sup', description: 'Provenance', tags: ['supply-chain'], level: 'Silver', passed: false, status: 'incomplete', message: 'offline' },
  { slug: 'pass-hyg', description: 'Pinned base', tags: ['hygiene'], level: 'Bronze', passed: true, status: 'passed', message: 'ok' },
];

describe('RuleTable', () => {
  it('hides passing rules by default and reveals them via the toggle', async () => {
    await renderInTestApp(<RuleTable rules={rules} />);
    expect(await screen.findByText('Run as non-root')).toBeInTheDocument();
    expect(screen.getByText('Provenance')).toBeInTheDocument();
    expect(screen.queryByText('Pinned base')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/show passing/i));
    expect(await screen.findByText('Pinned base')).toBeInTheDocument();
  });

  it('renders failures before passes by default order', async () => {
    await renderInTestApp(<RuleTable rules={rules} />);
    const rows = await screen.findAllByText(/Run as non-root|Provenance/);
    expect(rows[0]).toHaveTextContent('Run as non-root');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RuleTable.test.tsx`
Expected: FAIL — `Cannot find module './RuleTable'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/RuleTable.tsx`:

```tsx
import { useState } from 'react';
import { Table, type TableColumn, StatusError, StatusOK, StatusWarning } from '@backstage/core-components';
import { FormControlLabel, Switch } from '@material-ui/core';
import { categoryScores, sortRulesForTable, type Rule, type RulesSummary } from './posture';

function StatusCell(props: { rule: Rule }) {
  const s = props.rule.status;
  if (s === 'passed') return <StatusOK />;
  if (s === 'incomplete') return <StatusWarning />;
  return <StatusError />;
}

const columns: TableColumn<Rule>[] = [
  { title: 'Status', field: 'status', width: '90px', render: r => <StatusCell rule={r} /> },
  { title: 'Rule', field: 'description' },
  { title: 'Category', field: 'tags', render: r => (r.tags ?? []).join(', ') },
  { title: 'Priority', field: 'level', render: r => r.level ?? '—' },
  { title: 'Detail', field: 'message' },
];

/** Filterable rule table: failures-first by default, passing hidden until toggled. */
export function RuleTable(props: { rules: Rule[]; rulesSummary?: RulesSummary }) {
  const [showPassing, setShowPassing] = useState(false);
  const scores = categoryScores(props.rulesSummary);
  const ordered = sortRulesForTable(props.rules, scores);
  const data = showPassing ? ordered : ordered.filter(r => r.status !== 'passed');

  return (
    <Table
      title="Rules"
      columns={columns}
      data={data}
      options={{ search: true, paging: data.length > 15, pageSize: 15, padding: 'dense' }}
      components={{
        Toolbar: () => (
          <FormControlLabel
            style={{ margin: 8 }}
            control={
              <Switch
                checked={showPassing}
                onChange={e => setShowPassing(e.target.checked)}
                inputProps={{ 'aria-label': 'show passing rules' }}
              />
            }
            label="Show passing rules"
          />
        ),
      }}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RuleTable.test.tsx`
Expected: PASS (2 tests). If the custom `Toolbar` hides the built-in search, that is acceptable — the tests do not rely on search.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RuleTable.tsx plugins/regis/src/components/RuleTable.test.tsx
git commit -m "feat(frontend): RuleTable (failures-first, passing toggle)"
```

---

## Task 7: Restructure `RegisTabContent` to orchestrate

**Files:**
- Modify: `plugins/regis/src/components/RegisTabContent.tsx`
- Test: `plugins/regis/src/components/RegisTabContent.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisTabContent.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisTabContent } from './RegisTabContent';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'img',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const render = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisTabContent />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisTabContent', () => {
  it('renders the summary, the next-tier path and the rule table', async () => {
    await render({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
          request: { repository: 'library/nginx', tag: '1.25', timestamp: '2026-06-04T00:00:00Z' },
          rules: [
            { slug: 'a', description: 'Run as non-root', tags: ['security'], level: 'Gold', passed: false, status: 'failed', message: 'no USER' },
          ],
          rules_summary: { score: 73, by_tag: { security: { rules: ['a'], passed_rules: [], score: 0 } } },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({
        playbooks: [
          { id: 'default', tiers: [
            { key: 'Gold', label: 'Gold', color: '#d4af37' },
            { key: 'Silver', label: 'Silver', color: '#9ca3af' },
          ] },
        ],
      }),
    });

    expect(await screen.findByText('library/nginx:1.25')).toBeInTheDocument();
    expect(await screen.findByText(/Path to Gold/i)).toBeInTheDocument();
    expect(await screen.findByText('Run as non-root')).toBeInTheDocument();
  });

  it('renders an error panel when the report fails to load', async () => {
    await render({
      getReport: async () => {
        throw new Error('kaboom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/kaboom/)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTabContent.test.tsx`
Expected: FAIL — the current `RegisTabContent` renders tag-grouped lists, so "Path to Gold" is absent.

- [ ] **Step 3: Write the implementation**

Replace `plugins/regis/src/components/RegisTabContent.tsx` with:

```tsx
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Box } from '@material-ui/core';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';
import { PostureSummary } from './PostureSummary';
import { NextTierPath } from './NextTierPath';
import { RuleTable } from './RuleTable';

/** Full Regis report tab: posture summary → promotion path → rule table. */
export function RegisTabContent() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.getReport(ref), api.getPlaybooks()]),
    [ref],
  );

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const [envelope, playbooksResp] = value!;
  const report = envelope.report;
  const ladder = unionLadder(playbooksResp.playbooks);
  const rules = report.rules ?? [];

  return (
    <Content>
      <Box display="flex" flexDirection="column" gridGap={16}>
        <PostureSummary report={report} ladder={ladder} />
        <NextTierPath rules={rules} tier={report.tier} ladder={ladder} />
        <RuleTable rules={rules} rulesSummary={report.rules_summary} />
      </Box>
    </Content>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTabContent.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisTabContent.tsx plugins/regis/src/components/RegisTabContent.test.tsx
git commit -m "feat(frontend): restructure RegisTabContent into summary/path/table"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole plugin test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS — all component and `posture` tests green.

- [ ] **Step 2: Typecheck**

Run: `yarn tsc`
Expected: no type errors.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: no errors. Fix any unused-import / `gridGap` deprecation warnings flagged for the touched files.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(frontend): lint/typecheck fixes for image detail redesign"
```

---

## Open question (carry into review, not a blocker)

The playbook attribution currently renders the playbook **name as plain text**.
Linking it to the playbook's catalog entity requires resolving `playbook_name`
→ a playbook `entityRef` (naming convention or annotation set by the Phase 2
entity provider in `plugins/regis-backend`). Confirm the convention; if reliable,
wrap the name in `EntityRefLink` inside `PostureSummary`. Deferred so the plan
stays frontend-only and unblocked.
```
