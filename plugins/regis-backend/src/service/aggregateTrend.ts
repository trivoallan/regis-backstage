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
