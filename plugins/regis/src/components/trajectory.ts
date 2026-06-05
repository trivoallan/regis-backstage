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
