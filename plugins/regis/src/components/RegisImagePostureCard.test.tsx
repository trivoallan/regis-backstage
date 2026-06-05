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

const playbooks = async () => ({
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
});

const renderCard = (props: { imageRefs: string[]; exploreLink?: string }) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            listReports: async () => summaries,
            getReport: async () => { throw new Error('not used'); },
            getPlaybooks: playbooks,
            getHistory: async () => { throw new Error('not used'); },
            getPortfolioTrend: async () => { throw new Error('not used'); },
          },
        ],
      ]}
    >
      <RegisImagePostureCard title="Images" {...props} />
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisImagePostureCard', () => {
  it('summarizes only the given images and rolls up the tier mix', async () => {
    renderCard({ imageRefs: ['resource:default/a', 'resource:default/b'] });
    expect(await screen.findByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    expect(screen.getByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    expect(screen.queryByText('r/o:1')).not.toBeInTheDocument();
  });

  it('sorts rows worst-first (Bronze before Gold)', async () => {
    renderCard({ imageRefs: ['resource:default/a', 'resource:default/b'] });
    const rows = await screen.findAllByText(/r\/[ab]:1/);
    expect(rows[0]).toHaveTextContent('r/b:1');
    expect(rows[1]).toHaveTextContent('r/a:1');
  });

  it('shows the explorer deep link only when provided', async () => {
    renderCard({
      imageRefs: ['resource:default/a'],
      exploreLink: '/?groupBy=playbook&playbook=default',
    });
    const link = await screen.findByText('View in explorer');
    expect(link.closest('a')).toHaveAttribute('href', '/?groupBy=playbook&playbook=default');
  });

  it('omits the deep link when not provided', async () => {
    renderCard({ imageRefs: ['resource:default/a'] });
    await screen.findByText('r/a:1');
    expect(screen.queryByText('View in explorer')).not.toBeInTheDocument();
  });

  it('shows an empty state when none of the given images have a report', async () => {
    renderCard({ imageRefs: ['resource:default/missing'] });
    expect(await screen.findByText(/No Regis-tracked images/)).toBeInTheDocument();
  });
});
