import { mockServices } from '@backstage/backend-test-utils';
import { PortfolioTrendAggregator } from './PortfolioTrendAggregator';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';

describe('PortfolioTrendAggregator', () => {
  it('refreshes from the store and computes a trend for the cached snapshots', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 100, recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const agg = new PortfolioTrendAggregator({
      store,
      logger: mockServices.logger.mock(),
    });
    await agg.refresh();
    const buckets = agg.trend(2, '2026-06-03');
    expect(buckets).toHaveLength(2);
    expect(buckets[1]).toMatchObject({ gold: 1, total: 1, avgScore: 100 });
  });

  it('ensureFresh only reloads when stale', async () => {
    const store = new InMemoryReportHistoryStore();
    let now = 1000;
    const agg = new PortfolioTrendAggregator({
      store,
      logger: mockServices.logger.mock(),
      now: () => now,
    });
    const spy = jest.spyOn(store, 'listSnapshots');
    await agg.ensureFresh(5000);
    await agg.ensureFresh(5000); // still fresh -> no second load
    expect(spy).toHaveBeenCalledTimes(1);
    now = 1000 + 6000; // now stale
    await agg.ensureFresh(5000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('filters by system/owner and exposes sorted facets', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 100, owner: 'group:default/team-x', system: 'shop', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'b:1', snapshotDate: '2026-05-01', tier: 'Bronze', score: 60, owner: 'group:default/team-y', system: 'billing', recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const agg = new PortfolioTrendAggregator({ store, logger: mockServices.logger.mock() });
    await agg.refresh();

    expect(agg.facets()).toEqual({
      systems: ['billing', 'shop'],
      owners: ['group:default/team-x', 'group:default/team-y'],
    });

    const shopOnly = agg.trend(1, '2026-06-03', { system: 'shop' });
    expect(shopOnly[0]).toMatchObject({ gold: 1, bronze: 0, total: 1 });

    const both = agg.trend(1, '2026-06-03', { system: 'shop', owner: 'group:default/team-y' });
    expect(both[0].total).toBe(0); // shop AND team-y matches nothing

    const all = agg.trend(1, '2026-06-03');
    expect(all[0].total).toBe(2);
  });

  it('warns when the snapshot volume exceeds the in-memory threshold', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      { imageRef: 'a:1', snapshotDate: '2026-05-01', recordedAt: '2026-05-01T00:00:00.000Z' },
      { imageRef: 'b:1', snapshotDate: '2026-05-01', recordedAt: '2026-05-01T00:00:00.000Z' },
    ]);
    const logger = mockServices.logger.mock();
    const warn = jest.spyOn(logger, 'warn');
    const agg = new PortfolioTrendAggregator({ store, logger, rowWarnThreshold: 1 });
    await agg.refresh();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/SQL|rollup|volume/i));
  });
});
