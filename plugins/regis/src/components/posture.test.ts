import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import {
  nextTier,
  blockingRules,
  tierProgress,
  countByStatus,
  categoryScores,
  sortRulesForTable,
  type Rule,
} from './posture';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const rule = (p: Partial<Rule>): Rule => ({
  slug: p.slug ?? 's',
  description: p.description ?? 'd',
  level: p.level,
  tags: p.tags,
  passed: p.status === 'passed',
  status: p.status ?? 'failed',
  message: p.message ?? 'm',
});

describe('nextTier', () => {
  it('returns the tier just above the current one', () => {
    expect(nextTier(ladder, 'Silver')).toBe('Gold');
  });
  it('returns null at the top tier', () => {
    expect(nextTier(ladder, 'Gold')).toBeNull();
  });
  it('aims for the lowest rung when untiered', () => {
    expect(nextTier(ladder, null)).toBe('Bronze');
  });
  it('returns null for an unknown tier', () => {
    expect(nextTier(ladder, 'Platinum')).toBeNull();
  });
  it('returns null for an empty ladder', () => {
    expect(nextTier([], 'Silver')).toBeNull();
  });
  it('aims for the lowest rung when tier is undefined', () => {
    expect(nextTier(ladder, undefined)).toBe('Bronze');
  });
});

describe('blockingRules', () => {
  it('returns failed/incomplete rules whose level is the next tier', () => {
    const rules = [
      rule({ slug: 'a', level: 'Gold', status: 'failed' }),
      rule({ slug: 'b', level: 'Gold', status: 'incomplete' }),
      rule({ slug: 'c', level: 'Gold', status: 'passed' }),
      rule({ slug: 'd', level: 'Silver', status: 'failed' }),
    ];
    expect(blockingRules(rules, 'Gold').map(r => r.slug)).toEqual(['a', 'b']);
  });
  it('returns nothing when there is no next tier', () => {
    expect(blockingRules([rule({ level: 'Gold' })], null)).toEqual([]);
  });
  it('returns [] for an empty rules array', () => {
    expect(blockingRules([], 'Gold')).toEqual([]);
  });
});

describe('tierProgress', () => {
  it('counts satisfied vs required rules for the next tier', () => {
    const rules = [
      rule({ level: 'Gold', status: 'passed' }),
      rule({ level: 'Gold', status: 'failed' }),
      rule({ level: 'Gold', status: 'incomplete' }),
      rule({ level: 'Silver', status: 'passed' }),
    ];
    expect(tierProgress(rules, 'Gold')).toEqual({ satisfied: 1, required: 3 });
  });
  it('is zero/zero when there is no next tier', () => {
    expect(tierProgress([rule({})], null)).toEqual({ satisfied: 0, required: 0 });
  });
});

describe('countByStatus', () => {
  it('tallies the three states', () => {
    const rules = [
      rule({ status: 'passed' }),
      rule({ status: 'passed' }),
      rule({ status: 'failed' }),
      rule({ status: 'incomplete' }),
    ];
    expect(countByStatus(rules)).toEqual({ passed: 2, failed: 1, incomplete: 1 });
  });
  it('returns all zeros for an empty rules array', () => {
    expect(countByStatus([])).toEqual({ passed: 0, failed: 0, incomplete: 0 });
  });
});

describe('categoryScores', () => {
  it('maps by_tag to sorted worst-first entries', () => {
    const out = categoryScores({
      by_tag: {
        security: { rules: ['a', 'b'], passed_rules: ['a'], score: 50 },
        hygiene: { rules: ['c'], passed_rules: ['c'], score: 90 },
      },
    });
    expect(out).toEqual([
      { tag: 'security', score: 50, total: 2, passed: 1 },
      { tag: 'hygiene', score: 90, total: 1, passed: 1 },
    ]);
  });
  it('returns [] when by_tag is absent', () => {
    expect(categoryScores(undefined)).toEqual([]);
    expect(categoryScores({})).toEqual([]);
  });
  it('breaks score ties alphabetically by tag', () => {
    const out = categoryScores({
      by_tag: {
        zeta: { rules: ['z'], passed_rules: [], score: 50 },
        alpha: { rules: ['a'], passed_rules: [], score: 50 },
      },
    });
    expect(out.map(c => c.tag)).toEqual(['alpha', 'zeta']);
  });
});

describe('sortRulesForTable', () => {
  it('orders failures before passes, then worst category first', () => {
    const scores = categoryScores({
      by_tag: {
        security: { rules: [], passed_rules: [], score: 40 },
        hygiene: { rules: [], passed_rules: [], score: 90 },
      },
    });
    const rules = [
      rule({ slug: 'pass-sec', tags: ['security'], status: 'passed' }),
      rule({ slug: 'fail-hyg', tags: ['hygiene'], status: 'failed' }),
      rule({ slug: 'fail-sec', tags: ['security'], status: 'failed' }),
    ];
    expect(sortRulesForTable(rules, scores).map(r => r.slug)).toEqual([
      'fail-sec',
      'fail-hyg',
      'pass-sec',
    ]);
  });
  it('places untagged rules last within their status group', () => {
    const scores = categoryScores({
      by_tag: { security: { rules: [], passed_rules: [], score: 40 } },
    });
    const rules = [
      rule({ slug: 'fail-untagged', tags: undefined, status: 'failed' }),
      rule({ slug: 'fail-tagged', tags: ['security'], status: 'failed' }),
    ];
    expect(sortRulesForTable(rules, scores).map(r => r.slug)).toEqual([
      'fail-tagged',
      'fail-untagged',
    ]);
  });

  it('handles an empty scores array (all rules rank equally, order stable by status)', () => {
    const rules = [
      rule({ slug: 'pass', status: 'passed' }),
      rule({ slug: 'fail', status: 'failed' }),
    ];
    expect(sortRulesForTable(rules, []).map(r => r.slug)).toEqual(['fail', 'pass']);
  });
});
