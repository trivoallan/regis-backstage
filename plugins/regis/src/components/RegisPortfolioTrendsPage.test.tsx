import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { regisApiRef } from '../api/RegisApi';
import { RegisPortfolioTrendsPage } from './RegisPortfolioTrendsPage';

const api = {
  getPortfolioTrend: jest.fn().mockResolvedValue({
    generatedAt: '2026-06-03T00:00:00.000Z',
    days: 90,
    filters: {},
    facets: { systems: [], owners: [], playbooks: ['p3'] },
    bands: [
      { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
      { key: 'none', label: 'Untiered', color: '#e5e7eb' },
    ],
    buckets: [
      { date: '2026-06-01', counts: { rank1: 1, none: 0 }, total: 1, avgScore: 90 },
      { date: '2026-06-02', counts: { rank1: 2, none: 0 }, total: 2, avgScore: 92 },
    ],
  }),
  getPlaybooks: jest.fn(),
  getReport: jest.fn(),
  listReports: jest.fn(),
  getHistory: jest.fn(),
};

describe('RegisPortfolioTrendsPage', () => {
  it('renders a KPI card per band label plus avg score and images', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <RegisPortfolioTrendsPage />
      </TestApiProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('Rank 1').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Untiered').length).toBeGreaterThan(0);
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    // No hardcoded vocabulary leaks through.
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
  });
});
