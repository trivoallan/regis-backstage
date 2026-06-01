import { mockServices } from '@backstage/backend-test-utils';
import { CatalogAggregator } from './CatalogAggregator';

function makeAggregator(refs: string[], getReport: jest.Mock) {
  const catalog = {
    getEntities: jest.fn().mockResolvedValue({
      items: refs.map(name => ({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name, namespace: 'default' },
      })),
    }),
  };
  return new CatalogAggregator({
    catalog: catalog as any,
    auth: mockServices.auth(),
    reportService: { getReport } as any,
    logger: mockServices.logger.mock(),
    concurrency: 2,
  });
}

describe('CatalogAggregator', () => {
  it('builds one summary per annotated entity', async () => {
    const getReport = jest.fn().mockResolvedValue({
      report: { tier: 'Gold', rules_summary: { score: 90, by_tag: {} } },
      meta: {},
    });
    const agg = makeAggregator(['a', 'b'], getReport);
    await agg.refresh();
    const snap = agg.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ status: 'ok', tier: 'Gold', score: 90 });
  });

  it('is resilient: a failing entity becomes status=error, others ok', async () => {
    const getReport = jest
      .fn()
      .mockResolvedValueOnce({
        report: { tier: 'Silver', rules_summary: { score: 70, by_tag: {} } },
        meta: {},
      })
      .mockRejectedValueOnce(new Error('boom'));
    const agg = makeAggregator(['ok', 'bad'], getReport);
    await agg.refresh();
    const byStatus = agg
      .getSnapshot()
      .map(s => s.status)
      .sort();
    expect(byStatus).toEqual(['error', 'ok']);
  });

  it('ensureFresh refreshes while empty and caches once populated', async () => {
    let now = 1000;
    const getReport = jest.fn().mockResolvedValue({
      report: { tier: 'Gold', rules_summary: { score: 90, by_tag: {} } },
      meta: {},
    });
    const catalog = {
      getEntities: jest.fn().mockResolvedValue({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: { name: 'a', namespace: 'default' },
          },
        ],
      }),
    };
    const agg = new CatalogAggregator({
      catalog: catalog as any,
      auth: mockServices.auth(),
      reportService: { getReport } as any,
      logger: mockServices.logger.mock(),
      now: () => now,
    });

    await agg.ensureFresh(30_000); // first call -> refresh
    expect(catalog.getEntities).toHaveBeenCalledTimes(1);
    expect(agg.getSnapshot()).toHaveLength(1);

    now += 5_000; // fresh + non-empty -> cached
    await agg.ensureFresh(30_000);
    expect(catalog.getEntities).toHaveBeenCalledTimes(1);

    now += 40_000; // stale -> refresh again
    await agg.ensureFresh(30_000);
    expect(catalog.getEntities).toHaveBeenCalledTimes(2);
  });
});
