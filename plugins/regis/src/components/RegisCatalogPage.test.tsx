import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef } from '../api/RegisApi';
import { RegisCatalogPage } from './RegisCatalogPage';

const renderPage = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <RegisCatalogPage />
    </TestApiProvider>,
  );

describe('RegisCatalogPage', () => {
  it('lists one row per summary', async () => {
    await renderPage({
      listReports: async () => [
        {
          entityRef: 'component:default/svc',
          status: 'ok',
          tier: 'Gold',
          score: 100,
        },
        { entityRef: 'component:default/api', status: 'error', error: 'x' },
      ],
    });
    expect(
      await screen.findByText('component:default/svc'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('component:default/api'),
    ).toBeInTheDocument();
  });
});
