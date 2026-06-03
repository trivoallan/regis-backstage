import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { regisApiRef, type PortfolioTrend } from '../api/RegisApi';
import { RegisPortfolioTrendsPage } from './RegisPortfolioTrendsPage';

const trend: PortfolioTrend = {
  generatedAt: '2026-06-03T00:00:00.000Z',
  days: 2,
  buckets: [
    { date: '2026-06-02', gold: 1, silver: 1, bronze: 0, none: 0, total: 2, avgScore: 80 },
    { date: '2026-06-03', gold: 2, silver: 0, bronze: 0, none: 0, total: 2, avgScore: 95 },
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
          },
        ],
      ]}
    >
      <RegisPortfolioTrendsPage />
    </TestApiProvider>,
  );

describe('RegisPortfolioTrendsPage', () => {
  it('renders KPI cards and the chart from the latest bucket', async () => {
    await renderPage(async () => trend);
    expect(await screen.findByText('Portfolio Trends')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /portfolio posture over time/i })).toBeInTheDocument();
    // latest avg score KPI
    expect(screen.getByText('95')).toBeInTheDocument();
    // silver went from 1 → 0, so delta should be downward
    expect(await screen.findByText(/▼ 1/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    await renderPage(async () => ({ generatedAt: 'x', days: 90, buckets: [] }));
    expect(await screen.findByText(/no portfolio history recorded yet/i)).toBeInTheDocument();
  });
});
