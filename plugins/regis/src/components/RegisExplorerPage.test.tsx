import '@testing-library/jest-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { screen, waitFor } from '@testing-library/react';
import { regisApiRef } from '../api/RegisApi';
import { RegisExplorerPage } from './RegisExplorerPage';

const explore = jest.fn().mockResolvedValue({
  filters: {},
  groupBy: 'system',
  trend: {
    bands: [{ key: 'rank1', label: 'Rank 1', color: '#2e7d32' }],
    buckets: [{ date: '2026-06-01', counts: { rank1: 2 }, total: 2, avgScore: 90 }],
  },
  groups: [{ key: 'shop', count: 2, avgScore: 90, tiers: { Gold: 2 } }],
  images: [{ imageRef: 'r/a:1', tier: 'Gold', score: 100, system: 'shop' }],
  facets: { systems: ['shop'], owners: [], playbooks: [], tiers: ['Gold'] },
});

const api = {
  explore,
  getPlaybooks: async () => ({ playbooks: [{ id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] }] }),
  getReport: async () => { throw new Error('x'); },
  listReports: async () => [],
  getHistory: async () => ({ imageRef: 'x', snapshots: [] }),
  getPortfolioTrend: async () => { throw new Error('x'); },
};

describe('RegisExplorerPage', () => {
  it('renders the scoped trend, breakdown and image list from explore()', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisExplorerPage />
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    await waitFor(() => expect(explore).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: /portfolio posture over time/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drill into shop/i })).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    expect(explore.mock.calls[0][0]).toMatchObject({ groupBy: 'system' });
  });
});
