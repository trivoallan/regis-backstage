# Posture trajectory chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the axis-less posture `Sparkline` with a readable `TrajectoryChart` — a score-over-time line with 0–100 axes plus a tier lane showing tier transitions.

**Architecture:** Frontend-only in `plugins/regis`. A pure `trajectory.ts` derives chart-ready data (`points`, `tierSpans`, `summary`) from `ReportHistory`. `TrajectoryChart` renders dependency-free SVG (axes + score line + tier-colored dots + tier lane), with a `compact` mode for the quick-look. `RegisTrajectoryCard` and `QuickLookPanel` consume it; `Sparkline` is deleted.

**Tech Stack:** TypeScript, React, dependency-free SVG, Material-UI v4 / `@backstage/core-components` (`InfoCard`), Jest + `@backstage/frontend-test-utils`.

**Test runner (this repo):** `node_modules/.bin/backstage-cli repo test --watch=false <path>` (yarn does NOT put backstage-cli on PATH).

---

## Reference: data shapes (already exported from `@regis/backstage-plugin-regis-common`)

- `ReportSnapshot`: `{ imageRef: string; snapshotDate: string; recordedAt: string; score?: number; tier?: string | null; digest?: string; playbook?: string; ... }` (imageRef/snapshotDate/recordedAt required).
- `ReportHistory`: `{ imageRef: string; snapshots: ReportSnapshot[] }`.
- `TrendBand`: `{ key: string; label: string; color: string }`.
- `format.ts` exports `tierColor(tier, ladder)`, `unionLadder(playbooks)`.
- `trendSummary.ts` exports `formatDelta(d): string` → `▲ N` / `▼ N` / `±0`.
- `Sparkline` is used by exactly `RegisTrajectoryCard.tsx` and `QuickLookPanel.tsx` (verified). Existing tests assert the svg `aria-label="score trajectory"` (exact in the card test; regex in the quick-look test) → `TrajectoryChart` keeps that exact aria-label.

## File structure

- Create: `plugins/regis/src/components/trajectory.ts` (+ `.test.ts`) — pure derivations.
- Create: `plugins/regis/src/components/TrajectoryChart.tsx` (+ `.test.tsx`) — SVG chart.
- Modify: `plugins/regis/src/components/RegisTrajectoryCard.tsx` (+ its test) — use chart + delta subheader.
- Modify: `plugins/regis/src/components/QuickLookPanel.tsx` — use `<TrajectoryChart compact />`.
- Delete: `plugins/regis/src/components/Sparkline.tsx` + `Sparkline.test.tsx`.

---

## Task 1: Pure module `trajectory.ts`

**Files:**
- Create: `plugins/regis/src/components/trajectory.ts`
- Test: `plugins/regis/src/components/trajectory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/trajectory.test.ts`:

```ts
import type { ReportHistory, ReportSnapshot } from '@regis/backstage-plugin-regis-common';
import { points, tierSpans, summary } from './trajectory';

const snap = (p: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/x:1',
  snapshotDate: p.snapshotDate ?? '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  score: p.score,
  tier: p.tier,
});

const history = (snaps: ReportSnapshot[]): ReportHistory => ({ imageRef: 'r/x:1', snapshots: snaps });

describe('points', () => {
  it('keeps only numeric-score snapshots, sorted by date', () => {
    const h = history([
      snap({ snapshotDate: '2026-03-01', score: 80, tier: 'Silver' }),
      snap({ snapshotDate: '2026-01-01', score: 92, tier: 'Gold' }),
      snap({ snapshotDate: '2026-02-01', score: undefined, tier: 'Gold' }),
    ]);
    expect(points(h)).toEqual([
      { date: '2026-01-01', score: 92, tier: 'Gold' },
      { date: '2026-03-01', score: 80, tier: 'Silver' },
    ]);
  });
});

describe('tierSpans', () => {
  it('groups contiguous runs of the same tier', () => {
    const pts = [
      { date: 'a', score: 90, tier: 'Gold' },
      { date: 'b', score: 88, tier: 'Gold' },
      { date: 'c', score: 76, tier: 'Silver' },
      { date: 'd', score: 64, tier: 'Bronze' },
      { date: 'e', score: 60, tier: 'Bronze' },
    ];
    expect(tierSpans(pts)).toEqual([
      { tier: 'Gold', fromIndex: 0, toIndex: 1 },
      { tier: 'Silver', fromIndex: 2, toIndex: 2 },
      { tier: 'Bronze', fromIndex: 3, toIndex: 4 },
    ]);
  });
  it('treats null/absent tier as its own span', () => {
    const pts = [
      { date: 'a', score: 90, tier: null },
      { date: 'b', score: 88, tier: 'Gold' },
    ];
    expect(tierSpans(pts)).toEqual([
      { tier: null, fromIndex: 0, toIndex: 0 },
      { tier: 'Gold', fromIndex: 1, toIndex: 1 },
    ]);
  });
});

describe('summary', () => {
  it('reports count, latest tier/score and the first→last delta', () => {
    const pts = [
      { date: 'a', score: 92, tier: 'Gold' },
      { date: 'b', score: 64, tier: 'Bronze' },
    ];
    expect(summary(pts)).toEqual({ count: 2, latestTier: 'Bronze', latestScore: 64, delta: -28 });
  });
  it('has a zero delta for a single point and zeros for empty', () => {
    expect(summary([{ date: 'a', score: 70, tier: 'Silver' }])).toEqual({
      count: 1, latestTier: 'Silver', latestScore: 70, delta: 0,
    });
    expect(summary([])).toEqual({ count: 0, latestTier: null, latestScore: null, delta: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/trajectory.test.ts`
Expected: FAIL — `Cannot find module './trajectory'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/trajectory.ts`:

```ts
import type { ReportHistory } from '@regis/backstage-plugin-regis-common';

export interface TrajectoryPoint {
  date: string;
  score: number;
  tier?: string | null;
}
export interface TierSpan {
  tier: string | null;
  fromIndex: number;
  toIndex: number;
}
export interface TrajectorySummary {
  count: number;
  latestTier: string | null;
  latestScore: number | null;
  delta: number;
}

/** Numeric-score snapshots, sorted ascending by date, mapped to plot points. */
export function points(history: ReportHistory): TrajectoryPoint[] {
  return history.snapshots
    .filter((s): s is typeof s & { score: number } => typeof s.score === 'number')
    .slice()
    .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
    .map(s => ({ date: s.snapshotDate, score: s.score, tier: s.tier ?? null }));
}

/** Contiguous runs of the same tier (the tier lane). */
export function tierSpans(pts: TrajectoryPoint[]): TierSpan[] {
  const spans: TierSpan[] = [];
  for (let i = 0; i < pts.length; i++) {
    const tier = pts[i].tier ?? null;
    const last = spans[spans.length - 1];
    if (last && last.tier === tier) last.toIndex = i;
    else spans.push({ tier, fromIndex: i, toIndex: i });
  }
  return spans;
}

/** Count, latest tier/score, and the first→last score delta (0 when < 2 points). */
export function summary(pts: TrajectoryPoint[]): TrajectorySummary {
  if (pts.length === 0) {
    return { count: 0, latestTier: null, latestScore: null, delta: 0 };
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  return {
    count: pts.length,
    latestTier: last.tier ?? null,
    latestScore: last.score,
    delta: pts.length >= 2 ? last.score - first.score : 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/trajectory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/trajectory.ts plugins/regis/src/components/trajectory.test.ts
git commit -m "feat(frontend): trajectory.ts — points/tierSpans/summary"
```

---

## Task 2: `TrajectoryChart` component

**Files:**
- Create: `plugins/regis/src/components/TrajectoryChart.tsx`
- Test: `plugins/regis/src/components/TrajectoryChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/TrajectoryChart.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { TrajectoryChart } from './TrajectoryChart';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const history: ReportHistory = {
  imageRef: 'r/x:1',
  snapshots: [
    { imageRef: 'r/x:1', snapshotDate: '2026-01-01', score: 92, tier: 'Gold', recordedAt: '2026-01-01T00:00:00.000Z' },
    { imageRef: 'r/x:1', snapshotDate: '2026-02-01', score: 84, tier: 'Silver', recordedAt: '2026-02-01T00:00:00.000Z' },
    { imageRef: 'r/x:1', snapshotDate: '2026-03-01', score: 64, tier: 'Bronze', recordedAt: '2026-03-01T00:00:00.000Z' },
  ],
};

describe('TrajectoryChart', () => {
  it('renders an svg with a score line and one lane segment per tier span', () => {
    render(<TrajectoryChart history={history} ladder={ladder} />);
    const svg = screen.getByRole('img', { name: 'score trajectory' });
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector('polyline')).toBeInTheDocument();
    // 3 distinct tiers in sequence → 3 lane segments
    expect(screen.getAllByTestId('tier-lane-seg')).toHaveLength(3);
  });

  it('renders the insufficient-history message for fewer than 2 points', () => {
    const one: ReportHistory = {
      imageRef: 'r/x:1',
      snapshots: [{ imageRef: 'r/x:1', snapshotDate: '2026-01-01', score: 92, tier: 'Gold', recordedAt: '2026-01-01T00:00:00.000Z' }],
    };
    render(<TrajectoryChart history={one} ladder={ladder} />);
    expect(screen.getByText(/Not enough history/)).toBeInTheDocument();
  });

  it('renders in compact mode (svg + lane still present)', () => {
    render(<TrajectoryChart history={history} ladder={ladder} compact />);
    expect(screen.getByRole('img', { name: 'score trajectory' })).toBeInTheDocument();
    expect(screen.getAllByTestId('tier-lane-seg').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/TrajectoryChart.test.tsx`
Expected: FAIL — `Cannot find module './TrajectoryChart'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/TrajectoryChart.tsx`:

```tsx
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';
import { points, tierSpans } from './trajectory';

const NEUTRAL = '#9ca3af';

/** Dependency-free SVG: score-over-time line with axes + a tier lane. */
export function TrajectoryChart(props: {
  history: ReportHistory;
  ladder: TrendBand[];
  compact?: boolean;
}) {
  const { history, ladder, compact = false } = props;
  const pts = points(history);
  if (pts.length < 2) {
    return <span>Not enough history to plot a trend yet.</span>;
  }
  const spans = tierSpans(pts);

  const W = compact ? 320 : 620;
  const left = compact ? 28 : 40;
  const right = compact ? 10 : 20;
  const top = 16;
  const plotH = compact ? 84 : 168;
  const plotBottom = top + plotH;
  const xLabelY = plotBottom + (compact ? 11 : 15);
  const laneTop = xLabelY + 6;
  const laneH = compact ? 12 : 16;
  const H = laneTop + laneH + 4;
  const innerW = W - left - right;
  const n = pts.length;
  const x = (i: number) => left + (i * innerW) / (n - 1);
  const y = (score: number) => plotBottom - (score / 100) * plotH;

  const line = pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ');
  const yTicks = compact ? [0, 100] : [0, 25, 50, 75, 100];
  const labelCount = compact ? 2 : Math.min(6, n);
  const labelIdx = Array.from({ length: labelCount }, (_, k) =>
    Math.round((k * (n - 1)) / (labelCount - 1)),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="score trajectory">
      {yTicks.map(t => (
        <g key={t}>
          <line x1={left} y1={y(t)} x2={W - right} y2={y(t)} stroke={t === 0 ? '#ccc' : '#eee'} strokeWidth={1} />
          <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#999">{t}</text>
        </g>
      ))}
      <polyline fill="none" stroke="#3b5bdb" strokeWidth={2} points={line} />
      {pts.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.score)} r={compact ? 3 : 4} fill={tierColor(p.tier, ladder)}>
          <title>{`${p.date}: ${p.score} (${p.tier ?? 'none'})`}</title>
        </circle>
      ))}
      {labelIdx.map(i => (
        <text key={i} x={x(i)} y={xLabelY} textAnchor="middle" fontSize={10} fill="#999">{pts[i].date}</text>
      ))}
      {spans.map((sp, idx) => {
        const startX = idx === 0 ? left : x(sp.fromIndex);
        const endX = idx === spans.length - 1 ? W - right : x(spans[idx + 1].fromIndex);
        const segW = Math.max(0, endX - startX);
        return (
          <g key={sp.fromIndex}>
            <rect data-testid="tier-lane-seg" x={startX} y={laneTop} width={segW} height={laneH} rx={3}
              fill={sp.tier ? tierColor(sp.tier, ladder) : NEUTRAL} />
            {!compact && segW > 34 && (
              <text x={startX + segW / 2} y={laneTop + laneH - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
                {sp.tier ?? '—'}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/TrajectoryChart.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/TrajectoryChart.tsx plugins/regis/src/components/TrajectoryChart.test.tsx
git commit -m "feat(frontend): TrajectoryChart (axes + tier lane)"
```

---

## Task 3: Use the chart in `RegisTrajectoryCard` (+ delta subheader)

**Files:**
- Modify: `plugins/regis/src/components/RegisTrajectoryCard.tsx`
- Test: `plugins/regis/src/components/RegisTrajectoryCard.test.tsx` (extend)

- [ ] **Step 1: Add a failing assertion**

In `plugins/regis/src/components/RegisTrajectoryCard.test.tsx`, in the FIRST test (`'renders a sparkline and the latest posture when history exists'`), ADD after the `latest Gold` assertion (the fixture has scores 70 then 100, delta +30):

```tsx
    expect(screen.getByText(/▲ 30/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTrajectoryCard.test.tsx`
Expected: FAIL — the current subheader has no delta, so `▲ 30` is absent.

- [ ] **Step 3: Edit `RegisTrajectoryCard.tsx`**

Read the file. Make these changes:
1. Replace `import { Sparkline } from './Sparkline';` with:
```tsx
import { TrajectoryChart } from './TrajectoryChart';
import { points, summary } from './trajectory';
import { formatDelta } from './trendSummary';
```
2. Replace the block that computes `latest` and returns the `InfoCard` with the `Sparkline`:
```tsx
  const ladder = unionLadder(playbooksResp?.playbooks);
  const latest = snapshots[snapshots.length - 1];
  return (
    <InfoCard
      title="Trajectory"
      subheader={`${snapshots.length} snapshots · latest ${
        latest.tier ?? 'none'
      } (${latest.score ?? '—'})`}
    >
      <Sparkline history={history} ladder={ladder} />
    </InfoCard>
  );
```
with:
```tsx
  const ladder = unionLadder(playbooksResp?.playbooks);
  const s = summary(points(history));
  return (
    <InfoCard
      title="Trajectory"
      subheader={`${snapshots.length} snapshots · latest ${
        s.latestTier ?? 'none'
      } (${s.latestScore ?? '—'}) · ${formatDelta(s.delta)}`}
    >
      <TrajectoryChart history={history} ladder={ladder} />
    </InfoCard>
  );
```
(The empty-history branch `No history recorded yet.` and the loading/error branches are unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTrajectoryCard.test.tsx`
Expected: PASS — all four tests (the existing `score trajectory` label + tier-colored circles assertions still hold because `TrajectoryChart` keeps both).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisTrajectoryCard.tsx plugins/regis/src/components/RegisTrajectoryCard.test.tsx
git commit -m "feat(frontend): RegisTrajectoryCard uses TrajectoryChart + delta subheader"
```

---

## Task 4: Use the compact chart in `QuickLookPanel`; delete `Sparkline`

**Files:**
- Modify: `plugins/regis/src/components/QuickLookPanel.tsx`
- Delete: `plugins/regis/src/components/Sparkline.tsx`, `plugins/regis/src/components/Sparkline.test.tsx`

- [ ] **Step 1: Edit `QuickLookPanel.tsx`**

Read the file. Replace `import { Sparkline } from './Sparkline';` with `import { TrajectoryChart } from './TrajectoryChart';`, and replace the trajectory assignment line:
```tsx
  else if (history) trajectory = <Sparkline history={history} ladder={ladder} />;
```
with:
```tsx
  else if (history) trajectory = <TrajectoryChart history={history} ladder={ladder} compact />;
```

- [ ] **Step 2: Delete the Sparkline files**

```bash
git rm plugins/regis/src/components/Sparkline.tsx plugins/regis/src/components/Sparkline.test.tsx
```

- [ ] **Step 3: Confirm no dangling references**

Run: `grep -rn "Sparkline" plugins/regis/src`
Expected: no output.

- [ ] **Step 4: Run the quick-look tests**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/QuickLookPanel.test.tsx`
Expected: PASS — the existing `findByRole('img', { name: /score trajectory/i })` matches the compact `TrajectoryChart` (same aria-label).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/QuickLookPanel.tsx
git commit -m "feat(frontend): QuickLookPanel uses compact TrajectoryChart; drop Sparkline"
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
Expected: no errors. Fix any unused-import / `no-nested-ternary` issues in the touched files.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(frontend): lint/typecheck fixes for trajectory chart"
```
