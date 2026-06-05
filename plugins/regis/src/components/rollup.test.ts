import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import type { ReportSummary } from '../api/RegisApi';
import {
  tierRank,
  mix,
  worstTier,
  missingCount,
  sortSummariesWorstFirst,
} from './rollup';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#g' },
  { key: 'Silver', label: 'Silver', color: '#s' },
  { key: 'Bronze', label: 'Bronze', color: '#b' },
];

const row = (p: Partial<ReportSummary>): ReportSummary => ({
  entityRef: p.entityRef ?? 'resource:default/x',
  status: p.status ?? 'ok',
  imageRef: p.imageRef,
  tier: p.tier,
  score: p.score,
});

describe('tierRank', () => {
  it('maps tier key to its ladder index', () => {
    const r = tierRank(ladder);
    expect(r.get('Gold')).toBe(0);
    expect(r.get('Bronze')).toBe(2);
    expect(r.get('Nope')).toBeUndefined();
  });
});

describe('mix', () => {
  it('counts per tier in ladder order, untiered bucket last', () => {
    const rows = [
      row({ tier: 'Gold' }),
      row({ tier: 'Gold' }),
      row({ tier: 'Silver' }),
      row({ tier: 'Bronze' }),
      row({ status: 'pending', tier: null }),
    ];
    expect(mix(rows, ladder)).toEqual([
      { key: 'Gold', label: 'Gold', color: '#g', count: 2 },
      { key: 'Silver', label: 'Silver', color: '#s', count: 1 },
      { key: 'Bronze', label: 'Bronze', color: '#b', count: 1 },
      { key: 'untiered', label: 'untiered', color: '#c4c4c4', count: 1 },
    ]);
  });
  it('omits zero-count tiers and the untiered bucket when empty', () => {
    expect(mix([row({ tier: 'Gold' })], ladder)).toEqual([
      { key: 'Gold', label: 'Gold', color: '#g', count: 1 },
    ]);
  });
});

describe('worstTier', () => {
  it('returns the lowest-ranked tier present and its count', () => {
    const rows = [row({ tier: 'Gold' }), row({ tier: 'Bronze' }), row({ tier: 'Bronze' })];
    expect(worstTier(rows, ladder)).toEqual({ label: 'Bronze', count: 2 });
  });
  it('returns null when every laddered row is at the best tier', () => {
    expect(worstTier([row({ tier: 'Gold' }), row({ tier: 'Gold' })], ladder)).toBeNull();
  });
  it('returns null when no row has a laddered tier', () => {
    expect(worstTier([row({ status: 'pending', tier: null })], ladder)).toBeNull();
  });
});

describe('missingCount', () => {
  it('counts rows whose status is not ok', () => {
    const rows = [row({ status: 'ok' }), row({ status: 'pending' }), row({ status: 'error' })];
    expect(missingCount(rows)).toBe(2);
  });
});

describe('sortSummariesWorstFirst', () => {
  it('orders missing first, then worst tier, then lowest score; non-mutating', () => {
    const rows = [
      row({ entityRef: 'gold', tier: 'Gold', score: 95 }),
      row({ entityRef: 'silver', tier: 'Silver', score: 82 }),
      row({ entityRef: 'bronze', tier: 'Bronze', score: 55 }),
      row({ entityRef: 'missing', status: 'pending', tier: null }),
    ];
    const input = [...rows];
    const out = sortSummariesWorstFirst(rows, ladder);
    expect(out.map(r => r.entityRef)).toEqual(['missing', 'bronze', 'silver', 'gold']);
    expect(rows).toEqual(input); // input untouched
  });
  it('breaks ties within a tier by ascending score', () => {
    const rows = [
      row({ entityRef: 'hi', tier: 'Silver', score: 88 }),
      row({ entityRef: 'lo', tier: 'Silver', score: 80 }),
    ];
    expect(sortSummariesWorstFirst(rows, ladder).map(r => r.entityRef)).toEqual(['lo', 'hi']);
  });
});
