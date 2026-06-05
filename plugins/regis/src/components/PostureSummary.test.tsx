import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { PostureSummary } from './PostureSummary';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const report = {
  schemaVersion: 1,
  tier: 'Silver',
  playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
  request: { repository: 'library/nginx', tag: '1.25', timestamp: '2026-06-04T00:00:00Z' },
  rules_summary: {
    score: 73,
    by_tag: {
      security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
      hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
    },
  },
} as any;

describe('PostureSummary', () => {
  it('renders repo:tag, tier, score, playbook attribution and category bars', () => {
    render(<PostureSummary report={report} ladder={ladder} />);
    expect(screen.getByText('library/nginx:1.25')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText(/73/)).toBeInTheDocument();
    expect(screen.getByText('base-image-policy')).toBeInTheDocument();
    expect(screen.getByText(/v2\.3/)).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('hygiene')).toBeInTheDocument();
    expect(screen.getByText(/scanned 2026-06-04/i)).toBeInTheDocument();
  });

  it('links the playbook name to its entity when playbookRef is given', async () => {
    await renderInTestApp(
      <PostureSummary report={report} ladder={ladder} playbookRef="resource:default/regis-playbook-default" />,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    const link = await screen.findByText('base-image-policy');
    expect(link.closest('a')).toHaveAttribute('href', '/catalog/default/resource/regis-playbook-default');
  });

  it('omits category bars when by_tag is absent', () => {
    render(
      <PostureSummary
        report={{ ...report, rules_summary: { score: 50 } } as any}
        ladder={ladder}
      />,
    );
    expect(screen.queryByText('security')).not.toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });
});
