import type { TrendBand, TrendBucket } from '@regis/backstage-plugin-regis-common';
import { summarizeTrend, formatDelta } from './trendSummary';

const bands: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#g' },
  { key: 'Silver', label: 'Silver', color: '#s' },
  { key: 'Bronze', label: 'Bronze', color: '#b' },
];

const bucket = (counts: Record<string, number>, total: number, avgScore: number): TrendBucket => ({
  date: '2026-06-01',
  counts,
  total,
  avgScore,
});

describe('formatDelta', () => {
  it('formats up, down and zero', () => {
    expect(formatDelta(4)).toBe('▲ 4');
    expect(formatDelta(-3)).toBe('▼ 3');
    expect(formatDelta(0)).toBe('±0');
  });
});

describe('summarizeTrend', () => {
  it('summarizes mix, worst, kpis and deltas from first/last buckets', () => {
    const first = bucket({ Gold: 8, Silver: 6, Bronze: 5 }, 19, 78);
    const last = bucket({ Gold: 11, Silver: 7, Bronze: 4 }, 22, 82);
    expect(summarizeTrend(bands, [first, last])).toEqual({
      mix: [
        { key: 'Gold', label: 'Gold', color: '#g', count: 11 },
        { key: 'Silver', label: 'Silver', color: '#s', count: 7 },
        { key: 'Bronze', label: 'Bronze', color: '#b', count: 4 },
      ],
      worst: { label: 'Bronze', count: 4 },
      avgScore: 82,
      images: 22,
      scoreDelta: 4,
      imagesDelta: 3,
    });
  });
  it('omits zero-count bands and returns null worst when only the best band has counts', () => {
    const b = bucket({ Gold: 5 }, 5, 100);
    const out = summarizeTrend(bands, [b]);
    expect(out.mix).toEqual([{ key: 'Gold', label: 'Gold', color: '#g', count: 5 }]);
    expect(out.worst).toBeNull();
  });
  it('uses a single bucket as both first and last (zero deltas)', () => {
    const b = bucket({ Gold: 3, Bronze: 1 }, 4, 70);
    const out = summarizeTrend(bands, [b]);
    expect(out.scoreDelta).toBe(0);
    expect(out.imagesDelta).toBe(0);
    expect(out.worst).toEqual({ label: 'Bronze', count: 1 });
  });
  it('returns an empty/zeroed result for no buckets', () => {
    expect(summarizeTrend(bands, [])).toEqual({
      mix: [],
      worst: null,
      avgScore: 0,
      images: 0,
      scoreDelta: 0,
      imagesDelta: 0,
    });
  });
});
