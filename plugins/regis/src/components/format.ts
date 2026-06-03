import type { TrendBand } from '@regis/backstage-plugin-regis-common';

export type ScoreStatus = 'ok' | 'warning' | 'error';

// Deterministic palette mirroring the backend LadderResolver, so a tier with no
// ladder color still renders a stable, non-grey hue.
const PALETTE = ['#2e7d32', '#9e9d24', '#ef6c00', '#c62828', '#6a1b9a', '#00838f'];
const NEUTRAL = '#9ca3af';

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

/**
 * Tier badge color. Prefers the playbook ladder's color; otherwise a stable
 * hash-based palette color; missing/unknown tiers fall back to neutral grey.
 */
export function tierColor(
  tier: string | null | undefined,
  ladder?: TrendBand[],
): string {
  if (!tier) return NEUTRAL;
  const fromLadder = ladder?.find(b => b.key === tier || b.label === tier);
  if (fromLadder) return fromLadder.color;
  return PALETTE[hashIndex(tier)];
}

/** Bucket a 0-100 score for status styling. Missing score becomes warning. */
export function scoreStatus(score: number | undefined): ScoreStatus {
  if (score === undefined) return 'warning';
  if (score >= 90) return 'ok';
  if (score >= 60) return 'warning';
  return 'error';
}
