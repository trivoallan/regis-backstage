import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';

/** Dependency-free SVG sparkline of score over time, dots colored by tier. */
export function Sparkline({
  history,
  ladder,
}: {
  history: ReportHistory;
  ladder: TrendBand[];
}) {
  const pts = history.snapshots.filter(
    (s): s is typeof s & { score: number } => typeof s.score === 'number',
  );
  if (pts.length < 2) {
    return <span>Not enough history to plot a trend yet.</span>;
  }
  const W = 320;
  const H = 64;
  const P = 6;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (score: number) => H - P - (score / 100) * (H - 2 * P);
  const line = pts.map((s, i) => `${x(i)},${y(s.score)}`).join(' ');
  return (
    <svg width={W} height={H} role="img" aria-label="score trajectory">
      <polyline fill="none" stroke="currentColor" strokeWidth={2} points={line} />
      {pts.map((s, i) => (
        <circle key={s.snapshotDate} cx={x(i)} cy={y(s.score)} r={3} fill={tierColor(s.tier, ladder)}>
          <title>{`${s.snapshotDate}: ${s.score} (${s.tier ?? 'none'})`}</title>
        </circle>
      ))}
    </svg>
  );
}
