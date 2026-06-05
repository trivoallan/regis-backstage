import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider, entityRouteRef } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisTabContent } from './RegisTabContent';

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

const renderTab = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisTabContent />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisTabContent', () => {
  it('renders the summary and the rule table', async () => {
    await renderTab({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }],
          request: { repository: 'library/nginx', tag: '1.25', timestamp: '2026-06-04T00:00:00Z' },
          rules: [
            { slug: 'a', description: 'Run as non-root', tags: ['security'], level: 'high', passed: false, status: 'failed', message: 'no USER' },
          ],
          rules_summary: { score: 73, by_tag: { security: { rules: ['a'], passed_rules: [], score: 0 } } },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({
        playbooks: [
          { id: 'default', tiers: [
            { key: 'Gold', label: 'Gold', color: '#d4af37' },
            { key: 'Silver', label: 'Silver', color: '#9ca3af' },
          ] },
        ],
      }),
    });

    expect(await screen.findByText('library/nginx:1.25')).toBeInTheDocument();
    expect((await screen.findAllByText('Run as non-root')).length).toBeGreaterThan(0);

    const explore = await screen.findByText('View in explorer');
    expect(explore.closest('a')).toHaveAttribute('href', '/?groupBy=playbook&playbook=base-image-policy');
  });

  it('omits the View in explorer link when the report names no playbook', async () => {
    await renderTab({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: undefined,
          request: { repository: 'library/nginx', tag: '1.25', timestamp: '2026-06-04T00:00:00Z' },
          rules: [
            { slug: 'a', description: 'Run as non-root', tags: ['security'], level: 'high', passed: false, status: 'failed', message: 'no USER' },
          ],
          rules_summary: { score: 73, by_tag: { security: { rules: ['a'], passed_rules: [], score: 0 } } },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({
        playbooks: [
          { id: 'default', tiers: [
            { key: 'Gold', label: 'Gold', color: '#d4af37' },
            { key: 'Silver', label: 'Silver', color: '#9ca3af' },
          ] },
        ],
      }),
    });

    expect(await screen.findByText('library/nginx:1.25')).toBeInTheDocument();
    expect(screen.queryByText('View in explorer')).not.toBeInTheDocument();
  });

  it('renders an error panel when the report fails to load', async () => {
    await renderTab({
      getReport: async () => {
        throw new Error('kaboom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/kaboom/)).length).toBeGreaterThan(0);
  });
});
