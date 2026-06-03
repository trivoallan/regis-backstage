import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { regisApiRef, type PortfolioTrend } from '../api/RegisApi';
import { RegisPortfolioTrendsPage } from './RegisPortfolioTrendsPage';

const trend: PortfolioTrend = {
  generatedAt: '2026-06-03T00:00:00.000Z',
  days: 2,
  filters: {},
  facets: {
    systems: ['shop', 'billing'],
    owners: ['group:default/team-x'],
    playbooks: ['default'],
  },
  bands: [
    { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
    { key: 'rank2', label: 'Rank 2', color: '#9e9d24' },
    { key: 'none', label: 'Untiered', color: '#e5e7eb' },
  ],
  buckets: [
    { date: '2026-06-02', counts: { rank1: 1, rank2: 1, none: 0 }, total: 2, avgScore: 80 },
    { date: '2026-06-03', counts: { rank1: 2, rank2: 0, none: 0 }, total: 2, avgScore: 95 },
  ],
};

const renderPage = (getPortfolioTrend: () => Promise<PortfolioTrend>) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            getPortfolioTrend,
            getReport: async () => { throw new Error('not used'); },
            listReports: async () => [],
            getHistory: async () => { throw new Error('not used'); },
            getPlaybooks: async () => ({ playbooks: [] }),
          },
        ],
      ]}
    >
      <RegisPortfolioTrendsPage />
    </TestApiProvider>,
  );

describe('RegisPortfolioTrendsPage', () => {
  it('renders a KPI card per band from the latest bucket, with no hardcoded vocabulary', async () => {
    await renderPage(async () => trend);
    expect(await screen.findByText('Portfolio Trends')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: /portfolio posture over time/i }),
    ).toBeInTheDocument();
    // KPI labels come from the response bands (also rendered in the chart legend,
    // hence getAllByText), plus the fixed Avg score / Images cards.
    expect(screen.getAllByText('Rank 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Untiered').length).toBeGreaterThan(0);
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    // latest avg score KPI value
    expect(screen.getByText('95')).toBeInTheDocument();
    // rank2 went 1 → 0, so its KPI delta should be downward
    expect(await screen.findByText(/▼ 1/)).toBeInTheDocument();
    // no stale Gold/Silver/Bronze vocabulary leaks through
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    await renderPage(async () => ({
      generatedAt: 'x',
      days: 90,
      filters: {},
      facets: { systems: [], owners: [], playbooks: [] },
      bands: [],
      buckets: [],
    }));
    expect(
      await screen.findByText(/no portfolio history recorded yet/i),
    ).toBeInTheDocument();
  });

  it('populates the System dropdown from facets and refetches on change', async () => {
    const getPortfolioTrend = jest.fn().mockResolvedValue(trend);
    await renderPage(getPortfolioTrend);
    // initial call: no filters set
    expect(getPortfolioTrend).toHaveBeenCalledWith(90, {
      system: undefined,
      owner: undefined,
      playbook: undefined,
    });
    // open the System select and pick "shop"
    const systemSelect = await screen.findByLabelText('System');
    fireEvent.mouseDown(systemSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'shop' }));
    // refetch with the filter applied
    expect(getPortfolioTrend).toHaveBeenCalledWith(90, {
      system: 'shop',
      owner: undefined,
      playbook: undefined,
    });
  });

  it('refetches with a playbook filter when the Playbook dropdown changes', async () => {
    const getPortfolioTrend = jest.fn().mockResolvedValue(trend);
    await renderPage(getPortfolioTrend);
    const playbookSelect = await screen.findByLabelText('Playbook');
    fireEvent.mouseDown(playbookSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'default' }));
    expect(getPortfolioTrend).toHaveBeenCalledWith(90, {
      system: undefined,
      owner: undefined,
      playbook: 'default',
    });
  });

  it('shows a filtered empty state', async () => {
    await renderPage(async () => ({
      generatedAt: 'x',
      days: 90,
      filters: { system: 'shop' },
      facets: { systems: ['shop'], owners: [], playbooks: [] },
      bands: [],
      buckets: [],
    }));
    expect(
      await screen.findByText(/no history for this filter/i),
    ).toBeInTheDocument();
  });
});
