import type { TrendBucket, PortfolioTrend } from './report-api';

describe('portfolio trend types', () => {
  it('shapes a bucket and a trend', () => {
    const bucket: TrendBucket = {
      date: '2026-06-03',
      gold: 1,
      silver: 0,
      bronze: 0,
      none: 0,
      total: 1,
      avgScore: 90,
    };
    const trend: PortfolioTrend = {
      generatedAt: '2026-06-03T00:00:00.000Z',
      days: 90,
      buckets: [bucket],
    };
    expect(trend.buckets[0].total).toBe(1);
  });
});
