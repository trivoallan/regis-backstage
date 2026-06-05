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
