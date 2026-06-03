import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisImagePostureCard } from './RegisImagePostureCard';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
  { entityRef: 'resource:default/other', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/o:1' },
];

const renderCard = (imageRefs: string[], getPlaybooks?: () => Promise<any>) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            listReports: async () => summaries,
            getReport: async () => {
              throw new Error('not used');
            },
            getPlaybooks: getPlaybooks ?? (async () => ({ playbooks: [] })),
            getHistory: async () => { throw new Error('not used'); },
            getPortfolioTrend: async () => { throw new Error('not used'); },
          },
        ],
      ]}
    >
      <RegisImagePostureCard title="Images" imageRefs={imageRefs} />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/catalog/:namespace/:kind/:name': entityRouteRef,
      },
    },
  );

describe('RegisImagePostureCard', () => {
  it('summarizes only the given images', async () => {
    renderCard(['resource:default/a', 'resource:default/b']);
    expect(await screen.findByText(/2 images/)).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    expect(screen.queryByText('r/o:1')).not.toBeInTheDocument();
  });

  it('shows an empty state when none of the given images have a report', async () => {
    renderCard(['resource:default/missing']);
    expect(
      await screen.findByText(/No Regis-tracked images/),
    ).toBeInTheDocument();
  });
});

describe('RegisImagePostureCard distribution order', () => {
  it('orders the distribution by the resolved ladder (best first)', async () => {
    const getPlaybooks = async () => ({
      playbooks: [
        {
          id: 'default',
          tiers: [
            { key: 'Gold', label: 'Gold', color: '#g' },
            { key: 'Silver', label: 'Silver', color: '#s' },
            { key: 'Bronze', label: 'Bronze', color: '#b' },
          ],
        },
      ],
    });
    renderCard(
      ['resource:default/a', 'resource:default/b'],
      getPlaybooks,
    );
    expect(
      await screen.findByText(/1 Gold · 1 Bronze/),
    ).toBeInTheDocument();
  });

  it('respects a custom ladder where Bronze ranks above Gold', async () => {
    // Ladder: Bronze > Gold (reversed from hardcoded order)
    const getPlaybooks = async () => ({
      playbooks: [
        {
          id: 'custom',
          tiers: [
            { key: 'Bronze', label: 'Bronze', color: '#b' },
            { key: 'Gold', label: 'Gold', color: '#g' },
          ],
        },
      ],
    });
    renderCard(
      ['resource:default/a', 'resource:default/b'],
      getPlaybooks,
    );
    // Bronze is rank 0 in this ladder, so it comes first
    expect(
      await screen.findByText(/1 Bronze · 1 Gold/),
    ).toBeInTheDocument();
  });

  it('falls back to alphabetical order when no playbooks are returned', async () => {
    const getPlaybooks = async () => ({ playbooks: [] });
    renderCard(
      ['resource:default/a', 'resource:default/b'],
      getPlaybooks,
    );
    // Alphabetical: Bronze < Gold
    expect(
      await screen.findByText(/1 Bronze · 1 Gold/),
    ).toBeInTheDocument();
  });
});
