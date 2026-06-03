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
