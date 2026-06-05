import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PortfolioStackedArea } from './portfolioChart';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

const bands: TrendBand[] = [
  { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
  { key: 'rank2', label: 'Rank 2', color: '#9e9d24' },
  { key: 'none', label: 'Untiered', color: '#e5e7eb' },
];
const buckets: TrendBucket[] = [
  { date: '2026-06-01', counts: { rank1: 1, rank2: 1, none: 0 }, total: 2, avgScore: 80 },
  { date: '2026-06-02', counts: { rank1: 2, rank2: 0, none: 0 }, total: 2, avgScore: 95 },
];

describe('PortfolioStackedArea', () => {
  it('renders one polygon per band plus the score line, and a legend from bands', () => {
    render(<PortfolioStackedArea bands={bands} buckets={buckets} />);
    const svg = screen.getByRole('img', { name: /portfolio posture over time/i });
    expect(svg.querySelectorAll('polygon')).toHaveLength(3);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Untiered')).toBeInTheDocument();
    expect(screen.getByText(/avg score/i)).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-02')).toBeInTheDocument();
  });

  it('renders nothing meaningful for an empty series', () => {
    render(<PortfolioStackedArea bands={bands} buckets={[]} />);
    expect(screen.getByText(/no portfolio data/i)).toBeInTheDocument();
  });
});
