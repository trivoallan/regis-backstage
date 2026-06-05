import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { PortfolioHealth } from './PortfolioHealth';

const bands: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const buckets: TrendBucket[] = [
  { date: '2026-06-01', counts: { Gold: 8, Silver: 6, Bronze: 5 }, total: 19, avgScore: 78 },
  { date: '2026-06-02', counts: { Gold: 11, Silver: 7, Bronze: 4 }, total: 22, avgScore: 82 },
];

describe('PortfolioHealth', () => {
  it('shows the mix, worst tier and the headline KPIs with deltas', async () => {
    await renderInTestApp(<PortfolioHealth bands={bands} buckets={buckets} days={90} />);
    expect(await screen.findByText('11 Gold')).toBeInTheDocument();
    expect(screen.getByText('4 Bronze')).toBeInTheDocument();
    expect(screen.getByText(/Worst: Bronze · 4/)).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText(/▲ 4 \/ 90d/)).toBeInTheDocument();
    expect(screen.getByText(/▲ 3 \/ 90d/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tier distribution: 11 Gold, 7 Silver, 4 Bronze/)).toBeInTheDocument();
  });

  it('renders nothing when there are no buckets', async () => {
    const { container } = await renderInTestApp(
      <PortfolioHealth bands={bands} buckets={[]} days={90} />,
    );
    expect(container.querySelector('[aria-label^="Tier distribution"]')).toBeNull();
  });
});
