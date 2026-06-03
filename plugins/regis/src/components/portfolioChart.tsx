import type { TrendBucket } from '@regis/backstage-plugin-regis-common';

// none: '#e5e7eb' (light grey) is an intentional divergence from RegisTrajectoryCard's none colour,
// chosen so the untiered band is distinguishable from silver in a stacked area.
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

  const LEGEND_ENTRIES: Array<{ key: string; label: string; color?: string; dashed?: boolean }> = [
    { key: 'gold', label: 'Gold', color: TIER_COLOR.gold },
    { key: 'silver', label: 'Silver', color: TIER_COLOR.silver },
    { key: 'bronze', label: 'Bronze', color: TIER_COLOR.bronze },
    { key: 'none', label: 'Untiered', color: TIER_COLOR.none },
    { key: 'avg', label: 'Avg score (0–100)', dashed: true },
  ];

  return (
    <div>
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
        <text x={P} y={H - 4} fontSize={10} fill="#6b7280" textAnchor="start">
          {buckets[0].date}
        </text>
        <text x={W - P} y={H - 4} fontSize={10} fill="#6b7280" textAnchor="end">
          {buckets[n - 1].date}
        </text>
      </svg>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '12px', marginTop: 8, fontSize: 12, color: '#374151' }}>
        {LEGEND_ENTRIES.map(entry => (
          <span key={entry.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {entry.dashed ? (
              <svg width={16} height={10} style={{ display: 'inline-block' }}>
                <line x1={0} y1={5} x2={16} y2={5} stroke="#111827" strokeWidth={2} strokeDasharray="4 2" />
              </svg>
            ) : (
              <span style={{ display: 'inline-block', width: 10, height: 10, background: entry.color }} />
            )}
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
