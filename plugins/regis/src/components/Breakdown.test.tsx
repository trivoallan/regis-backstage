import '@testing-library/jest-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { Breakdown } from './Breakdown';
import type { ExploreGroup, TrendBand } from '@regis/backstage-plugin-regis-common';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];
const groups: ExploreGroup[] = [
  { key: 'team-payments', count: 3, avgScore: 71, tiers: { Gold: 1, Bronze: 2 } },
];

describe('Breakdown', () => {
  it('renders a row per group and drills on click', async () => {
    const onDrill = jest.fn();
    await renderInTestApp(<Breakdown groups={groups} ladder={ladder} onDrill={onDrill} />);
    const row = screen.getByRole('button', { name: /team-payments/ });
    expect(row).toBeInTheDocument();
    expect(screen.getByText('71')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onDrill).toHaveBeenCalledWith('team-payments');
  });
});
