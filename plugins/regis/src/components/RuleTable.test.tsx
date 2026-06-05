import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { RuleTable } from './RuleTable';
import type { Rule } from './posture';

const rules: Rule[] = [
  { slug: 'fail-sec', description: 'Run as non-root', tags: ['security'], level: 'high', passed: false, status: 'failed', message: 'no USER' },
  { slug: 'inc-sup', description: 'Provenance', tags: ['supply-chain'], level: 'medium', passed: false, status: 'incomplete', message: 'offline' },
  { slug: 'pass-hyg', description: 'Pinned base', tags: ['hygiene'], level: 'low', passed: true, status: 'passed', message: 'ok' },
];

describe('RuleTable', () => {
  it('hides passing rules by default and reveals them via the toggle', async () => {
    await renderInTestApp(<RuleTable rules={rules} />);
    expect(await screen.findByText('Run as non-root')).toBeInTheDocument();
    expect(screen.getByText('Provenance')).toBeInTheDocument();
    expect(screen.queryByText('Pinned base')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/show passing/i));
    expect(await screen.findByText('Pinned base')).toBeInTheDocument();
  });

  it('renders failures before passes by default order', async () => {
    await renderInTestApp(<RuleTable rules={rules} />);
    const rows = await screen.findAllByText(/Run as non-root|Provenance/);
    expect(rows[0]).toHaveTextContent('Run as non-root');
  });
});
