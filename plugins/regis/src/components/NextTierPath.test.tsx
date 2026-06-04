import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { NextTierPath } from './NextTierPath';
import type { Rule } from './posture';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
];

const rules: Rule[] = [
  { slug: 'a', description: 'Run as non-root', level: 'Gold', passed: false, status: 'failed', message: 'no USER' },
  { slug: 'b', description: 'Provenance verified', level: 'Gold', passed: false, status: 'incomplete', message: 'cosign offline' },
  { slug: 'c', description: 'Passing gold rule', level: 'Gold', passed: true, status: 'passed', message: '' },
];

describe('NextTierPath', () => {
  it('lists blocking rules for the next tier with an investigate marker for incompletes', () => {
    render(<NextTierPath rules={rules} tier="Silver" ladder={ladder} />);
    expect(screen.getByText(/Path to Gold/i)).toBeInTheDocument();
    expect(screen.getByText('Run as non-root')).toBeInTheDocument();
    expect(screen.getByText('Provenance verified')).toBeInTheDocument();
    expect(screen.getByText(/investigate/i)).toBeInTheDocument();
    expect(screen.queryByText('Passing gold rule')).not.toBeInTheDocument();
  });

  it('shows the maintained state at the top tier', () => {
    render(<NextTierPath rules={[]} tier="Gold" ladder={ladder} />);
    expect(screen.getByText(/Top tier/i)).toBeInTheDocument();
  });

  it('renders nothing when the ladder is unknown', () => {
    const { container } = render(<NextTierPath rules={rules} tier="Silver" ladder={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
