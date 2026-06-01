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
  it('shows tier and score', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Gold',
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
    });
    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(await screen.findByText(/100/)).toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    await renderCard({
      getReport: async () => {
        throw new Error('boom');
      },
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
