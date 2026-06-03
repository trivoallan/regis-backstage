import type { TrendBucket, PortfolioTrend, ReportSnapshot } from './report-api';

describe('portfolio trend types', () => {
  it('shapes a bucket and a trend', () => {
    const bucket: TrendBucket = {
      date: '2026-06-03',
      counts: { rank1: 1, none: 0 },
      total: 1,
      avgScore: 90,
    };
    const trend: PortfolioTrend = {
      generatedAt: '2026-06-03T00:00:00.000Z',
      days: 90,
      filters: {},
      facets: { systems: [], owners: [], playbooks: [] },
      bands: [{ key: 'rank1', label: 'Rank 1', color: '#2e7d32' }],
      buckets: [bucket],
    };
    expect(trend.buckets[0].total).toBe(1);
    expect(trend.buckets[0].counts.rank1).toBe(1);
  });
});

describe('filter contract', () => {
  it('snapshot carries owner/system and trend carries filters/facets', () => {
    const snap: ReportSnapshot = {
      imageRef: 'r/n:1',
      snapshotDate: '2026-06-03',
      recordedAt: '2026-06-03T00:00:00.000Z',
      owner: 'group:default/team-x',
      system: 'shop',
    };
    const trend: PortfolioTrend = {
      generatedAt: '2026-06-03T00:00:00.000Z',
      days: 90,
      filters: { system: 'shop', playbook: 'pci-dss' },
      facets: { systems: ['shop'], owners: ['group:default/team-x'], playbooks: ['pci-dss'] },
      bands: [],
      buckets: [],
    };
    expect(snap.system).toBe('shop');
    expect(trend.facets.systems).toEqual(['shop']);
    expect(trend.filters.playbook).toBe('pci-dss');
  });
});
