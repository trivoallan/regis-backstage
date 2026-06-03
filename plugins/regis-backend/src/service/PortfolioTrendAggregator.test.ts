import { mockServices } from '@backstage/backend-test-utils';
import { PortfolioTrendAggregator } from './PortfolioTrendAggregator';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';
import type {
  IndexPlaybookEntry,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';

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
    const result = agg.trend(2, '2026-06-03');
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[1]).toMatchObject({ total: 1, avgScore: 100 });
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
      playbooks: [],
    });

    const shopOnly = agg.trend(1, '2026-06-03', { system: 'shop' });
    expect(shopOnly.buckets[0]).toMatchObject({ total: 1 });

    const both = agg.trend(1, '2026-06-03', { system: 'shop', owner: 'group:default/team-y' });
    expect(both.buckets[0].total).toBe(0); // shop AND team-y matches nothing

    const all = agg.trend(1, '2026-06-03');
    expect(all.buckets[0].total).toBe(2);
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

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

function makeAggregator(
  snapshots: ReportSnapshot[],
  playbooks: IndexPlaybookEntry[] = [],
) {
  const store = { listSnapshots: async () => snapshots } as any;
  const logger = { warn() {}, info() {}, error() {}, debug() {} } as any;
  return new PortfolioTrendAggregator({
    store,
    logger,
    loadPlaybooks: async () => playbooks,
  });
}

describe('PortfolioTrendAggregator ladders/facets', () => {
  it('exposes playbooks in facets', async () => {
    const agg = makeAggregator([
      snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold', system: 's1', owner: 'o1' }),
      snap({ imageRef: 'b', playbook: 'p5', tier: 'A', system: 's2', owner: 'o2' }),
    ]);
    await agg.ensureFresh(1);
    expect(agg.facets().playbooks).toEqual(['p3', 'p5']);
  });

  it('returns named-tier bands when filtered to a playbook', async () => {
    const agg = makeAggregator(
      [snap({ imageRef: 'a', playbook: 'p3', tier: 'Silver', score: 80 })],
      [{ id: 'p3', tiers: [{ name: 'Gold' }, { name: 'Silver' }, { name: 'Bronze' }] }],
    );
    await agg.ensureFresh(1);
    const res = agg.trend(1, '2026-06-03', { playbook: 'p3' });
    expect(res.bands.map(b => b.key)).toEqual(['Gold', 'Silver', 'Bronze', 'none']);
    expect(res.buckets[0].counts).toMatchObject({ Silver: 1 });
  });

  it('builds PlaybookLadder list from the resolved ladders', async () => {
    const agg = makeAggregator(
      [snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold' })],
      [{ id: 'p3', title: 'Default', tiers: [{ name: 'Gold', color: '#g' }] }],
    );
    await agg.ensureFresh(1);
    expect(agg.playbookLadders()).toEqual([
      { id: 'p3', title: 'Default', tiers: [{ key: 'Gold', label: 'Gold', color: '#g' }] },
    ]);
  });
});
