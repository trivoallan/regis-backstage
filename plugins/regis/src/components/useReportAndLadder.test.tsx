import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { useReportAndLadder } from './useReportAndLadder';

function Probe() {
  const { value, loading, error } = useReportAndLadder();
  if (loading) return <span>loading</span>;
  if (error) return <span>err {String(error.message)}</span>;
  return <span>{value!.report.tier} / {value!.ladder.length} tiers</span>;
}

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'img', annotations: { 'regis.io/report-url': 'https://h/r.json' } },
  spec: {},
};

const renderProbe = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <Probe />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('useReportAndLadder', () => {
  it('returns the report and the flattened ladder', async () => {
    await renderProbe({
      getReport: async () => ({
        report: { schemaVersion: 1, tier: 'Silver' } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({
        playbooks: [
          { id: 'd', tiers: [
            { key: 'Gold', label: 'Gold', color: '#d4af37' },
            { key: 'Silver', label: 'Silver', color: '#9ca3af' },
          ] },
        ],
      }),
    });
    expect(await screen.findByText('Silver / 2 tiers')).toBeInTheDocument();
  });

  it('surfaces errors', async () => {
    await renderProbe({
      getReport: async () => { throw new Error('boom'); },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect(await screen.findByText(/err boom/)).toBeInTheDocument();
  });
});
