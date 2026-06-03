import type {
  ReportSnapshot,
  TrendBucket,
} from '@regis/backstage-plugin-regis-common';

type Tier = 'gold' | 'silver' | 'bronze' | 'none';

function tierOf(t?: string | null): Tier {
  const v = (t ?? '').toLowerCase();
  return v === 'gold' || v === 'silver' || v === 'bronze' ? v : 'none';
}

/** Add `delta` days to an ISO date (UTC), returning a YYYY-MM-DD string. */
function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface State {
  tier: Tier;
  score?: number;
}
interface Counters {
  gold: number;
  silver: number;
  bronze: number;
  none: number;
  total: number;
  scoreSum: number;
  scored: number;
}

function applyState(c: Counters, st: State | undefined, sign: 1 | -1): void {
  if (!st) return;
  c[st.tier] += sign;
  c.total += sign;
  if (typeof st.score === 'number') {
    c.scoreSum += sign * st.score;
    c.scored += sign;
  }
}

/**
 * Daily as-of carry-forward distribution of portfolio posture over `days`
 * ending at `today`. Delta/event-based: O(snapshots + days), never
 * O(days * images). `today` is injected for deterministic tests.
 */
export function aggregateTrend(
  snapshots: ReportSnapshot[],
  opts: { days: number; today: string },
): TrendBucket[] {
  const { days, today } = opts;
  const windowStart = isoAddDays(today, -(days - 1));

  // Group by image, sorted by snapshotDate ascending.
  const byImage = new Map<string, ReportSnapshot[]>();
  for (const s of snapshots) {
    const arr = byImage.get(s.imageRef);
    if (arr) arr.push(s);
    else byImage.set(s.imageRef, [s]);
  }
  for (const arr of byImage.values()) {
    arr.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  const counters: Counters = {
    gold: 0, silver: 0, bronze: 0, none: 0, total: 0, scoreSum: 0, scored: 0,
  };
  const state = new Map<string, State>();
  // Events strictly within the window, bucketed by date: image -> new state.
  const eventsByDate = new Map<string, Array<{ image: string; st: State }>>();

  for (const [image, arr] of byImage) {
    let baseline: State | undefined;
    for (const s of arr) {
      const st: State = { tier: tierOf(s.tier), score: s.score };
      if (s.snapshotDate <= windowStart) {
        baseline = st; // latest snapshot at/before window start wins
      } else if (s.snapshotDate <= today) {
        const list = eventsByDate.get(s.snapshotDate);
        if (list) list.push({ image, st });
        else eventsByDate.set(s.snapshotDate, [{ image, st }]);
      }
      // snapshots after `today` are ignored
    }
    if (baseline) {
      state.set(image, baseline);
      applyState(counters, baseline, 1);
    }
  }

  const buckets: TrendBucket[] = [];
  for (let i = 0; i < days; i++) {
    const date = isoAddDays(windowStart, i);
    for (const { image, st } of eventsByDate.get(date) ?? []) {
      applyState(counters, state.get(image), -1);
      state.set(image, st);
      applyState(counters, st, 1);
    }
    buckets.push({
      date,
      gold: counters.gold,
      silver: counters.silver,
      bronze: counters.bronze,
      none: counters.none,
      total: counters.total,
      avgScore: counters.scored
        ? Math.round(counters.scoreSum / counters.scored)
        : 0,
    });
  }
  return buckets;
}
