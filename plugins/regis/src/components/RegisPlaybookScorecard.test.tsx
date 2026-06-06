import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  EntityProvider,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisPlaybookScorecard } from './RegisPlaybookScorecard';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
];

const apiWith = (reports: ReportSummary[]) => ({
  listReports: async () => reports,
  getReport: async () => { throw new Error('not used'); },
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
  getHistory: async () => { throw new Error('not used'); },
  getPortfolioTrend: async () => { throw new Error('not used'); },
});

const playbookEntity = (refs: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'pb', annotations: { 'regis.io/playbook-id': 'default' } },
  spec: { type: 'regis-playbook' },
  relations: refs.map(targetRef => ({ type: 'dependencyOf', targetRef })),
});

const render = (entity: Entity, reports: ReportSummary[]) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, apiWith(reports)]]}>
      <EntityProvider entity={entity}>
        <RegisPlaybookScorecard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisPlaybookScorecard', () => {
  it('shows the playbook ladder, the posture rollup and the assessed count', async () => {
    render(playbookEntity(['resource:default/a', 'resource:default/b']), summaries);
    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    expect(screen.getByText('2 assessed images')).toBeInTheDocument();
  });

  it('still shows the ladder but no rollup when no images are assessed', async () => {
    render(playbookEntity([]), summaries);
    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('No assessed images yet')).toBeInTheDocument();
    expect(screen.queryByText(/Worst:/)).not.toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    const api = {
      ...apiWith(summaries),
      listReports: async () => { throw new Error('boom'); },
    };
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <EntityProvider entity={playbookEntity(['resource:default/a'])}>
          <RegisPlaybookScorecard />
        </EntityProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
