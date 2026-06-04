import {
  countByStatus,
  categoryScores,
  sortRulesForTable,
  scoreStatus,
  type Rule,
} from './posture';

const rule = (p: Partial<Rule>): Rule => ({
  slug: p.slug ?? 's',
  description: p.description ?? 'd',
  level: p.level,
  tags: p.tags,
  passed: p.status === 'passed',
  status: p.status ?? 'failed',
  message: p.message ?? 'm',
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

describe('scoreStatus', () => {
  it('buckets scores and defaults missing to warning', () => {
    expect(scoreStatus(100)).toBe('ok');
    expect(scoreStatus(80)).toBe('warning');
    expect(scoreStatus(40)).toBe('error');
    expect(scoreStatus(undefined)).toBe('warning');
  });
});
