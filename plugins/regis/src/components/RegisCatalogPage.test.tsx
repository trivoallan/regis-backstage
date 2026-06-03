import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisCatalogPage } from './RegisCatalogPage';

const defaultLadder = async () => ({
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

const renderPage = (
  listReports: () => Promise<ReportSummary[]>,
  getPlaybooks: () => Promise<any> = defaultLadder,
) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          regisApiRef,
          {
            listReports,
            getPlaybooks,
            getReport: async () => {
              throw new Error('not used');
            },
            getHistory: async () => {
              throw new Error('not used');
            },
            getPortfolioTrend: async () => {
              throw new Error('not used');
            },
          },
        ],
      ]}
    >
      <RegisCatalogPage />
    </TestApiProvider>,
  );

describe('RegisCatalogPage', () => {
  it('lists one row per summary', async () => {
    await renderPage(async () => [
      { entityRef: 'component:default/svc', status: 'ok', tier: 'Gold', score: 100 },
      { entityRef: 'component:default/api', status: 'error', error: 'x' },
    ]);
    expect(
      await screen.findByText('component:default/svc'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('component:default/api'),
    ).toBeInTheDocument();
  });

  it('shows image ref, kind and failing tags', async () => {
    await renderPage(async () => [
      {
        entityRef: 'resource:default/library-nginx-1.27',
        status: 'ok',
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        tier: 'Silver',
        score: 80,
        byTag: { security: 80, hygiene: 100 },
      },
    ]);
    expect(
      await screen.findByText('registry-1.docker.io/library/nginx:1.27'),
    ).toBeInTheDocument();
    expect(screen.getByText('resource')).toBeInTheDocument(); // Kind column
    expect(screen.getByText('security')).toBeInTheDocument(); // failing tag (score < 100)
    expect(screen.queryByText('hygiene')).not.toBeInTheDocument(); // passing tag hidden
  });

  it('colors the Tier cell swatch with the published ladder color', async () => {
    await renderPage(async () => [
      { entityRef: 'resource:default/a', status: 'ok', imageRef: 'r/a:1', tier: 'Gold', score: 100 },
    ]);
    const cell = await screen.findByText('Gold');
    const swatch = cell.querySelector('[data-testid="tier-swatch"]');
    expect(swatch).toHaveStyle({ backgroundColor: '#d4af37' });
  });
});
