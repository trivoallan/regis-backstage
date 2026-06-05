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
