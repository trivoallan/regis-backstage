import type {
  PlaybookLadder,
  TrendBand,
} from '@regis/backstage-plugin-regis-common';

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

/**
 * Flattens every playbook's ladder into a single lookup list for per-image tier
 * coloring. Per-image surfaces (a scorecard, a catalog row, a trajectory dot)
 * know a tier *name* but not always which playbook produced it, so we match by
 * name across all published ladders. Tier names are expected to be distinct
 * across playbooks; on a collision the first ladder wins (stable, good enough
 * for a badge color). Pass the result as the `ladder` argument to `tierColor`.
 */
export function unionLadder(playbooks?: PlaybookLadder[]): TrendBand[] {
  const out: TrendBand[] = [];
  const seen = new Set<string>();
  for (const pb of playbooks ?? []) {
    for (const t of pb.tiers) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  }
  return out;
}

/** Color for a 0-100 score bar, matching the badge semantic palette. */
export function scoreBarColor(score: number): string {
  if (score >= 90) return '#1e7d34';
  if (score >= 60) return '#a86700';
  return '#c0392b';
}

/** Color for a report badge `class`, matching the report's semantic palette. */
export function badgeClassColor(
  cls: 'success' | 'warning' | 'error' | 'information',
): string {
  switch (cls) {
    case 'success':
      return '#1e7d34';
    case 'warning':
      return '#a86700';
    case 'error':
      return '#c0392b';
    default:
      return '#1565c0';
  }
}

/** Emphasis color for the worst-tier indicator (matches the low-score band). */
export const WORST_TIER_COLOR = '#c0392b';
