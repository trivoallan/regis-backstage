import { aggregateTrend } from './aggregateTrend';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('aggregateTrend', () => {
  it('produces one bucket per day ending at today', () => {
    const out = aggregateTrend([], { days: 3, today: '2026-06-03' });
    expect(out.map(b => b.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(out.every(b => b.total === 0 && b.avgScore === 0)).toBe(true);
  });

  it('carries a pre-window snapshot forward across all days (as-of)', () => {
    const out = aggregateTrend(
      [snap({ snapshotDate: '2026-05-01', tier: 'Gold', score: 100 })],
      { days: 2, today: '2026-06-03' },
    );
    expect(out).toEqual([
      { date: '2026-06-02', gold: 1, silver: 0, bronze: 0, none: 0, total: 1, avgScore: 100 },
      { date: '2026-06-03', gold: 1, silver: 0, bronze: 0, none: 0, total: 1, avgScore: 100 },
    ]);
  });

  it('applies an in-window tier transition on its date', () => {
    const out = aggregateTrend(
      [
        snap({ snapshotDate: '2026-05-01', tier: 'Bronze', score: 60 }),
        snap({ snapshotDate: '2026-06-02', tier: 'Gold', score: 100 }),
      ],
      { days: 3, today: '2026-06-03' },
    );
    expect(out.map(b => ({ d: b.date, g: b.gold, b: b.bronze, s: b.avgScore }))).toEqual([
      { d: '2026-06-01', g: 0, b: 1, s: 60 },
      { d: '2026-06-02', g: 1, b: 0, s: 100 },
      { d: '2026-06-03', g: 1, b: 0, s: 100 },
    ]);
  });

  it('counts an image only from its first in-window snapshot', () => {
    const out = aggregateTrend(
      [snap({ snapshotDate: '2026-06-03', tier: 'Silver', score: 80 })],
      { days: 2, today: '2026-06-03' },
    );
    expect(out[0].total).toBe(0); // 2026-06-02: not yet present
    expect(out[1]).toMatchObject({ silver: 1, total: 1, avgScore: 80 });
  });

  it('moves an image to none bucket and score=0 when tier is lost in-window', () => {
    const out = aggregateTrend(
      [snap({ snapshotDate: '2026-05-01', tier: 'Gold', score: 100 }),
       snap({ snapshotDate: '2026-06-02', tier: null, score: undefined })],
      { days: 3, today: '2026-06-03' },
    );
    // 2026-06-01: pre-window snapshot still active → gold bucket
    expect(out[0]).toMatchObject({ date: '2026-06-01', gold: 1, none: 0, avgScore: 100 });
    // 2026-06-02: in-window snapshot removes tier → none bucket, score excluded
    expect(out[1]).toMatchObject({ date: '2026-06-02', gold: 0, none: 1, total: 1, avgScore: 0 });
    // 2026-06-03: still in none bucket
    expect(out[2]).toMatchObject({ date: '2026-06-03', gold: 0, none: 1, total: 1, avgScore: 0 });
  });

  it('puts null/unknown tiers in the none bucket and excludes them from avgScore', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', tier: null, score: undefined }),
        snap({ imageRef: 'b:1', snapshotDate: '2026-05-01', tier: 'Gold', score: 90 }),
      ],
      { days: 1, today: '2026-06-03' },
    );
    expect(out[0]).toEqual({
      date: '2026-06-03', gold: 1, silver: 0, bronze: 0, none: 1, total: 2, avgScore: 90,
    });
  });
});
