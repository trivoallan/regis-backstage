import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisCatalogPage } from './RegisCatalogPage';

const summaries: ReportSummary[] = [
  {
    entityRef: 'resource:default/library-nginx-1.27',
    status: 'ok',
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    tier: 'Silver',
    score: 80,
    byTag: { security: 80, hygiene: 100 },
  },
];

describe('RegisCatalogPage', () => {
  it('shows image ref, kind and failing tags', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [
            regisApiRef,
            {
              listReports: async () => summaries,
              getReport: async () => {
                throw new Error('not used');
              },
            },
          ],
        ]}
      >
        <RegisCatalogPage />
      </TestApiProvider>,
    );
    expect(
      await screen.findByText('registry-1.docker.io/library/nginx:1.27'),
    ).toBeInTheDocument();
    expect(screen.getByText('resource')).toBeInTheDocument(); // Kind column
    expect(screen.getByText('security')).toBeInTheDocument(); // failing tag (score < 100)
    expect(screen.queryByText('hygiene')).not.toBeInTheDocument(); // passing tag hidden
  });
});
