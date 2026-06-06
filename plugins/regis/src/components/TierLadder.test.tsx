import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { TierLadder } from './TierLadder';

const tiers: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

describe('TierLadder', () => {
  it('renders a colored chip per tier', () => {
    render(<TierLadder tiers={tiers} />);
    const chip = screen.getByText('Silver').closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#9ca3af' });
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();
  });

  it('renders nothing when there are no tiers', () => {
    const { container } = render(<TierLadder tiers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
