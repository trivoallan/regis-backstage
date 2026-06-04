import type { Report, TrendBand } from '@regis/backstage-plugin-regis-common';

export type Rule = NonNullable<Report['rules']>[number];
export type RulesSummary = NonNullable<Report['rules_summary']>;

export interface CategoryScore {
  tag: string;
  score: number;
  total: number;
  passed: number;
}
export interface TierProgress {
  satisfied: number;
  required: number;
}
export interface StatusCounts {
  passed: number;
  failed: number;
  incomplete: number;
}

/**
 * The tier one rung above `currentTier` in a best→worst ladder, or null when
 * already at the top, when the tier is unknown, or when the ladder is empty.
 * An untiered image (no current tier) aims for the lowest rung.
 */
export function nextTier(
  ladder: TrendBand[],
  currentTier: string | null | undefined,
): string | null {
  if (ladder.length === 0) return null;
  if (!currentTier) return ladder[ladder.length - 1].key;
  const i = ladder.findIndex(
    t => t.key === currentTier || t.label === currentTier,
  );
  if (i <= 0) return null;
  return ladder[i - 1].key;
}

/** Failed/incomplete rules attached to the next tier — what blocks promotion. */
export function blockingRules(
  rules: Rule[],
  nextTierName: string | null,
): Rule[] {
  if (!nextTierName) return [];
  return rules.filter(r => r.status !== 'passed' && r.level === nextTierName);
}

/** Satisfied vs required rule counts for the next tier (drives the gauge). */
export function tierProgress(
  rules: Rule[],
  nextTierName: string | null,
): TierProgress {
  if (!nextTierName) return { satisfied: 0, required: 0 };
  const required = rules.filter(r => r.level === nextTierName);
  const satisfied = required.filter(r => r.status === 'passed').length;
  return { satisfied, required: required.length };
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
