import type { ReportHistory, ReportSnapshot } from '@regis/backstage-plugin-regis-common';
import { points, tierSpans, summary } from './trajectory';

const snap = (p: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/x:1',
  snapshotDate: p.snapshotDate ?? '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  score: p.score,
  tier: p.tier,
});

const history = (snaps: ReportSnapshot[]): ReportHistory => ({ imageRef: 'r/x:1', snapshots: snaps });

describe('points', () => {
  it('keeps only numeric-score snapshots, sorted by date', () => {
    const h = history([
      snap({ snapshotDate: '2026-03-01', score: 80, tier: 'Silver' }),
      snap({ snapshotDate: '2026-01-01', score: 92, tier: 'Gold' }),
      snap({ snapshotDate: '2026-02-01', score: undefined, tier: 'Gold' }),
    ]);
    expect(points(h)).toEqual([
      { date: '2026-01-01', score: 92, tier: 'Gold' },
      { date: '2026-03-01', score: 80, tier: 'Silver' },
    ]);
  });
});

describe('tierSpans', () => {
  it('groups contiguous runs of the same tier', () => {
    const pts = [
      { date: 'a', score: 90, tier: 'Gold' },
      { date: 'b', score: 88, tier: 'Gold' },
      { date: 'c', score: 76, tier: 'Silver' },
      { date: 'd', score: 64, tier: 'Bronze' },
      { date: 'e', score: 60, tier: 'Bronze' },
    ];
    expect(tierSpans(pts)).toEqual([
      { tier: 'Gold', fromIndex: 0, toIndex: 1 },
      { tier: 'Silver', fromIndex: 2, toIndex: 2 },
      { tier: 'Bronze', fromIndex: 3, toIndex: 4 },
    ]);
  });
  it('treats null/absent tier as its own span', () => {
    const pts = [
      { date: 'a', score: 90, tier: null },
      { date: 'b', score: 88, tier: 'Gold' },
    ];
    expect(tierSpans(pts)).toEqual([
      { tier: null, fromIndex: 0, toIndex: 0 },
      { tier: 'Gold', fromIndex: 1, toIndex: 1 },
    ]);
  });
});

describe('summary', () => {
  it('reports count, latest tier/score and the first→last delta', () => {
    const pts = [
      { date: 'a', score: 92, tier: 'Gold' },
      { date: 'b', score: 64, tier: 'Bronze' },
    ];
    expect(summary(pts)).toEqual({ count: 2, latestTier: 'Bronze', latestScore: 64, delta: -28 });
  });
  it('has a zero delta for a single point and zeros for empty', () => {
    expect(summary([{ date: 'a', score: 70, tier: 'Silver' }])).toEqual({
      count: 1, latestTier: 'Silver', latestScore: 70, delta: 0,
    });
    expect(summary([])).toEqual({ count: 0, latestTier: null, latestScore: null, delta: 0 });
  });
});
