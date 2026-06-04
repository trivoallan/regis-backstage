import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
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
  it('lists blocking rules for the next tier with an investigate marker for incompletes', async () => {
    await renderInTestApp(<NextTierPath rules={rules} tier="Silver" ladder={ladder} />);
    expect(await screen.findByText(/Path to Gold/i)).toBeInTheDocument();
    expect(screen.getByText('Run as non-root')).toBeInTheDocument();
    expect(screen.getByText('Provenance verified')).toBeInTheDocument();
    expect(screen.getByText(/investigate/i)).toBeInTheDocument();
    expect(screen.queryByText('Passing gold rule')).not.toBeInTheDocument();
  });

  it('shows the maintained state at the top tier', async () => {
    await renderInTestApp(<NextTierPath rules={[]} tier="Gold" ladder={ladder} />);
    expect(await screen.findByText(/Top tier/i)).toBeInTheDocument();
  });

  it('shows an awaiting-promotion message when no rules block the next tier', async () => {
    const allPass: Rule[] = [
      { slug: 'g', description: 'gold rule', level: 'Gold', passed: true, status: 'passed', message: '' },
    ];
    await renderInTestApp(<NextTierPath rules={allPass} tier="Silver" ladder={ladder} />);
    expect(await screen.findByText(/awaiting promotion/i)).toBeInTheDocument();
  });

  it('renders nothing when the ladder is unknown', async () => {
    await renderInTestApp(<NextTierPath rules={rules} tier="Silver" ladder={[]} />);
    expect(screen.queryByText(/Path to/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Top tier/i)).not.toBeInTheDocument();
  });
});
