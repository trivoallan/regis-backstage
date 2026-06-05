import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { regisApiRef } from '../api/RegisApi';
import { unionLadder } from './format';
import { TrajectoryChart } from './TrajectoryChart';
import { points, summary } from './trajectory';
import { formatDelta } from './trendSummary';

/** Score/tier trajectory of a container-image entity over time. */
export function RegisTrajectoryCard() {
  const { entity } = useEntity();
  const api = useApi(regisApiRef);
  const entityRef = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.getHistory(entityRef), api.getPlaybooks()]),
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

  const [history, playbooksResp] = value ?? [undefined, undefined];
  const snapshots = history?.snapshots ?? [];
  if (!history || snapshots.length === 0) {
    return <InfoCard title="Trajectory">No history recorded yet.</InfoCard>;
  }
  const ladder = unionLadder(playbooksResp?.playbooks);
  const s = summary(points(history));
  return (
    <InfoCard
      title="Trajectory"
      subheader={`${snapshots.length} snapshots · latest ${
        s.latestTier ?? 'none'
      } (${s.latestScore ?? '—'}) · ${formatDelta(s.delta)}`}
    >
      <TrajectoryChart history={history} ladder={ladder} />
    </InfoCard>
  );
}
