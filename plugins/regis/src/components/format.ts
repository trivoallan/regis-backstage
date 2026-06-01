export type ScoreStatus = 'ok' | 'warning' | 'error';

/** Tier badge color. Unknown/missing tiers fall back to neutral grey. */
export function tierColor(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'gold':
      return '#d4af37';
    case 'bronze':
      return '#cd7f32';
    case 'silver':
      return '#9ca3af';
    default:
      return '#9ca3af';
  }
}

/** Bucket a 0-100 score for status styling. Missing score becomes warning. */
export function scoreStatus(score: number | undefined): ScoreStatus {
  if (score === undefined) return 'warning';
  if (score >= 90) return 'ok';
  if (score >= 60) return 'warning';
  return 'error';
}
