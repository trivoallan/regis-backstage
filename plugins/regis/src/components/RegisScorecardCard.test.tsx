import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisScorecardCard } from './RegisScorecardCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'img',
    annotations: {
      'regis.io/report-url': 'https://h/r.json',
      'regis.io/playbook': 'resource:default/regis-playbook-default',
    },
  },
  spec: {},
};

const playbooks = {
  playbooks: [
    {
      id: 'default',
      tiers: [
        { key: 'Gold', label: 'Gold', color: '#d4af37' },
        { key: 'Silver', label: 'Silver', color: '#9ca3af' },
        { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
      ],
    },
  ],
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisScorecardCard', () => {
  it('shows score, tier chip in ladder color, badges, counts and playbook footnote', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
          badges: [
            { scope: 'security', value: 'B', class: 'warning' },
            { scope: 'hygiene', value: 'A', class: 'success' },
          ],
          rules: [
            { slug: 'g1', description: 'd', level: 'high', passed: true, status: 'passed', message: '' },
            { slug: 'g2', description: 'd', level: 'critical', passed: false, status: 'failed', message: '' },
          ],
          rules_summary: {
            score: 73,
            by_tag: {
              security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
              hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
            },
          },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => playbooks,
    });

    expect(await screen.findByText('73')).toBeInTheDocument();
    const chip = (await screen.findByText('Silver')).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#9ca3af' });
    expect(screen.getByText(/security · B/)).toBeInTheDocument();
    expect(screen.getByText(/hygiene · A/)).toBeInTheDocument();
    expect(screen.getByText(/1 passed/)).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    const playbookLink = await screen.findByText('base-image-policy');
    expect(playbookLink.closest('a')).toHaveAttribute(
      'href',
      '/catalog/default/resource/regis-playbook-default',
    );
    // No next-tier claims are made any more.
    expect(screen.queryByText(/rules left for/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Top tier/i)).not.toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    await renderCard({
      getReport: async () => {
        throw new Error('boom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
