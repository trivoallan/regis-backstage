// plugins/regis/src/components/KpiStrip.test.tsx
import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { KpiStrip } from './KpiStrip';
import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';

const bands: TrendBand[] = [
  { key: 'rank1', label: 'Rank 1', color: '#2e7d32' },
  { key: 'none', label: 'Untiered', color: '#e5e7eb' },
];
const buckets: TrendBucket[] = [
  { date: '2026-06-01', counts: { rank1: 1, none: 0 }, total: 1, avgScore: 90 },
  { date: '2026-06-02', counts: { rank1: 2, none: 0 }, total: 2, avgScore: 92 },
];

describe('KpiStrip', () => {
  it('renders a KPI per band plus avg score and images, from the latest bucket', async () => {
    await renderInTestApp(<KpiStrip bands={bands} buckets={buckets} days={90} />);
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
    expect(screen.getByText('Untiered')).toBeInTheDocument();
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1); // latest rank1 count / total
  });

  it('renders nothing for an empty series', async () => {
    const { container } = await renderInTestApp(<KpiStrip bands={bands} buckets={[]} days={90} />);
    expect(container.textContent).toBe('');
  });
});
