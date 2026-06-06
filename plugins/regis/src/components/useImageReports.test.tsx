import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { useImageReports } from './useImageReports';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
  { entityRef: 'resource:default/other', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/o:1' },
];

const api = {
  listReports: async () => summaries,
  getReport: async () => { throw new Error('not used'); },
  getPlaybooks: async () => ({
    playbooks: [
      { id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] },
    ],
  }),
  getHistory: async () => { throw new Error('not used'); },
  getPortfolioTrend: async () => { throw new Error('not used'); },
};

function Probe({ imageRefs }: { imageRefs: string[] }) {
  const { rows, ladder, playbooks, loading, error } = useImageReports(imageRefs);
  if (loading) return <span>loading</span>;
  if (error) return <span>error</span>;
  return (
    <span data-testid="out">
      {`rows=${rows.length} ladder=${ladder.length} playbooks=${playbooks?.length ?? 0}`}
    </span>
  );
}

const renderProbe = (imageRefs: string[]) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <Probe imageRefs={imageRefs} />
    </TestApiProvider>,
  );

describe('useImageReports', () => {
  it('filters reports to the requested imageRefs and exposes ladder + playbooks', async () => {
    renderProbe(['resource:default/a', 'resource:default/b']);
    expect(await screen.findByTestId('out')).toHaveTextContent(
      'rows=2 ladder=1 playbooks=1',
    );
  });

  it('returns no rows when none of the imageRefs have a report', async () => {
    renderProbe(['resource:default/missing']);
    expect(await screen.findByTestId('out')).toHaveTextContent('rows=0');
  });
});
