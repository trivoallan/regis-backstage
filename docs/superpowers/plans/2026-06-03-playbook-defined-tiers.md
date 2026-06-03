# Playbook-defined tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat a tier as an entry in an open, ordered, playbook-defined vocabulary everywhere in the plugin, removing all hardcoded Gold/Silver/Bronze handling and supporting a portfolio that spans multiple tier ladders.

**Architecture:** Ladders (ordered tier lists) resolve from the published index (source of truth) with a discovery fallback and config color overrides, via a new pure `LadderResolver`. The portfolio trend aggregates into vocabulary-agnostic *bands* — normalized ranks by default, real tier names when filtered to one playbook — and the response carries band metadata so the frontend renders with nothing hardcoded. Per-image views look up real tier names/colors through a new `GET /playbooks` endpoint.

**Tech Stack:** TypeScript, Backstage 1.51 (new frontend + new backend systems), Jest + @testing-library/react, Ajv (JSON Schema 2020).

**Conventions:** Tests are colocated and run TDD (failing test first). Run a single package's tests with `node_modules/.bin/backstage-cli repo test --watch=false <path>`. `yarn tsc` typechecks the whole repo. After changing exported APIs, run `yarn fix` to regenerate `report.api.md`. Commit after each task.

**Dependency order:** `regis-common` types/schema → `regis-backend` resolver/aggregation/router/wiring → `regis` frontend → demo data + final regen.

---

## File structure

**Create:**
- `plugins/regis-backend/src/service/LadderResolver.ts` — pure ladder resolution (index + discovery + overrides) and the deterministic color palette.
- `plugins/regis-backend/src/service/LadderResolver.test.ts`

**Modify:**
- `plugins/regis-common/src/report-index.ts` — `IndexTierDef`, `IndexPlaybookEntry.tiers`.
- `plugins/regis-common/src/schema/report-index.schema.json` — optional `tiers` on playbook items.
- `plugins/regis-common/src/report-api.ts` — `TrendBand`, generic `TrendBucket`, extended `PortfolioTrend`, `PlaybookLadder`, `PlaybooksResponse`.
- `plugins/regis-backend/src/service/aggregateTrend.ts` (+ `.test.ts`) — band-based rewrite.
- `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts` (+ `.test.ts`) — playbook filter, ladders, facets.
- `plugins/regis-backend/src/router.ts` (+ `router.test.ts` if present) — `?playbook=`, `GET /playbooks`.
- `plugins/regis-backend/src/plugin.ts` — wire `loadPlaybooks` + config overrides into the aggregator.
- `plugins/regis/src/api/RegisApi.ts`, `RegisClient.ts` (+ `RegisClient.test.ts`) — `getPlaybooks`, playbook filter.
- `plugins/regis/src/components/format.ts` (+ `format.test.ts`) — ladder-driven `tierColor`.
- `plugins/regis/src/components/portfolioChart.tsx` (+ `.test.tsx`) — data-driven bands.
- `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx` (+ `.test.tsx`) — playbook selector, dynamic KPIs.
- `plugins/regis/src/components/RegisImagePostureCard.tsx` (+ `.test.tsx` if present) — order from ladder.
- `examples/regis-dataset.cjs` — distinct ladder for the `pci-dss` playbook + emit `tiers`.

---

## Task 1: Index carries ordered tiers (regis-common)

**Files:**
- Modify: `plugins/regis-common/src/report-index.ts`
- Modify: `plugins/regis-common/src/schema/report-index.schema.json`
- Test: `plugins/regis-common/src/report-index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-common/src/report-index.test.ts` (create the file if it does not exist; if it exists, append these `it` blocks inside the existing top-level `describe`):

```ts
import { validateReportIndex } from './report-index';

describe('report index tiers', () => {
  it('accepts an index whose playbooks carry an ordered tiers list', () => {
    const idx = validateReportIndex({
      schemaVersion: 1,
      playbooks: [
        {
          id: 'default',
          title: 'Default',
          tiers: [
            { name: 'Gold', color: '#d4af37' },
            { name: 'Silver' },
            { name: 'Bronze' },
          ],
        },
      ],
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    });
    expect(idx.playbooks?.[0].tiers?.map(t => t.name)).toEqual([
      'Gold',
      'Silver',
      'Bronze',
    ]);
  });

  it('still accepts a v1 index whose playbooks omit tiers (backward compatible)', () => {
    const idx = validateReportIndex({
      schemaVersion: 1,
      playbooks: [{ id: 'default', title: 'Default' }],
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    });
    expect(idx.playbooks?.[0].tiers).toBeUndefined();
  });

  it('rejects a tier entry missing its name', () => {
    expect(() =>
      validateReportIndex({
        schemaVersion: 1,
        playbooks: [{ id: 'default', tiers: [{ color: '#fff' }] }],
        images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-common/src/report-index.test.ts`
Expected: FAIL — the "rejects a tier entry missing its name" case passes through validation (schema does not yet constrain `tiers`).

- [ ] **Step 3: Add the schema constraint**

In `plugins/regis-common/src/schema/report-index.schema.json`, the `playbooks.items.properties` block currently ends after `"owner": { "type": "string" }`. Add a `tiers` property:

```json
          "owner": { "type": "string" },
          "tiers": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name"],
              "properties": {
                "name": { "type": "string", "minLength": 1 },
                "color": { "type": "string" }
              }
            }
          }
```

- [ ] **Step 4: Add the TypeScript type**

In `plugins/regis-common/src/report-index.ts`, add `IndexTierDef` and extend `IndexPlaybookEntry`:

```ts
/** One tier in a playbook's ladder, as published in the index. */
export interface IndexTierDef {
  /** Tier name, e.g. "Gold". */
  name: string;
  /** Optional display color (hex). */
  color?: string;
}

/** A playbook entry in the published index (mirrors the regis v0.34.0 envelope metadata). */
export interface IndexPlaybookEntry {
  /** Machine id — regis `metadata.name`. */
  id: string;
  /** Display name — regis `metadata.title`. */
  title?: string;
  /** Bundle version — regis `metadata.labels["app.kubernetes.io/version"]`. */
  version?: string;
  /** Backstage owner entity ref (regis has no owner concept). */
  owner?: string;
  /** Ordered tier ladder, best→worst. Array order is the source of truth for rank. */
  tiers?: IndexTierDef[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-common/src/report-index.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-common/src/report-index.ts plugins/regis-common/src/schema/report-index.schema.json plugins/regis-common/src/report-index.test.ts
git commit -m "feat(common): carry ordered playbook tiers in the report index"
```

---

## Task 2: Generic trend types (regis-common)

This task changes exported interfaces only; downstream tasks exercise them at runtime. Verification is `yarn tsc`.

**Files:**
- Modify: `plugins/regis-common/src/report-api.ts`

- [ ] **Step 1: Replace the fixed-field trend types**

In `plugins/regis-common/src/report-api.ts`, replace the entire `TrendBucket` and `PortfolioTrend` blocks (currently lines 41-59) with:

```ts
/** One band in a trend chart: a stacking layer with a stable key, label and color. */
export interface TrendBand {
  /** Stable id used as the key into `TrendBucket.counts`. */
  key: string;
  /** Human label for the legend/KPI card. */
  label: string;
  /** Display color (hex). */
  color: string;
}

/** One daily bucket of the portfolio's posture distribution. */
export interface TrendBucket {
  date: string; // ISO date (YYYY-MM-DD)
  /** Image count per band key (e.g. { rank1: 12, rank2: 5, none: 1 } or { Gold: 9 }). */
  counts: Record<string, number>;
  total: number; // sum of all counts values
  avgScore: number; // mean score across images with a numeric score (0 if none)
}

/** Portfolio posture over time, as served by `GET /portfolio/trend`. */
export interface PortfolioTrend {
  generatedAt: string; // ISO datetime
  days: number;
  filters: { system?: string; owner?: string; playbook?: string };
  facets: { systems: string[]; owners: string[]; playbooks: string[] };
  /** Stacking order = array order; the frontend renders entirely from this. */
  bands: TrendBand[];
  buckets: TrendBucket[];
}

/** A playbook's resolved ladder, as served by `GET /playbooks`. */
export interface PlaybookLadder {
  id: string;
  title?: string;
  /** Ordered best→worst; reuses TrendBand (key === label === tier name). */
  tiers: TrendBand[];
}

/** Response of `GET /playbooks`. */
export interface PlaybooksResponse {
  playbooks: PlaybookLadder[];
}
```

- [ ] **Step 2: Verify it typechecks in isolation**

Run: `yarn tsc`
Expected: FAIL — existing callers (`aggregateTrend.ts`, `PortfolioTrendAggregator.ts`, `router.ts`, `portfolioChart.tsx`, `RegisPortfolioTrendsPage.tsx`, and their tests) still reference the removed `gold/silver/bronze/none` fields. These are fixed in Tasks 4–11. Confirm the *only* errors are about those fields, then proceed.

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-common/src/report-api.ts
git commit -m "feat(common): generic band-based trend types"
```

---

## Task 3: LadderResolver (regis-backend)

A pure module: resolve `playbookId → ordered tiers (with colors)` from index playbooks, a discovery fallback over observed snapshots, and config color overrides. Also owns the deterministic palette.

**Files:**
- Create: `plugins/regis-backend/src/service/LadderResolver.ts`
- Test: `plugins/regis-backend/src/service/LadderResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/regis-backend/src/service/LadderResolver.test.ts
import { resolveLadders, paletteColor, NONE_COLOR } from './LadderResolver';
import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('resolveLadders', () => {
  it('uses the index ladder order and colors as the source of truth', () => {
    const playbooks: IndexPlaybookEntry[] = [
      { id: 'default', tiers: [{ name: 'Gold', color: '#d4af37' }, { name: 'Silver' }] },
    ];
    const map = resolveLadders({ playbooks, snapshots: [], overrides: [] });
    expect(map.get('default')).toEqual([
      { name: 'Gold', color: '#d4af37' },
      { name: 'Silver', color: paletteColor(1) },
    ]);
  });

  it('discovers a ladder from observed tiers when the index has none (sorted, palette colors)', () => {
    const snapshots = [
      snap({ playbook: 'p', tier: 'Beta' }),
      snap({ playbook: 'p', tier: 'Alpha' }),
      snap({ playbook: 'p', tier: null }),
    ];
    const map = resolveLadders({ playbooks: [], snapshots, overrides: [] });
    expect(map.get('p')).toEqual([
      { name: 'Alpha', color: paletteColor(0) },
      { name: 'Beta', color: paletteColor(1) },
    ]);
  });

  it('prefers the index ladder over discovery for the same playbook', () => {
    const playbooks: IndexPlaybookEntry[] = [{ id: 'p', tiers: [{ name: 'Gold' }] }];
    const snapshots = [snap({ playbook: 'p', tier: 'Bronze' })];
    const map = resolveLadders({ playbooks, snapshots, overrides: [] });
    expect(map.get('p')?.map(t => t.name)).toEqual(['Gold']);
  });

  it('applies a color override matched by tier (and optional playbook)', () => {
    const playbooks: IndexPlaybookEntry[] = [{ id: 'p', tiers: [{ name: 'Gold', color: '#000' }] }];
    const map = resolveLadders({
      playbooks,
      snapshots: [],
      overrides: [{ playbook: 'p', tier: 'Gold', color: '#fff' }],
    });
    expect(map.get('p')?.[0].color).toBe('#fff');
  });

  it('exposes a stable none color and a cyclic palette', () => {
    expect(typeof NONE_COLOR).toBe('string');
    expect(paletteColor(0)).toBe(paletteColor(6)); // palette has length 6
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/LadderResolver.test.ts`
Expected: FAIL with "Cannot find module './LadderResolver'".

- [ ] **Step 3: Write the implementation**

```ts
// plugins/regis-backend/src/service/LadderResolver.ts
import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

/** A resolved tier: a name plus a concrete display color. */
export interface ResolvedTier {
  name: string;
  color: string;
}

/** An ordered ladder, best→worst. */
export type Ladder = ResolvedTier[];

/** playbookId → resolved ladder. */
export type LadderMap = Map<string, Ladder>;

/** A config-supplied color override, matched by tier name and optional playbook. */
export interface TierColorOverride {
  playbook?: string;
  tier: string;
  color: string;
}

/** Deterministic palette: green → amber → orange → red → purple → teal. Cyclic. */
const PALETTE = ['#2e7d32', '#9e9d24', '#ef6c00', '#c62828', '#6a1b9a', '#00838f'];

/** Color for the untiered band. Light grey, distinct from any palette entry. */
export const NONE_COLOR = '#e5e7eb';

/** Cyclic palette lookup by position. */
export function paletteColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

function overrideFor(
  overrides: TierColorOverride[],
  playbook: string,
  tier: string,
): string | undefined {
  // A playbook-specific override wins over a global (playbook-less) one.
  const scoped = overrides.find(o => o.playbook === playbook && o.tier === tier);
  if (scoped) return scoped.color;
  const global = overrides.find(o => o.playbook === undefined && o.tier === tier);
  return global?.color;
}

/**
 * Resolves `playbookId → ladder` in priority order: (1) the index ladder when a
 * playbook declares `tiers`, else (2) discovery from observed snapshot tiers
 * (sorted, no reliable rank). Colors come from an override, else the index
 * color, else the deterministic palette by position.
 */
export function resolveLadders(input: {
  playbooks?: IndexPlaybookEntry[];
  snapshots: ReportSnapshot[];
  overrides: TierColorOverride[];
}): LadderMap {
  const { playbooks = [], snapshots, overrides } = input;
  const map: LadderMap = new Map();

  // (1) Index ladders.
  for (const pb of playbooks) {
    if (!pb.tiers || pb.tiers.length === 0) continue;
    map.set(
      pb.id,
      pb.tiers.map((t, i) => ({
        name: t.name,
        color: overrideFor(overrides, pb.id, t.name) ?? t.color ?? paletteColor(i),
      })),
    );
  }

  // (2) Discovery fallback for playbooks without an index ladder.
  const discovered = new Map<string, Set<string>>();
  for (const s of snapshots) {
    if (!s.playbook || !s.tier) continue;
    if (map.has(s.playbook)) continue; // index ladder wins
    const set = discovered.get(s.playbook) ?? new Set<string>();
    set.add(s.tier);
    discovered.set(s.playbook, set);
  }
  for (const [id, names] of discovered) {
    const sorted = [...names].sort();
    map.set(
      id,
      sorted.map((name, i) => ({
        name,
        color: overrideFor(overrides, id, name) ?? paletteColor(i),
      })),
    );
  }

  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/LadderResolver.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/LadderResolver.ts plugins/regis-backend/src/service/LadderResolver.test.ts
git commit -m "feat(backend): LadderResolver — index + discovery + color overrides"
```

---

## Task 4: Band-based aggregateTrend (regis-backend)

Rewrite `aggregateTrend` to bucket by *band* (rank by default, real tier names when filtered to one playbook), preserving the O(snapshots + days) carry-forward engine. Returns `{ bands, buckets }`.

**Files:**
- Modify: `plugins/regis-backend/src/service/aggregateTrend.ts`
- Test: `plugins/regis-backend/src/service/aggregateTrend.test.ts`

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `plugins/regis-backend/src/service/aggregateTrend.test.ts` with:

```ts
import { aggregateTrend } from './aggregateTrend';
import type { LadderMap } from './LadderResolver';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  playbook: 'p3',
  ...over,
});

// p3: a 3-tier ladder; p5: a 5-tier ladder (different depth).
const ladders: LadderMap = new Map([
  ['p3', [
    { name: 'Gold', color: '#1' },
    { name: 'Silver', color: '#2' },
    { name: 'Bronze', color: '#3' },
  ]],
  ['p5', [
    { name: 'A', color: '#a' },
    { name: 'B', color: '#b' },
    { name: 'C', color: '#c' },
    { name: 'D', color: '#d' },
    { name: 'E', color: '#e' },
  ]],
]);

describe('aggregateTrend (rank mode)', () => {
  it('produces one bucket per day ending at today, empty counts', () => {
    const out = aggregateTrend([], { days: 3, today: '2026-06-03', ladders });
    expect(out.buckets.map(b => b.date)).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03',
    ]);
    expect(out.buckets.every(b => b.total === 0 && b.avgScore === 0)).toBe(true);
  });

  it('maps each tier to its rank within its own ladder; bands span the deepest ladder', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold', score: 100, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p5', tier: 'C', score: 60, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders },
    );
    expect(out.bands.map(b => b.key)).toEqual([
      'rank1', 'rank2', 'rank3', 'rank4', 'rank5', 'none',
    ]);
    // Gold = rank1 of p3; C = rank3 of p5.
    expect(out.buckets[0].counts).toMatchObject({ rank1: 1, rank3: 1 });
    expect(out.buckets[0].total).toBe(2);
    expect(out.buckets[0].avgScore).toBe(80);
  });

  it('puts null/unknown tiers and unknown playbooks in the none band, excluded from avgScore', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: null, score: undefined, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p3', tier: 'Gold', score: 90, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'c', playbook: 'unknown', tier: 'X', score: 50, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders },
    );
    expect(out.buckets[0].counts.none).toBe(2);
    expect(out.buckets[0].counts.rank1).toBe(1);
    expect(out.buckets[0].total).toBe(3);
    expect(out.buckets[0].avgScore).toBe(70); // (90 + 50) / 2; null-score image excluded
  });

  it('carries a pre-window snapshot forward and applies an in-window transition on its date', () => {
    const out = aggregateTrend(
      [
        snap({ snapshotDate: '2026-05-01', tier: 'Bronze', score: 60 }),
        snap({ snapshotDate: '2026-06-02', tier: 'Gold', score: 100 }),
      ],
      { days: 3, today: '2026-06-03', ladders },
    );
    expect(out.buckets.map(b => ({ d: b.date, r1: b.counts.rank1 ?? 0, r3: b.counts.rank3 ?? 0 }))).toEqual([
      { d: '2026-06-01', r1: 0, r3: 1 },
      { d: '2026-06-02', r1: 1, r3: 0 },
      { d: '2026-06-03', r1: 1, r3: 0 },
    ]);
  });
});

describe('aggregateTrend (playbook mode)', () => {
  it('keeps only the named playbook, bands are its real tier names plus none', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: 'Silver', score: 80, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p5', tier: 'A', score: 99, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders, mode: { kind: 'playbook', playbook: 'p3' } },
    );
    expect(out.bands.map(b => b.key)).toEqual(['Gold', 'Silver', 'Bronze', 'none']);
    expect(out.buckets[0].counts).toMatchObject({ Silver: 1 });
    expect(out.buckets[0].total).toBe(1); // p5 image excluded
    expect(out.buckets[0].avgScore).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/aggregateTrend.test.ts`
Expected: FAIL — `aggregateTrend` does not accept `ladders`/`mode` and returns an array, not `{ bands, buckets }`.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `plugins/regis-backend/src/service/aggregateTrend.ts` with:

```ts
import type {
  ReportSnapshot,
  TrendBand,
  TrendBucket,
} from '@regis/backstage-plugin-regis-common';
import { NONE_COLOR, paletteColor, type LadderMap } from './LadderResolver';

const NONE_KEY = 'none';

export interface TrendResult {
  bands: TrendBand[];
  buckets: TrendBucket[];
}

export type TrendMode = { kind: 'rank' } | { kind: 'playbook'; playbook: string };

/** Add `delta` days to an ISO date (UTC), returning a YYYY-MM-DD string. */
function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface State {
  band: string;
  score?: number;
}
interface Counters {
  counts: Map<string, number>;
  total: number;
  scoreSum: number;
  scored: number;
}

function applyState(c: Counters, st: State | undefined, sign: 1 | -1): void {
  if (!st) return;
  c.counts.set(st.band, (c.counts.get(st.band) ?? 0) + sign);
  c.total += sign;
  if (typeof st.score === 'number') {
    c.scoreSum += sign * st.score;
    c.scored += sign;
  }
}

/**
 * Daily as-of carry-forward distribution of portfolio posture over `days`
 * ending at `today`. Delta/event-based: O(snapshots + days). Buckets by *band*:
 * normalized rank within each image's own ladder (default), or the real tier
 * name when filtered to a single playbook. `today` is injected for tests.
 */
export function aggregateTrend(
  snapshots: ReportSnapshot[],
  opts: {
    days: number;
    today: string;
    ladders: LadderMap;
    mode?: TrendMode;
  },
): TrendResult {
  const { days, today, ladders } = opts;
  const mode = opts.mode ?? { kind: 'rank' };

  // Restrict to the selected playbook up front in playbook mode.
  const rows =
    mode.kind === 'playbook'
      ? snapshots.filter(s => s.playbook === mode.playbook)
      : snapshots;

  // Band key for a snapshot's (playbook, tier).
  const bandKey = (s: ReportSnapshot): string => {
    const ladder = s.playbook ? ladders.get(s.playbook) : undefined;
    if (!ladder || !s.tier) return NONE_KEY;
    const idx = ladder.findIndex(t => t.name === s.tier);
    if (idx < 0) return NONE_KEY;
    return mode.kind === 'playbook' ? s.tier : `rank${idx + 1}`;
  };

  // Bands (stacking order). Always end with `none`.
  let bands: TrendBand[];
  if (mode.kind === 'playbook') {
    const ladder = ladders.get(mode.playbook) ?? [];
    bands = [
      ...ladder.map(t => ({ key: t.name, label: t.name, color: t.color })),
      { key: NONE_KEY, label: 'Untiered', color: NONE_COLOR },
    ];
  } else {
    let maxRank = 0;
    const seenPlaybooks = new Set(rows.map(s => s.playbook).filter(Boolean) as string[]);
    for (const id of seenPlaybooks) {
      maxRank = Math.max(maxRank, ladders.get(id)?.length ?? 0);
    }
    bands = [];
    for (let k = 1; k <= maxRank; k++) {
      bands.push({ key: `rank${k}`, label: `Rank ${k}`, color: paletteColor(k - 1) });
    }
    bands.push({ key: NONE_KEY, label: 'Untiered', color: NONE_COLOR });
  }

  const windowStart = isoAddDays(today, -(days - 1));

  // Group by image, sorted by snapshotDate ascending.
  const byImage = new Map<string, ReportSnapshot[]>();
  for (const s of rows) {
    const arr = byImage.get(s.imageRef);
    if (arr) arr.push(s);
    else byImage.set(s.imageRef, [s]);
  }
  for (const arr of byImage.values()) {
    arr.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  const counters: Counters = { counts: new Map(), total: 0, scoreSum: 0, scored: 0 };
  const state = new Map<string, State>();
  const eventsByDate = new Map<string, Array<{ image: string; st: State }>>();

  for (const [image, arr] of byImage) {
    let baseline: State | undefined;
    for (const s of arr) {
      const st: State = { band: bandKey(s), score: s.score };
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
    // Dense counts over the band set (zeros included) for stable rendering.
    const counts: Record<string, number> = {};
    for (const band of bands) counts[band.key] = counters.counts.get(band.key) ?? 0;
    buckets.push({
      date,
      counts,
      total: counters.total,
      avgScore: counters.scored
        ? Math.round(counters.scoreSum / counters.scored)
        : 0,
    });
  }
  return { bands, buckets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/aggregateTrend.test.ts`
Expected: PASS (all cases, including the 3-vs-5 depth and playbook-mode cases).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/aggregateTrend.ts plugins/regis-backend/src/service/aggregateTrend.test.ts
git commit -m "feat(backend): band-based aggregateTrend (rank + playbook modes)"
```

---

## Task 5: PortfolioTrendAggregator — ladders, playbook filter, facets

**Files:**
- Modify: `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`
- Test: `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts` (inside the existing `describe`; if the file's existing tests assert the old `trend()` array return, update those assertions to read `.buckets`). Add a helper store and these cases:

```ts
import { PortfolioTrendAggregator } from './PortfolioTrendAggregator';
import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

function makeAggregator(
  snapshots: ReportSnapshot[],
  playbooks: IndexPlaybookEntry[] = [],
) {
  const store = { listSnapshots: async () => snapshots } as any;
  const logger = { warn() {}, info() {}, error() {}, debug() {} } as any;
  return new PortfolioTrendAggregator({
    store,
    logger,
    loadPlaybooks: async () => playbooks,
  });
}

describe('PortfolioTrendAggregator ladders/facets', () => {
  it('exposes playbooks in facets', async () => {
    const agg = makeAggregator([
      snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold', system: 's1', owner: 'o1' }),
      snap({ imageRef: 'b', playbook: 'p5', tier: 'A', system: 's2', owner: 'o2' }),
    ]);
    await agg.ensureFresh(1);
    expect(agg.facets().playbooks).toEqual(['p3', 'p5']);
  });

  it('returns named-tier bands when filtered to a playbook', async () => {
    const agg = makeAggregator(
      [snap({ imageRef: 'a', playbook: 'p3', tier: 'Silver', score: 80 })],
      [{ id: 'p3', tiers: [{ name: 'Gold' }, { name: 'Silver' }, { name: 'Bronze' }] }],
    );
    await agg.ensureFresh(1);
    const res = agg.trend(1, '2026-06-03', { playbook: 'p3' });
    expect(res.bands.map(b => b.key)).toEqual(['Gold', 'Silver', 'Bronze', 'none']);
    expect(res.buckets[0].counts).toMatchObject({ Silver: 1 });
  });

  it('builds PlaybookLadder list from the resolved ladders', async () => {
    const agg = makeAggregator(
      [snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold' })],
      [{ id: 'p3', title: 'Default', tiers: [{ name: 'Gold', color: '#g' }] }],
    );
    await agg.ensureFresh(1);
    expect(agg.playbookLadders()).toEqual([
      { id: 'p3', title: 'Default', tiers: [{ key: 'Gold', label: 'Gold', color: '#g' }] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`
Expected: FAIL — `loadPlaybooks` dep, `facets().playbooks`, the `{ bands, buckets }` return, the `playbook` filter, and `playbookLadders()` do not exist yet.

- [ ] **Step 3: Update the implementation**

In `plugins/regis-backend/src/service/PortfolioTrendAggregator.ts`:

Update the imports at the top:

```ts
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  IndexPlaybookEntry,
  PlaybookLadder,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';
import { aggregateTrend, type TrendResult } from './aggregateTrend';
import {
  resolveLadders,
  type LadderMap,
  type TierColorOverride,
} from './LadderResolver';
import type { ReportHistoryStore } from './ReportHistoryStore';
```

Extend the deps interface:

```ts
export interface PortfolioTrendAggregatorDeps {
  store: ReportHistoryStore;
  logger: LoggerService;
  /** Log a warning past this many loaded rows (scaling signal). Default 500_000. */
  rowWarnThreshold?: number;
  now?: () => number;
  /** Loads index playbook metadata (with tier ladders). Best-effort; absent → discovery only. */
  loadPlaybooks?: () => Promise<IndexPlaybookEntry[]>;
  /** Config-supplied color overrides. */
  tierOverrides?: TierColorOverride[];
}
```

Add fields and load playbooks in `refresh()`. Inside the class, add after `private lastRunAt = 0;`:

```ts
  private playbooks: IndexPlaybookEntry[] = [];
  private readonly overrides: TierColorOverride[];
```

In the constructor, after `this.rowWarnThreshold = ...;` add:

```ts
    this.overrides = deps.tierOverrides ?? [];
```

Replace the body of `refresh()` with:

```ts
  async refresh(): Promise<void> {
    this.snapshots = await this.deps.store.listSnapshots();
    if (this.deps.loadPlaybooks) {
      try {
        this.playbooks = await this.deps.loadPlaybooks();
      } catch (error) {
        this.deps.logger.warn(`regis: failed to load playbook ladders: ${error}`);
        // Keep the previous playbooks; discovery fallback still applies.
      }
    }
    this.lastRunAt = this.now();
    if (this.snapshots.length > this.rowWarnThreshold) {
      this.deps.logger.warn(
        `regis: portfolio trend loaded ${this.snapshots.length} snapshots in memory ` +
          `(> ${this.rowWarnThreshold}); consider the SQL/rollup aggregation path`,
      );
    }
  }
```

Add a private resolver helper and replace `trend()`:

```ts
  private resolve(): LadderMap {
    return resolveLadders({
      playbooks: this.playbooks,
      snapshots: this.snapshots,
      overrides: this.overrides,
    });
  }

  /** Compute the trend for the cached snapshots, optionally filtered (AND across set fields). */
  trend(
    days: number,
    today: string,
    filters: { system?: string; owner?: string; playbook?: string } = {},
  ): TrendResult {
    const filtered = this.snapshots.filter(
      s =>
        (filters.system === undefined || s.system === filters.system) &&
        (filters.owner === undefined || s.owner === filters.owner),
    );
    const ladders = this.resolve();
    const mode = filters.playbook
      ? ({ kind: 'playbook', playbook: filters.playbook } as const)
      : ({ kind: 'rank' } as const);
    return aggregateTrend(filtered, { days, today, ladders, mode });
  }
```

Replace `facets()` to add playbooks:

```ts
  /** Distinct, sorted, non-empty system/owner/playbook values across the full cached set. */
  facets(): { systems: string[]; owners: string[]; playbooks: string[] } {
    const systems = new Set<string>();
    const owners = new Set<string>();
    const playbooks = new Set<string>();
    for (const s of this.snapshots) {
      if (s.system) systems.add(s.system);
      if (s.owner) owners.add(s.owner);
      if (s.playbook) playbooks.add(s.playbook);
    }
    return {
      systems: [...systems].sort(),
      owners: [...owners].sort(),
      playbooks: [...playbooks].sort(),
    };
  }

  /** Resolved ladders as `PlaybookLadder[]` for `GET /playbooks`. */
  playbookLadders(): PlaybookLadder[] {
    const titleById = new Map(this.playbooks.map(p => [p.id, p.title]));
    const out: PlaybookLadder[] = [];
    for (const [id, ladder] of this.resolve()) {
      out.push({
        id,
        title: titleById.get(id),
        tiers: ladder.map(t => ({ key: t.name, label: t.name, color: t.color })),
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/PortfolioTrendAggregator.ts plugins/regis-backend/src/service/PortfolioTrendAggregator.test.ts
git commit -m "feat(backend): aggregator resolves ladders, playbook filter, playbook facets"
```

---

## Task 6: Router — playbook filter + GET /playbooks

**Files:**
- Modify: `plugins/regis-backend/src/router.ts`
- Test: `plugins/regis-backend/src/router.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Append to `plugins/regis-backend/src/router.test.ts`. If the file does not exist, create it with this content (uses supertest + express, the standard Backstage router test harness):

```ts
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';

function appWith(portfolioTrend: any) {
  const httpAuth = { credentials: async () => ({}) } as any;
  const noop = {} as any;
  return createRouter({
    logger: { warn() {}, info() {}, error() {}, debug() {} } as any,
    httpAuth,
    reportService: noop,
    aggregator: noop,
    historyService: noop,
    portfolioTrend,
  }).then(router => express().use(router));
}

describe('router portfolio/playbooks', () => {
  const trendStub = {
    ensureFresh: async () => {},
    lastRefreshIso: () => '2026-06-03T00:00:00.000Z',
    facets: () => ({ systems: [], owners: [], playbooks: ['p3'] }),
    trend: (_d: number, _t: string, filters: any) => ({
      bands: [{ key: 'rank1', label: 'Rank 1', color: '#1' }],
      buckets: [{ date: '2026-06-03', counts: { rank1: 1 }, total: 1, avgScore: 90 }],
      _filters: filters,
    }),
    playbookLadders: () => [
      { id: 'p3', title: 'Default', tiers: [{ key: 'Gold', label: 'Gold', color: '#g' }] },
    ],
  };

  it('passes ?playbook= through and returns bands + playbook facets', async () => {
    let seen: any;
    const stub = {
      ...trendStub,
      trend: (_d: number, _t: string, filters: any) => {
        seen = filters;
        return { bands: trendStub.trend(0, '', {}).bands, buckets: [] };
      },
    };
    const app = await appWith(stub);
    const res = await request(app).get('/portfolio/trend?days=30&playbook=p3');
    expect(res.status).toBe(200);
    expect(seen).toEqual({ playbook: 'p3' });
    expect(res.body.filters.playbook).toBe('p3');
    expect(res.body.facets.playbooks).toEqual(['p3']);
    expect(res.body.bands[0].key).toBe('rank1');
  });

  it('GET /playbooks returns the resolved ladders', async () => {
    const app = await appWith(trendStub);
    const res = await request(app).get('/playbooks');
    expect(res.status).toBe(200);
    expect(res.body.playbooks[0]).toEqual({
      id: 'p3',
      title: 'Default',
      tiers: [{ key: 'Gold', label: 'Gold', color: '#g' }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/router.test.ts`
Expected: FAIL — the response has no `bands`/`facets.playbooks`, `?playbook=` is dropped, and `/playbooks` 404s.

- [ ] **Step 3: Update the router**

In `plugins/regis-backend/src/router.ts`, replace the `/portfolio/trend` handler (lines 73-95) with:

```ts
  router.get('/portfolio/trend', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const filters: { system?: string; owner?: string; playbook?: string } = {};
    const system = str(req.query.system);
    const owner = str(req.query.owner);
    const playbook = str(req.query.playbook);
    if (system) filters.system = system;
    if (owner) filters.owner = owner;
    if (playbook) filters.playbook = playbook;
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    const { bands, buckets } = portfolioTrend.trend(days, today, filters);
    const body: PortfolioTrend = {
      // The true freshness of the served buckets (from the cache), not request time.
      generatedAt: portfolioTrend.lastRefreshIso(),
      days,
      filters,
      facets: portfolioTrend.facets(),
      bands,
      buckets,
    };
    res.json(body);
  });

  router.get('/playbooks', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    await portfolioTrend.ensureFresh(30_000);
    const body: PlaybooksResponse = { playbooks: portfolioTrend.playbookLadders() };
    res.json(body);
  });
```

Update the import from the common package (lines 6-10) to add `PlaybooksResponse`:

```ts
import {
  PlaybooksResponse,
  PortfolioTrend,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
} from '@regis/backstage-plugin-regis-common';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend/src/router.test.ts`
Expected: PASS. (If `supertest` is not already a dev dependency in this package, the import will fail to resolve — in that case rewrite the two cases to call the handler via a minimal mock `req`/`res` as the existing router tests do, rather than adding a dependency.)

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/router.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat(backend): /portfolio/trend playbook filter + GET /playbooks"
```

---

## Task 7: Wire ladders into the plugin

**Files:**
- Modify: `plugins/regis-backend/src/plugin.ts`

- [ ] **Step 1: Add the imports**

In `plugins/regis-backend/src/plugin.ts`, after the existing `import { makeFragmentSource } from './provider/makeFragmentSource';` line add:

```ts
import { assembleIndex } from './provider/assembleIndex';
import type { TierColorOverride } from './service/LadderResolver';
```

- [ ] **Step 2: Build loadPlaybooks + overrides before constructing the aggregator**

In `plugin.ts`, the `indexDirUrl` is currently read late (line 136). Read it (and overrides) *before* the `portfolioTrend` construction. Replace the `const portfolioTrend = new PortfolioTrendAggregator({ ... });` block (lines 68-74) with:

```ts
        const indexDirUrl = config.getOptionalString('regis.catalog.indexDirUrl');
        const loadPlaybooks = indexDirUrl
          ? async () => {
              const fragments = await makeFragmentSource(
                indexDirUrl,
                urlReader,
              ).list(indexDirUrl);
              return assembleIndex(fragments, logger).playbooks ?? [];
            }
          : undefined;
        const tierOverrides: TierColorOverride[] = (
          config.getOptionalConfigArray('regis.tiers') ?? []
        ).map(c => ({
          playbook: c.getOptionalString('playbook'),
          tier: c.getString('tier'),
          color: c.getString('color'),
        }));
        const portfolioTrend = new PortfolioTrendAggregator({
          store: historyStore,
          logger,
          rowWarnThreshold: config.getOptionalNumber(
            'regis.portfolio.inMemoryRowLimit',
          ),
          loadPlaybooks,
          tierOverrides,
        });
```

- [ ] **Step 3: Remove the now-duplicate indexDirUrl read**

Further down, the history-recorder block re-reads `indexDirUrl` (line 136: `const indexDirUrl = config.getOptionalString('regis.catalog.indexDirUrl');`). Delete that single line — the variable is now in scope from Step 2. Leave the `if (indexDirUrl) { ... }` guard and its body unchanged.

- [ ] **Step 4: Verify the backend compiles and all backend tests pass**

Run: `yarn tsc`
Expected: PASS for `plugins/regis-backend` (frontend errors from removed trend fields are expected until Tasks 8–12).

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis-backend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/plugin.ts
git commit -m "feat(backend): wire index playbook ladders + config overrides into the aggregator"
```

---

## Task 8: Ladder-driven tierColor (frontend)

**Files:**
- Modify: `plugins/regis/src/components/format.ts`
- Test: `plugins/regis/src/components/format.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/regis/src/components/format.test.ts` (create if absent, matching the import style of sibling tests):

```ts
import { tierColor } from './format';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

describe('tierColor', () => {
  const ladder: TrendBand[] = [
    { key: 'Gold', label: 'Gold', color: '#d4af37' },
    { key: 'Platinum', label: 'Platinum', color: '#7e57c2' },
  ];

  it('uses the ladder color when the tier is known', () => {
    expect(tierColor('Platinum', ladder)).toBe('#7e57c2');
  });

  it('falls back to a stable non-grey color for an unknown tier with no ladder', () => {
    const a = tierColor('Mystery');
    const b = tierColor('Mystery');
    expect(a).toBe(b); // deterministic
    expect(a).not.toBe('#9ca3af'); // not the neutral fallback
  });

  it('falls back to neutral grey for a missing tier', () => {
    expect(tierColor(null)).toBe('#9ca3af');
    expect(tierColor(undefined)).toBe('#9ca3af');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts`
Expected: FAIL — `tierColor` ignores a ladder argument and uses the hardcoded gold/silver/bronze switch.

- [ ] **Step 3: Rewrite tierColor**

Replace the `tierColor` function in `plugins/regis/src/components/format.ts` (lines 3-15) with:

```ts
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

// Deterministic palette mirroring the backend LadderResolver, so a tier with no
// ladder color still renders a stable, non-grey hue.
const PALETTE = ['#2e7d32', '#9e9d24', '#ef6c00', '#c62828', '#6a1b9a', '#00838f'];
const NEUTRAL = '#9ca3af';

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

/**
 * Tier badge color. Prefers the playbook ladder's color; otherwise a stable
 * hash-based palette color; missing/unknown tiers fall back to neutral grey.
 */
export function tierColor(
  tier: string | null | undefined,
  ladder?: TrendBand[],
): string {
  if (!tier) return NEUTRAL;
  const fromLadder = ladder?.find(b => b.key === tier || b.label === tier);
  if (fromLadder) return fromLadder.color;
  return PALETTE[hashIndex(tier)];
}
```

Keep `scoreStatus` and the `ScoreStatus` type unchanged below.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/format.ts plugins/regis/src/components/format.test.ts
git commit -m "feat(frontend): ladder-driven tierColor with deterministic fallback"
```

---

## Task 9: RegisClient — getPlaybooks + playbook filter

**Files:**
- Modify: `plugins/regis/src/api/RegisApi.ts`
- Modify: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('RegisClient', ...)` in `plugins/regis/src/api/RegisClient.test.ts`:

```ts
  it('GETs /playbooks', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ playbooks: [{ id: 'p3', tiers: [] }] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getPlaybooks();
    expect(out.playbooks[0].id).toBe('p3');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/playbooks',
    );
  });

  it('includes ?playbook= in the trend request when filtered', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buckets: [], bands: [], facets: {} }),
    });
    const client = clientWith(fetchImpl);
    await client.getPortfolioTrend(30, { playbook: 'p3' });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('playbook=p3'),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: FAIL — `getPlaybooks` does not exist; `getPortfolioTrend` ignores `playbook`.

- [ ] **Step 3: Extend the API interface**

In `plugins/regis/src/api/RegisApi.ts`, update the import and re-export to include the new types and add the methods:

```ts
import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from '@regis/backstage-plugin-regis-common';

export type {
  PlaybooksResponse,
  PortfolioTrend,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
};

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
  getHistory(entityRef: string): Promise<ReportHistory>;
  getPortfolioTrend(
    days: number,
    filters?: { system?: string; owner?: string; playbook?: string },
  ): Promise<PortfolioTrend>;
  getPlaybooks(): Promise<PlaybooksResponse>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: 'plugin.regis.service',
});
```

- [ ] **Step 4: Implement in the client**

In `plugins/regis/src/api/RegisClient.ts`, update the import line and the `getPortfolioTrend` method, and add `getPlaybooks`:

Update the import (line 2):

```ts
import type {
  PlaybooksResponse,
  PortfolioTrend,
  RegisApi,
  ReportEnvelope,
  ReportHistory,
  ReportSummary,
} from './RegisApi';
```

Replace `getPortfolioTrend` (lines 46-54) and add `getPlaybooks` after it:

```ts
  async getPortfolioTrend(
    days: number,
    filters: { system?: string; owner?: string; playbook?: string } = {},
  ): Promise<PortfolioTrend> {
    const params = new URLSearchParams({ days: String(days) });
    if (filters.system) params.set('system', filters.system);
    if (filters.owner) params.set('owner', filters.owner);
    if (filters.playbook) params.set('playbook', filters.playbook);
    return this.getJson<PortfolioTrend>(`/portfolio/trend?${params.toString()}`);
  }

  async getPlaybooks(): Promise<PlaybooksResponse> {
    return this.getJson<PlaybooksResponse>('/playbooks');
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(frontend): RegisClient getPlaybooks + playbook trend filter"
```

---

## Task 10: Data-driven stacked-area chart

**Files:**
- Modify: `plugins/regis/src/components/portfolioChart.tsx`
- Test: `plugins/regis/src/components/portfolioChart.test.tsx`

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `plugins/regis/src/components/portfolioChart.test.tsx` with:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PortfolioStackedArea } from './portfolioChart';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

const bands: TrendBand[] = [
  { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
  { key: 'rank2', label: 'Rank 2', color: '#9e9d24' },
  { key: 'none', label: 'Untiered', color: '#e5e7eb' },
];
const buckets: TrendBucket[] = [
  { date: '2026-06-01', counts: { rank1: 1, rank2: 1, none: 0 }, total: 2, avgScore: 80 },
  { date: '2026-06-02', counts: { rank1: 2, rank2: 0, none: 0 }, total: 2, avgScore: 95 },
];

describe('PortfolioStackedArea', () => {
  it('renders one polygon per band plus the score line, and a legend from bands', () => {
    render(<PortfolioStackedArea bands={bands} buckets={buckets} />);
    const svg = screen.getByRole('img', { name: /portfolio posture over time/i });
    expect(svg.querySelectorAll('polygon')).toHaveLength(3);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Untiered')).toBeInTheDocument();
    expect(screen.getByText(/avg score/i)).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-02')).toBeInTheDocument();
  });

  it('renders nothing meaningful for an empty series', () => {
    render(<PortfolioStackedArea bands={bands} buckets={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/portfolioChart.test.tsx`
Expected: FAIL — the component takes only `buckets` and indexes fixed fields.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `plugins/regis/src/components/portfolioChart.tsx` with:

```tsx
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

/** Dependency-free stacked-area chart of per-band counts + an average-score line. */
export function PortfolioStackedArea({
  bands,
  buckets,
}: {
  bands: TrendBand[];
  buckets: TrendBucket[];
}) {
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

  const count = (b: TrendBucket, key: string) => b.counts[key] ?? 0;

  // Cumulative stack: each band's top edge is the running sum up to and including it.
  const cumulativeTops = buckets.map(b => {
    let acc = 0;
    return bands.map(band => (acc += count(b, band.key)));
  });

  const polygons = bands.map((band, bandIdx) => {
    const topPts = buckets.map((_, i) => `${x(i)},${yCount(cumulativeTops[i][bandIdx])}`);
    const bottomPts = buckets
      .map((_, i) => {
        const below = bandIdx === 0 ? 0 : cumulativeTops[i][bandIdx - 1];
        return `${x(i)},${yCount(below)}`;
      })
      .reverse();
    return { band, points: [...topPts, ...bottomPts].join(' ') };
  });

  const scoreLine = buckets.map((b, i) => `${x(i)},${yScore(b.avgScore)}`).join(' ');

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="portfolio posture over time"
      >
        {polygons.map(p => (
          <polygon
            key={p.band.key}
            points={p.points}
            fill={p.band.color}
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
        <text x={P} y={H - 4} fontSize={10} fill="#6b7280" textAnchor="start">
          {buckets[0].date}
        </text>
        <text x={W - P} y={H - 4} fontSize={10} fill="#6b7280" textAnchor="end">
          {buckets[n - 1].date}
        </text>
      </svg>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '12px', marginTop: 8, fontSize: 12, color: '#374151' }}>
        {bands.map(band => (
          <span key={band.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: band.color }} />
            {band.label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <svg width={16} height={10} style={{ display: 'inline-block' }}>
            <line x1={0} y1={5} x2={16} y2={5} stroke="#111827" strokeWidth={2} strokeDasharray="4 2" />
          </svg>
          Avg score (0–100)
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/portfolioChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/portfolioChart.tsx plugins/regis/src/components/portfolioChart.test.tsx
git commit -m "feat(frontend): data-driven stacked-area chart (bands from the response)"
```

---

## Task 11: Trends page — playbook selector + dynamic KPIs

**Files:**
- Modify: `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx`
- Test: `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the body of `plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx` (or create it) with a test that stubs the api and asserts dynamic KPI labels come from `bands`:

```tsx
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { regisApiRef } from '../api/RegisApi';
import { RegisPortfolioTrendsPage } from './RegisPortfolioTrendsPage';

const api = {
  getPortfolioTrend: jest.fn().mockResolvedValue({
    generatedAt: '2026-06-03T00:00:00.000Z',
    days: 90,
    filters: {},
    facets: { systems: [], owners: [], playbooks: ['p3'] },
    bands: [
      { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
      { key: 'none', label: 'Untiered', color: '#e5e7eb' },
    ],
    buckets: [
      { date: '2026-06-01', counts: { rank1: 1, none: 0 }, total: 1, avgScore: 90 },
      { date: '2026-06-02', counts: { rank1: 2, none: 0 }, total: 2, avgScore: 92 },
    ],
  }),
  getPlaybooks: jest.fn(),
  getReport: jest.fn(),
  listReports: jest.fn(),
  getHistory: jest.fn(),
};

describe('RegisPortfolioTrendsPage', () => {
  it('renders a KPI card per band label plus avg score and images', async () => {
    render(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisPortfolioTrendsPage />
      </TestApiProvider>,
    );
    await waitFor(() => expect(screen.getByText('Rank 1')).toBeInTheDocument());
    expect(screen.getByText('Untiered')).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    // No hardcoded vocabulary leaks through.
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`
Expected: FAIL — the page still renders hardcoded Gold/Silver/Bronze KPIs and `last.gold` is now undefined.

- [ ] **Step 3: Rewrite the page**

Replace the entire contents of `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx` with:

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
  const [playbook, setPlaybook] = useState('');
  const { value, loading, error } = useAsync(
    () =>
      api.getPortfolioTrend(WINDOW_DAYS, {
        system: system || undefined,
        owner: owner || undefined,
        playbook: playbook || undefined,
      }),
    [system, owner, playbook],
  );

  const facets = value?.facets ?? { systems: [], owners: [], playbooks: [] };
  const filtered = Boolean(
    system || owner || playbook || value?.filters?.system || value?.filters?.owner || value?.filters?.playbook,
  );

  const body = () => {
    if (loading) return <Progress />;
    if (error) return <ResponseErrorPanel error={error} />;
    const buckets = value?.buckets ?? [];
    const bands = value?.bands ?? [];
    if (buckets.length === 0) {
      return (
        <Typography>
          {filtered ? 'No history for this filter.' : 'No portfolio history recorded yet.'}
        </Typography>
      );
    }

    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    const daysLabel = value?.days !== undefined ? `${value.days}d` : '';
    const at = (b: typeof first, key: string) => b.counts[key] ?? 0;
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
        <Grid item xs={12}>
          <InfoCard title={`Posture over the last ${daysLabel}`}>
            <PortfolioStackedArea bands={bands} buckets={buckets} />
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
          <Grid item xs={6} sm={3}>
            <FacetSelect label="Playbook" value={playbook} options={facets.playbooks} onChange={setPlaybook} />
          </Grid>
        </Grid>
        {body()}
      </Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx`
Expected: PASS. (If the existing test file asserted Gold/Silver/Bronze KPIs, those assertions are replaced by Step 1.)

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisPortfolioTrendsPage.tsx plugins/regis/src/components/RegisPortfolioTrendsPage.test.tsx
git commit -m "feat(frontend): playbook selector + dynamic band KPIs on the trends page"
```

---

## Task 12: Posture card ordering from the ladder

`RegisImagePostureCard` hardcodes `TIER_ORDER = ['Gold','Silver','Bronze']` to sort its distribution summary. Drive the order from the playbooks endpoint, falling back to alphabetical when no ladder is known.

**Files:**
- Modify: `plugins/regis/src/components/RegisImagePostureCard.tsx`
- Test: `plugins/regis/src/components/RegisImagePostureCard.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/replace `plugins/regis/src/components/RegisImagePostureCard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { regisApiRef } from '../api/RegisApi';
import { RegisImagePostureCard } from './RegisImagePostureCard';

const reports = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Bronze', score: 60 },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Gold', score: 100 },
];

function apiWith(playbooks: any[]) {
  return {
    listReports: jest.fn().mockResolvedValue(reports),
    getPlaybooks: jest.fn().mockResolvedValue({ playbooks }),
    getReport: jest.fn(),
    getHistory: jest.fn(),
    getPortfolioTrend: jest.fn(),
  };
}

describe('RegisImagePostureCard distribution order', () => {
  it('orders the distribution by the resolved ladder (best first)', async () => {
    const api = apiWith([
      {
        id: 'default',
        tiers: [
          { key: 'Gold', label: 'Gold', color: '#g' },
          { key: 'Silver', label: 'Silver', color: '#s' },
          { key: 'Bronze', label: 'Bronze', color: '#b' },
        ],
      },
    ]);
    render(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisImagePostureCard
          title="Images"
          imageRefs={['resource:default/a', 'resource:default/b']}
        />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/1 Gold · 1 Bronze/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisImagePostureCard.test.tsx`
Expected: FAIL — ordering uses the hardcoded `TIER_ORDER` and `getPlaybooks` is never called.

- [ ] **Step 3: Update the component**

In `plugins/regis/src/components/RegisImagePostureCard.tsx`:

Remove the `const TIER_ORDER = ['Gold', 'Silver', 'Bronze'];` line (line 13).

Replace the `distribution` function (lines 15-27) with a version that takes an order list:

```ts
function distribution(rows: ReportSummary[], order: string[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.status === 'ok' ? r.tier ?? 'untiered' : r.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (k: string) =>
    order.indexOf(k) === -1 ? order.length : order.indexOf(k);
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${n} ${k}`)
    .join(' · ');
}
```

Inside the component, alongside the existing `listReports` call, fetch playbooks and build the order. Replace the `useAsync(() => api.listReports(), [])` line (line 50) with:

```ts
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );
```

Then where `value` is consumed (lines 67-77), destructure the tuple and derive the order from the union of all ladders (best-first by first appearance, deduped), falling back to alphabetical:

```ts
  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const order: string[] = [];
  for (const pb of playbooksResp?.playbooks ?? []) {
    for (const t of pb.tiers) if (!order.includes(t.key)) order.push(t.key);
  }

  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));

  if (rows.length === 0) {
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
  }

  return (
    <InfoCard
      title={title}
      subheader={`${rows.length} images · ${distribution(rows, order)}`}
    >
```

(The `loading`/`error` guards above remain unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisImagePostureCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisImagePostureCard.tsx plugins/regis/src/components/RegisImagePostureCard.test.tsx
git commit -m "feat(frontend): order posture distribution by the resolved ladder"
```

---

## Task 13: Demo dataset exercises multiple ladders

Give the `pci-dss` playbook a distinct ladder and emit `tiers` in the index so the demo shows both the normalized-rank and playbook-filtered views with genuinely different vocabularies.

**Files:**
- Modify: `examples/regis-dataset.cjs`
- Modify: `examples/README.md` (only if the end-to-end usage changes)

- [ ] **Step 1: Give pci-dss its own ladder**

In `examples/regis-dataset.cjs`, replace the `PLAYBOOKS` constant (lines 48-51) with:

```js
const PLAYBOOKS = [
  {
    id: 'default',
    title: 'Regis Default Playbook',
    version: '1.0.0',
    owner: 'team-platform',
    tiers: [
      { name: 'Gold', color: '#d4af37' },
      { name: 'Silver', color: '#9ca3af' },
      { name: 'Bronze', color: '#cd7f32' },
    ],
  },
  {
    id: 'pci-dss',
    title: 'PCI-DSS Hardened Playbook',
    version: '2.1.0',
    owner: 'team-payments',
    tiers: [
      { name: 'Platinum', color: '#7e57c2' },
      { name: 'Certified', color: '#26a69a' },
      { name: 'Provisional', color: '#ef6c00' },
    ],
  },
];
```

- [ ] **Step 2: Use a pci-dss tier name for the pci-dss image**

The only `pci-dss` image is `payments-gateway` (lines 79-85), currently `tier: 'Silver'`. Change its tier to a name from the pci-dss ladder so the demo data is internally consistent. In that image object, replace `tier: 'Silver',` with:

```js
    tier: 'Certified',
```

- [ ] **Step 3: Emit playbook tiers in the index base document**

Find where the generator writes the index base (`index.json`) — search the file for the object that contains `schemaVersion: 1` and a `playbooks` field (around line 145). Ensure the `playbooks` entry written to `index.json` includes each playbook's `tiers`. If the generator maps `PLAYBOOKS` into the index with an explicit field list (e.g. `PLAYBOOKS.map(p => ({ id: p.id, title: p.title, version: p.version, owner: p.owner }))`), add `tiers: p.tiers` to that mapping. If it spreads `PLAYBOOKS` directly, no change is needed (the `tiers` field flows through).

Run: `node -e "const m=require('./examples/regis-dataset.cjs')" 2>/dev/null; grep -n "playbooks" examples/regis-dataset.cjs`
Use the output to locate the exact emission site, then make the minimal edit so `tiers` reaches `index.json`.

- [ ] **Step 4: Regenerate the dataset**

Run: `node examples/regis-dataset.cjs`
Expected: regenerates `examples/` files with no error.

- [ ] **Step 5: Verify the index carries tiers and the schema still validates**

Run: `node -e "const {validateReportIndex}=require('./plugins/regis-common/src/report-index'); const fs=require('fs'); const i=JSON.parse(fs.readFileSync([...require('child_process').execSync('ls examples/**/index.json',{shell:'/bin/zsh'}).toString().trim().split('\n')][0],'utf8')); console.log(JSON.stringify(i.playbooks,null,0));"`

If that path glob is awkward, instead open the generated `index.json` under `examples/` and confirm each playbook object has a `tiers` array. The `default` playbook must list Gold/Silver/Bronze and `pci-dss` must list Platinum/Certified/Provisional.

- [ ] **Step 6: Commit**

```bash
git add examples/
git commit -m "feat(examples): pci-dss gets a distinct tier ladder; emit tiers in the index"
```

---

## Task 14: Regenerate API report, full verification

**Files:**
- Modify: generated `report.api.md` files (via `yarn fix`).

- [ ] **Step 1: Regenerate API extracts and apply lint fixes**

Run: `yarn fix`
Expected: updates `plugins/regis-common/report.api.md` (and any other affected `report.api.md`) to reflect the new exported types. No manual edits.

- [ ] **Step 2: Typecheck the whole repo**

Run: `yarn tsc`
Expected: PASS with no errors.

- [ ] **Step 3: Run the full test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false`
Expected: PASS — all packages.

- [ ] **Step 4: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: regenerate api report for playbook-defined tiers"
```

---

## Self-review notes

- **Spec coverage:** index `tiers` (Task 1), generic `TrendBucket`/`PortfolioTrend`/`TrendBand`/`PlaybookLadder` (Task 2), `LadderResolver` with index→discovery→config cascade and deterministic palette (Task 3), rank + playbook aggregation preserving carry-forward and handling uneven ladder depth (Task 4), aggregator playbook filter/facets/`playbookLadders` (Task 5), `?playbook=` + `GET /playbooks` (Task 6), plugin wiring of `loadPlaybooks` + overrides (Task 7), ladder-driven `tierColor` + graceful fallback (Task 8), client `getPlaybooks`/filter (Task 9), data-driven chart (Task 10), playbook selector + dynamic KPIs (Task 11), posture-card ordering (Task 12), multi-ladder demo data (Task 13), API regen + full verification (Task 14). All spec sections map to a task.
- **Out of scope (per spec):** JSON Logic conditions, in-Backstage tier re-evaluation, `scoreStatus` thresholds, governance/intake — none are touched.
- **Type consistency:** `TrendBand {key,label,color}`, `TrendBucket {date,counts,total,avgScore}`, `resolveLadders`→`LadderMap` (`Map<string, ResolvedTier[]>`), `aggregateTrend`→`{bands,buckets}`, `trend()`→`TrendResult`, `playbookLadders()`→`PlaybookLadder[]`, `tierColor(tier, ladder?: TrendBand[])`, `getPlaybooks()→PlaybooksResponse` — used consistently across tasks.
- **Graceful degradation:** no `loadPlaybooks` (no `indexDirUrl`) → discovery from snapshots; no `/playbooks` ladder for a tier → deterministic palette; missing tier → neutral grey. Covered by tests in Tasks 3, 8.
