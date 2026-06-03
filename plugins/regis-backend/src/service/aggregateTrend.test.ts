import { aggregateTrend } from './aggregateTrend';
import type { LadderMap } from './LadderResolver';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-01-01',
  recordedAt: '2026-01-01T00:00:00.000Z',
  playbook: 'p3',
  ...over,
});

// p3: a 3-tier ladder; p5: a 5-tier ladder (different depth).
const ladders: LadderMap = new Map([
  ['p3', [
    { name: 'Gold', color: '#1' },
    { name: 'Silver', color: '#2' },
    { name: 'Bronze', color: '#3' },
  ]],
  ['p5', [
    { name: 'A', color: '#a' },
    { name: 'B', color: '#b' },
    { name: 'C', color: '#c' },
    { name: 'D', color: '#d' },
    { name: 'E', color: '#e' },
  ]],
]);

describe('aggregateTrend (rank mode)', () => {
  it('produces one bucket per day ending at today, empty counts', () => {
    const out = aggregateTrend([], { days: 3, today: '2026-06-03', ladders });
    expect(out.buckets.map(b => b.date)).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03',
    ]);
    expect(out.buckets.every(b => b.total === 0 && b.avgScore === 0)).toBe(true);
  });

  it('maps each tier to its rank within its own ladder; bands span the deepest ladder', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: 'Gold', score: 100, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p5', tier: 'C', score: 60, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders },
    );
    expect(out.bands.map(b => b.key)).toEqual([
      'rank1', 'rank2', 'rank3', 'rank4', 'rank5', 'none',
    ]);
    // Gold = rank1 of p3; C = rank3 of p5.
    expect(out.buckets[0].counts).toMatchObject({ rank1: 1, rank3: 1 });
    expect(out.buckets[0].total).toBe(2);
    expect(out.buckets[0].avgScore).toBe(80);
  });

  it('puts null/unknown tiers and unknown playbooks in the none band, excluded from avgScore', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: null, score: undefined, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p3', tier: 'Gold', score: 90, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'c', playbook: 'unknown', tier: 'X', score: 50, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders },
    );
    expect(out.buckets[0].counts.none).toBe(2);
    expect(out.buckets[0].counts.rank1).toBe(1);
    expect(out.buckets[0].total).toBe(3);
    expect(out.buckets[0].avgScore).toBe(70); // (90 + 50) / 2; null-score image excluded
  });

  it('carries a pre-window snapshot forward and applies an in-window transition on its date', () => {
    const out = aggregateTrend(
      [
        snap({ snapshotDate: '2026-05-01', tier: 'Bronze', score: 60 }),
        snap({ snapshotDate: '2026-06-02', tier: 'Gold', score: 100 }),
      ],
      { days: 3, today: '2026-06-03', ladders },
    );
    expect(out.buckets.map(b => ({ d: b.date, r1: b.counts.rank1 ?? 0, r3: b.counts.rank3 ?? 0 }))).toEqual([
      { d: '2026-06-01', r1: 0, r3: 1 },
      { d: '2026-06-02', r1: 1, r3: 0 },
      { d: '2026-06-03', r1: 1, r3: 0 },
    ]);
  });
});

describe('aggregateTrend (playbook mode)', () => {
  it('keeps only the named playbook, bands are its real tier names plus none', () => {
    const out = aggregateTrend(
      [
        snap({ imageRef: 'a', playbook: 'p3', tier: 'Silver', score: 80, snapshotDate: '2026-05-01' }),
        snap({ imageRef: 'b', playbook: 'p5', tier: 'A', score: 99, snapshotDate: '2026-05-01' }),
      ],
      { days: 1, today: '2026-06-03', ladders, mode: { kind: 'playbook', playbook: 'p3' } },
    );
    expect(out.bands.map(b => b.key)).toEqual(['Gold', 'Silver', 'Bronze', 'none']);
    expect(out.buckets[0].counts).toMatchObject({ Silver: 1 });
    expect(out.buckets[0].total).toBe(1); // p5 image excluded
    expect(out.buckets[0].avgScore).toBe(80);
  });
});
