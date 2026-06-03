import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisScorecardCard } from './RegisScorecardCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'svc',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisScorecardCard', () => {
  it('shows tier and score, with the tier chip in the playbook ladder color', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Gold',
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({
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
      }),
    });
    const label = await screen.findByText('Gold');
    expect(await screen.findByText(/100/)).toBeInTheDocument();
    // The chip uses the published ladder color, not a hash-palette fallback.
    const chip = label.closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#d4af37' });
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
