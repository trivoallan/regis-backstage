import type { Report } from '@regis/backstage-plugin-regis-common';

export type Rule = NonNullable<Report['rules']>[number];
export type RulesSummary = NonNullable<Report['rules_summary']>;

export interface CategoryScore {
  tag: string;
  score: number;
  total: number;
  passed: number;
}
export interface StatusCounts {
  passed: number;
  failed: number;
  incomplete: number;
}

export function countByStatus(rules: Rule[]): StatusCounts {
  const c: StatusCounts = { passed: 0, failed: 0, incomplete: 0 };
  for (const r of rules) {
    if (r.status === 'passed') c.passed++;
    else if (r.status === 'incomplete') c.incomplete++;
    else c.failed++;
  }
  return c;
}

/** `by_tag` → entries sorted worst-score-first (ties broken alphabetically). */
export function categoryScores(
  summary: RulesSummary | undefined,
): CategoryScore[] {
  const byTag = summary?.by_tag;
  if (!byTag) return [];
  return Object.entries(byTag)
    .map(([tag, g]) => ({
      tag,
      score: g.score,
      total: g.rules.length,
      passed: g.passed_rules.length,
    }))
    .sort((a, b) => a.score - b.score || a.tag.localeCompare(b.tag));
}

/**
 * Default table order: failed/incomplete before passed, then worst category
 * first (a rule's category rank is its best-ranked — i.e. worst-scoring — tag).
 */
export function sortRulesForTable(
  rules: Rule[],
  scores: CategoryScore[],
): Rule[] {
  const rank = new Map(scores.map((s, i) => [s.tag, i]));
  const catRank = (r: Rule) => {
    let best = Number.POSITIVE_INFINITY;
    for (const t of r.tags ?? []) {
      const idx = rank.get(t);
      if (idx !== undefined) best = Math.min(best, idx);
    }
    return best;
  };
  const statusRank = (r: Rule) => (r.status === 'passed' ? 1 : 0);
  return [...rules].sort(
    (a, b) => statusRank(a) - statusRank(b) || catRank(a) - catRank(b),
  );
}

export type ScoreStatus = 'ok' | 'warning' | 'error';

/** Bucket a 0-100 score for status styling. Missing score becomes warning. */
export function scoreStatus(score: number | undefined): ScoreStatus {
  if (score === undefined) return 'warning';
  if (score >= 90) return 'ok';
  if (score >= 60) return 'warning';
  return 'error';
}
