import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [{ key: 'Gold', label: 'Gold', color: '#d4af37' }];
const history: ReportHistory = {
  imageRef: 'r/n:1',
  snapshots: [
    { imageRef: 'r/n:1', snapshotDate: '2026-05-01', score: 70, tier: 'Gold', recordedAt: '2026-05-01T00:00:00.000Z' },
    { imageRef: 'r/n:1', snapshotDate: '2026-06-01', score: 100, tier: 'Gold', recordedAt: '2026-06-01T00:00:00.000Z' },
  ],
};

describe('Sparkline', () => {
  it('plots a dot per scored snapshot, colored by the ladder', () => {
    render(<Sparkline history={history} ladder={ladder} />);
    const svg = screen.getByRole('img', { name: /score trajectory/i });
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    const fills = Array.from(svg.querySelectorAll('circle')).map(c => c.getAttribute('fill'));
    expect(fills).toContain('#d4af37');
  });

  it('shows a message when there are fewer than two scored points', () => {
    render(<Sparkline history={{ imageRef: 'x', snapshots: [] }} ladder={ladder} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });
});
