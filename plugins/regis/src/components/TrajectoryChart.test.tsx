import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReportHistory, TrendBand } from '@regis/backstage-plugin-regis-common';
import { TrajectoryChart } from './TrajectoryChart';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const history: ReportHistory = {
  imageRef: 'r/x:1',
  snapshots: [
    { imageRef: 'r/x:1', snapshotDate: '2026-01-01', score: 92, tier: 'Gold', recordedAt: '2026-01-01T00:00:00.000Z' },
    { imageRef: 'r/x:1', snapshotDate: '2026-02-01', score: 84, tier: 'Silver', recordedAt: '2026-02-01T00:00:00.000Z' },
    { imageRef: 'r/x:1', snapshotDate: '2026-03-01', score: 64, tier: 'Bronze', recordedAt: '2026-03-01T00:00:00.000Z' },
  ],
};

describe('TrajectoryChart', () => {
  it('renders an svg with a score line and one lane segment per tier span', () => {
    render(<TrajectoryChart history={history} ladder={ladder} />);
    const svg = screen.getByRole('img', { name: 'score trajectory' });
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector('polyline')).toBeInTheDocument();
    expect(screen.getAllByTestId('tier-lane-seg')).toHaveLength(3);
    // Every lane segment must be visible — including the last (single-point) span.
    screen.getAllByTestId('tier-lane-seg').forEach(seg => {
      expect(Number(seg.getAttribute('width'))).toBeGreaterThan(0);
    });
  });

  it('renders the insufficient-history message for fewer than 2 points', () => {
    const one: ReportHistory = {
      imageRef: 'r/x:1',
      snapshots: [{ imageRef: 'r/x:1', snapshotDate: '2026-01-01', score: 92, tier: 'Gold', recordedAt: '2026-01-01T00:00:00.000Z' }],
    };
    render(<TrajectoryChart history={one} ladder={ladder} />);
    expect(screen.getByText(/Not enough history/)).toBeInTheDocument();
  });

  it('renders in compact mode (svg + lane still present)', () => {
    render(<TrajectoryChart history={history} ladder={ladder} compact />);
    expect(screen.getByRole('img', { name: 'score trajectory' })).toBeInTheDocument();
    expect(screen.getAllByTestId('tier-lane-seg').length).toBeGreaterThan(0);
  });
});
