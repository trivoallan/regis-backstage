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

const renderCard = (
  getHistory: () => Promise<ReportHistory>,
  getPlaybooks: () => Promise<any> = async () => ({ playbooks: [] }),
) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            getHistory,
            getPlaybooks,
            getReport: async () => {
              throw new Error('not used');
            },
            listReports: async () => [],
            getPortfolioTrend: async () => {
              throw new Error('not used');
            },
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
  it('renders the trajectory chart and the latest posture when history exists', async () => {
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
    expect(screen.getByText(/▲ 30/)).toBeInTheDocument();
  });

  it('colors trajectory dots by the resolved playbook ladder', async () => {
    const getPlaybooks = async () => ({
      playbooks: [
        {
          id: 'pci-dss',
          tiers: [
            { key: 'Platinum', label: 'Platinum', color: '#7e57c2' },
            { key: 'Certified', label: 'Certified', color: '#26a69a' },
            { key: 'Provisional', label: 'Provisional', color: '#ef6c00' },
          ],
        },
      ],
    });
    await renderCard(
      async () => ({
        imageRef: 'r/pg:1',
        snapshots: [
          { imageRef: 'r/pg:1', snapshotDate: '2026-05-01', score: 62, tier: 'Provisional', playbook: 'pci-dss', recordedAt: '2026-05-01T00:00:00.000Z' },
          { imageRef: 'r/pg:1', snapshotDate: '2026-06-01', score: 78, tier: 'Certified', playbook: 'pci-dss', recordedAt: '2026-06-01T00:00:00.000Z' },
        ],
      }),
      getPlaybooks,
    );
    await screen.findByLabelText('score trajectory');
    const fills = Array.from(
      document.querySelectorAll('svg[aria-label="score trajectory"] circle'),
    ).map(c => c.getAttribute('fill'));
    // Real published colors, not the old hardcoded gold/silver/bronze map (which
    // rendered these pci-dss tiers grey).
    expect(fills).toContain('#26a69a'); // Certified
    expect(fills).toContain('#ef6c00'); // Provisional
  });

  it('shows an empty state when there is no history', async () => {
    await renderCard(async () => ({ imageRef: 'r/n:1', snapshots: [] }));
    expect(await screen.findByText('No history recorded yet.')).toBeInTheDocument();
  });

  it('shows an error panel when the history request fails', async () => {
    await renderCard(async () => {
      throw new Error('boom');
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
