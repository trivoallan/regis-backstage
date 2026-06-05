import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisRulesCard } from './RegisRulesCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'img',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisRulesCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisRulesCard', () => {
  it('renders the rule table and an explorer link when a playbook is present', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy' }],
          rules: [
            {
              slug: 'g2',
              description: 'no-root-user',
              level: 'critical',
              passed: false,
              status: 'failed',
              message: 'runs as root',
            },
          ],
          rules_summary: { score: 50, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({ playbooks: [] }),
    });

    expect(await screen.findByText('no-root-user')).toBeInTheDocument();
    const link = await screen.findByText('View in explorer');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      '/?groupBy=playbook&playbook=base-image-policy',
    );
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
