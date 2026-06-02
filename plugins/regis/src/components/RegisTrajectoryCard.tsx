import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { regisApiRef, type ReportHistory } from '../api/RegisApi';

const TIER_COLOR: Record<string, string> = {
  gold: '#d4af37',
  silver: '#9ca3af',
  bronze: '#cd7f32',
  none: '#9ca3af',
};

/** Dependency-free SVG sparkline of score over time, dots coloured by tier. */
function Sparkline({ history }: { history: ReportHistory }) {
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
        <circle
          key={s.snapshotDate}
          cx={x(i)}
          cy={y(s.score)}
          r={3}
          fill={TIER_COLOR[(s.tier ?? 'none').toLowerCase()] ?? 'currentColor'}
        >
          <title>{`${s.snapshotDate}: ${s.score} (${s.tier ?? 'none'})`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Score/tier trajectory of a container-image entity over time. */
export function RegisTrajectoryCard() {
  const { entity } = useEntity();
  const api = useApi(regisApiRef);
  const entityRef = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(
    () => api.getHistory(entityRef),
    [entityRef],
  );

  if (loading) {
    return (
      <InfoCard title="Trajectory">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Trajectory">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const snapshots = value?.snapshots ?? [];
  if (snapshots.length === 0) {
    return <InfoCard title="Trajectory">No history recorded yet.</InfoCard>;
  }

  const latest = snapshots[snapshots.length - 1];
  return (
    <InfoCard
      title="Trajectory"
      subheader={`${snapshots.length} snapshots · latest ${
        latest.tier ?? 'none'
      } (${latest.score ?? '—'})`}
    >
      <Sparkline history={value!} />
    </InfoCard>
  );
}
