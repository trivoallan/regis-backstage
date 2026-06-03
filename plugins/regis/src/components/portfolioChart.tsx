import type { TrendBucket } from '@regis/backstage-plugin-regis-common';

const TIER_COLOR: Record<string, string> = {
  gold: '#d4af37',
  silver: '#9ca3af',
  bronze: '#cd7f32',
  none: '#e5e7eb',
};
const BANDS = ['gold', 'silver', 'bronze', 'none'] as const;

/** Dependency-free stacked-area chart of tier counts + an average-score line. */
export function PortfolioStackedArea({ buckets }: { buckets: TrendBucket[] }) {
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

  // Cumulative stack: each band's top edge is the running sum up to and including it.
  const cumulativeTops = buckets.map(b => {
    let acc = 0;
    return BANDS.map(tier => (acc += b[tier]));
  });

  const bands = BANDS.map((tier, bandIdx) => {
    const topPts = buckets.map((_, i) => `${x(i)},${yCount(cumulativeTops[i][bandIdx])}`);
    const bottomPts = buckets
      .map((_, i) => {
        const below = bandIdx === 0 ? 0 : cumulativeTops[i][bandIdx - 1];
        return `${x(i)},${yCount(below)}`;
      })
      .reverse();
    return { tier, points: [...topPts, ...bottomPts].join(' ') };
  });

  const scoreLine = buckets.map((b, i) => `${x(i)},${yScore(b.avgScore)}`).join(' ');

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="portfolio posture over time"
    >
      {bands.map(band => (
        <polygon
          key={band.tier}
          points={band.points}
          fill={TIER_COLOR[band.tier]}
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
    </svg>
  );
}
