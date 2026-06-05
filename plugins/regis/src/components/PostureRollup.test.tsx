import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import type { ReportSummary } from '../api/RegisApi';
import { PostureRollup } from './PostureRollup';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const row = (p: Partial<ReportSummary>): ReportSummary => ({
  entityRef: p.entityRef ?? 'resource:default/x',
  status: p.status ?? 'ok',
  tier: p.tier,
  score: p.score,
});

describe('PostureRollup', () => {
  it('shows counts, the worst tier, and the no-report count', () => {
    const rows = [
      row({ entityRef: 'a', tier: 'Gold' }),
      row({ entityRef: 'b', tier: 'Bronze' }),
      row({ entityRef: 'c', status: 'pending', tier: null }),
    ];
    render(<PostureRollup rows={rows} ladder={ladder} />);
    expect(screen.getByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    expect(screen.getByText(/Worst: Bronze · 1/)).toBeInTheDocument();
    expect(screen.getByText(/1 no report/)).toBeInTheDocument();
  });

  it('hides the worst indicator when all images are at the best tier', () => {
    render(<PostureRollup rows={[row({ tier: 'Gold' })]} ladder={ladder} />);
    expect(screen.queryByText(/Worst:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no report/)).not.toBeInTheDocument();
  });

  it('renders nothing for an empty set', () => {
    const { container } = render(<PostureRollup rows={[]} ladder={ladder} />);
    expect(container).toBeEmptyDOMElement();
  });
});
