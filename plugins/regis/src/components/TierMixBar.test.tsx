import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { MixEntry } from './rollup';
import { TierMixBar } from './TierMixBar';

const entries: MixEntry[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37', count: 3 },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32', count: 1 },
];

describe('TierMixBar', () => {
  it('renders the labelled bar and the legend', () => {
    render(<TierMixBar entries={entries} />);
    expect(screen.getByLabelText('Tier distribution: 3 Gold, 1 Bronze')).toBeInTheDocument();
    expect(screen.getByText('3 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
  });

  it('uses a custom aria prefix and renders the trailing slot', () => {
    render(<TierMixBar entries={entries} ariaPrefix="Mix" trailing={<span>WORST</span>} />);
    expect(screen.getByLabelText('Mix: 3 Gold, 1 Bronze')).toBeInTheDocument();
    expect(screen.getByText('WORST')).toBeInTheDocument();
  });
});
