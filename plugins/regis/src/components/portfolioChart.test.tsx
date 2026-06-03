import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PortfolioStackedArea } from './portfolioChart';
import type { TrendBucket } from '@regis/backstage-plugin-regis-common';

const buckets: TrendBucket[] = [
  { date: '2026-06-01', gold: 1, silver: 1, bronze: 0, none: 0, total: 2, avgScore: 80 },
  { date: '2026-06-02', gold: 2, silver: 0, bronze: 0, none: 0, total: 2, avgScore: 95 },
];

describe('PortfolioStackedArea', () => {
  it('renders an svg with one stacked band polygon per tier plus a score line', () => {
    render(<PortfolioStackedArea buckets={buckets} />);
    const svg = screen.getByRole('img', { name: /portfolio posture over time/i });
    expect(svg).toBeInTheDocument();
    // 4 tier bands + 1 score polyline
    expect(svg.querySelectorAll('polygon')).toHaveLength(4);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('renders nothing meaningful for an empty series', () => {
    render(<PortfolioStackedArea buckets={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
