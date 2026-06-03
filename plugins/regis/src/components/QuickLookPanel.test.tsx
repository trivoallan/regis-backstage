import '@testing-library/jest-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { screen } from '@testing-library/react';
import { regisApiRef } from '../api/RegisApi';
import { QuickLookPanel } from './QuickLookPanel';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];

const api = {
  getHistory: async () => ({
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    snapshots: [
      { imageRef: 'x', snapshotDate: '2026-05-01', score: 70, tier: 'Gold', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'x', snapshotDate: '2026-06-01', score: 100, tier: 'Gold', recordedAt: '2026-06-01T00:00:00.000Z' },
    ],
  }),
  getReport: async () => { throw new Error('not used'); },
  listReports: async () => [],
  getPortfolioTrend: async () => { throw new Error('not used'); },
  getPlaybooks: async () => ({ playbooks: [] }),
  explore: async () => { throw new Error('not used'); },
};

const renderPanel = (onClose = jest.fn()) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <QuickLookPanel
        imageRef="registry-1.docker.io/library/nginx:1.27"
        tier="Gold"
        score={100}
        ladder={ladder}
        onClose={onClose}
      />
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('QuickLookPanel', () => {
  it('shows tier/score, a trajectory, and a link to the full entity page', async () => {
    await renderPanel();
    expect(screen.getByText(/Gold/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /score trajectory/i })).toBeInTheDocument();
    expect(screen.getByText(/open full page/i)).toBeInTheDocument();
  });
});
