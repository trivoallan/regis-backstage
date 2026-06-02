import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportHistory } from '../api/RegisApi';
import { RegisTrajectoryCard } from './RegisTrajectoryCard';

const image: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'library-nginx-1.27', namespace: 'default' },
  spec: { type: 'container-image' },
};

const renderCard = (getHistory: () => Promise<ReportHistory>) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            getHistory,
            getReport: async () => {
              throw new Error('not used');
            },
            listReports: async () => [],
          },
        ],
      ]}
    >
      <EntityProvider entity={image}>
        <RegisTrajectoryCard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisTrajectoryCard', () => {
  it('renders a sparkline and the latest posture when history exists', async () => {
    await renderCard(async () => ({
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      snapshots: [
        { imageRef: 'r/n:1', snapshotDate: '2026-05-01', score: 70, tier: 'Silver', recordedAt: '2026-05-01T00:00:00.000Z' },
        { imageRef: 'r/n:1', snapshotDate: '2026-05-09', score: 100, tier: 'Gold', recordedAt: '2026-05-09T00:00:00.000Z' },
      ],
    }));
    expect(await screen.findByText('Trajectory')).toBeInTheDocument();
    expect(await screen.findByLabelText('score trajectory')).toBeInTheDocument();
    expect(screen.getByText(/latest Gold/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    await renderCard(async () => ({ imageRef: 'r/n:1', snapshots: [] }));
    expect(await screen.findByText('No history recorded yet.')).toBeInTheDocument();
  });
});
