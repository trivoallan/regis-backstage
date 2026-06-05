import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { tierColor } from './format';
import { points, tierSpans } from './trajectory';


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
        const startX = idx === 0 ? left : (x(sp.fromIndex) + x(sp.fromIndex - 1)) / 2;
        const endX =
          idx === spans.length - 1
            ? W - right
            : (x(sp.toIndex) + x(sp.toIndex + 1)) / 2;
        const segW = Math.max(0, endX - startX);
        return (
          <g key={sp.fromIndex}>
            <rect
              data-testid="tier-lane-seg"
              x={startX}
              y={laneTop}
              width={segW}
              height={laneH}
              rx={3}
              fill={tierColor(sp.tier, ladder)}
            />
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
