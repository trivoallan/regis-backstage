import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisTabContent } from './RegisTabContent';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'svc',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
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
  );

describe('RegisTabContent', () => {
  it('groups rules by tag and shows the image reference', async () => {
    await renderTab({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Gold',
          request: { repository: 'library/nginx', tag: '1.27' },
          rules: [
            {
              slug: 'no-critical-cve',
              description: 'No critical CVEs',
              tags: ['security'],
              passed: true,
              status: 'passed',
              message: 'ok',
            },
          ],
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
    });
    expect(await screen.findByText(/library\/nginx/)).toBeInTheDocument();
    expect(await screen.findByText('No critical CVEs')).toBeInTheDocument();
    expect(await screen.findByText(/security/i)).toBeInTheDocument();
  });

  it('renders an error panel on failure', async () => {
    await renderTab({
      getReport: async () => {
        throw new Error('unreachable');
      },
    });
    expect((await screen.findAllByText(/unreachable/)).length).toBeGreaterThan(
      0,
    );
  });
});
