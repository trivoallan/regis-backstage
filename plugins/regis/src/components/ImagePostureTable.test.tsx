import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { type ReportSummary } from '../api/RegisApi';
import { ImagePostureTable } from './ImagePostureTable';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const rows: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
];

describe('ImagePostureTable', () => {
  it('renders a row per image, worst tier first', async () => {
    await renderInTestApp(<ImagePostureTable rows={rows} ladder={ladder} />, {
      mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
    });
    expect(await screen.findByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    const ordered = screen.getAllByText(/r\/[ab]:1/);
    expect(ordered[0]).toHaveTextContent('r/b:1');
    expect(ordered[1]).toHaveTextContent('r/a:1');
  });
});
