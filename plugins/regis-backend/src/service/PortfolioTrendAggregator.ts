import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ExploreGroup,
  ExploreGroupBy,
  ExploreImage,
  IndexPlaybookEntry,
  PlaybookLadder,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';
import { aggregateTrend, type TrendResult } from './aggregateTrend';
import {
  resolveLadders,
  type LadderMap,
  type TierColorOverride,
} from './LadderResolver';
import type { ReportHistoryStore } from './ReportHistoryStore';

export interface PortfolioTrendAggregatorDeps {
  store: ReportHistoryStore;
  logger: LoggerService;
  /** Log a warning past this many loaded rows (scaling signal). Default 500_000. */
  rowWarnThreshold?: number;
  now?: () => number;
  /** Loads index playbook metadata (with tier ladders). Best-effort; absent → discovery only. */
  loadPlaybooks?: () => Promise<IndexPlaybookEntry[]>;
  /** Config-supplied color overrides. */
  tierOverrides?: TierColorOverride[];
}

/**
 * Caches all snapshots (the expensive read at scale) and computes the trend
 * per request from the cache — per-request cost is O(snapshots + days), and the
 * DB read runs only on refresh. Mirrors CatalogAggregator. The `store.listSnapshots`
 * + in-memory compute is the documented seam to swap for a SQL/rollup impl at
 * very large volumes.
 */
export class PortfolioTrendAggregator {
  private snapshots: ReportSnapshot[] = [];
  private lastRunAt = 0;
  private inFlight: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly rowWarnThreshold: number;
  private playbooks: IndexPlaybookEntry[] = [];
  private readonly overrides: TierColorOverride[];

  constructor(private readonly deps: PortfolioTrendAggregatorDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.rowWarnThreshold = deps.rowWarnThreshold ?? 500_000;
    this.overrides = deps.tierOverrides ?? [];
  }

  async refresh(): Promise<void> {
    this.snapshots = await this.deps.store.listSnapshots();
    if (this.deps.loadPlaybooks) {
      try {
        this.playbooks = await this.deps.loadPlaybooks();
      } catch (error) {
        this.deps.logger.warn(`regis: failed to load playbook ladders: ${error}`);
        // Keep the previous playbooks; discovery fallback still applies.
      }
    }
    this.lastRunAt = this.now();
    if (this.snapshots.length > this.rowWarnThreshold) {
      this.deps.logger.warn(
        `regis: portfolio trend loaded ${this.snapshots.length} snapshots in memory ` +
          `(> ${this.rowWarnThreshold}); consider the SQL/rollup aggregation path`,
      );
    }
  }

  async ensureFresh(maxAgeMs: number): Promise<void> {
    // Unlike CatalogAggregator, lastRunAt===0 (empty result) counts as stale only on the
    // very first run; once we have run at least once, an empty snapshot list is legitimately
    // fresh — portfolio history starts empty and is not an error condition.
    const isFresh = this.lastRunAt !== 0 && this.now() - this.lastRunAt < maxAgeMs;
    if (isFresh) return;
    if (!this.inFlight) {
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = null;
      });
    }
    await this.inFlight;
  }

  private resolve(): LadderMap {
    return resolveLadders({
      playbooks: this.playbooks,
      snapshots: this.snapshots,
      overrides: this.overrides,
    });
  }

  /** Compute the trend for the cached snapshots, optionally filtered (AND across set fields). */
  trend(
    days: number,
    today: string,
    filters: { system?: string; owner?: string; playbook?: string } = {},
  ): TrendResult {
    const filtered = this.snapshots.filter(
      s =>
        (filters.system === undefined || s.system === filters.system) &&
        (filters.owner === undefined || s.owner === filters.owner),
    );
    const ladders = this.resolve();
    const mode = filters.playbook
      ? ({ kind: 'playbook', playbook: filters.playbook } as const)
      : ({ kind: 'rank' } as const);
    return aggregateTrend(filtered, { days, today, ladders, mode });
  }

  /** Distinct, sorted, non-empty system/owner/playbook values across the full cached set. */
  facets(): { systems: string[]; owners: string[]; playbooks: string[] } {
    const systems = new Set<string>();
    const owners = new Set<string>();
    const playbooks = new Set<string>();
    for (const s of this.snapshots) {
      if (s.system) systems.add(s.system);
      if (s.owner) owners.add(s.owner);
      if (s.playbook) playbooks.add(s.playbook);
    }
    return {
      systems: [...systems].sort(),
      owners: [...owners].sort(),
      playbooks: [...playbooks].sort(),
    };
  }

  /** Resolved ladders as `PlaybookLadder[]` for `GET /playbooks`. */
  playbookLadders(): PlaybookLadder[] {
    const titleById = new Map(this.playbooks.map(p => [p.id, p.title]));
    const out: PlaybookLadder[] = [];
    for (const [id, ladder] of this.resolve()) {
      out.push({
        id,
        title: titleById.get(id),
        tiers: ladder.map(t => ({ key: t.name, label: t.name, color: t.color })),
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Latest snapshot per image (max snapshotDate wins). */
  private latestByImage(): ReportSnapshot[] {
    const latest = new Map<string, ReportSnapshot>();
    for (const s of this.snapshots) {
      const prev = latest.get(s.imageRef);
      if (!prev || s.snapshotDate > prev.snapshotDate) latest.set(s.imageRef, s);
    }
    return [...latest.values()];
  }

  /**
   * One-call data for an explorer level: scoped trend + per-group aggregates +
   * scoped image list + scoped facets. `tier` filters images/groups only — a
   * "filtered by current tier" time series is not meaningful — so the trend uses
   * system/owner/playbook only.
   */
  explore(opts: {
    days: number;
    today: string;
    filters: { system?: string; owner?: string; playbook?: string; tier?: string };
    groupBy: ExploreGroupBy;
  }): {
    trend: TrendResult;
    groups: ExploreGroup[];
    images: ExploreImage[];
    facets: { systems: string[]; owners: string[]; playbooks: string[]; tiers: string[] };
  } {
    const { days, today, filters, groupBy } = opts;
    const inScope = (s: ReportSnapshot): boolean =>
      (filters.system === undefined || s.system === filters.system) &&
      (filters.owner === undefined || s.owner === filters.owner) &&
      (filters.playbook === undefined || s.playbook === filters.playbook) &&
      (filters.tier === undefined || (s.tier ?? undefined) === filters.tier);

    const scoped = this.latestByImage().filter(inScope);

    const images: ExploreImage[] = scoped.map(s => ({
      imageRef: s.imageRef,
      tier: s.tier,
      score: s.score,
      system: s.system,
      owner: s.owner,
      playbook: s.playbook,
      digest: s.digest,
    }));

    const groupValue = (s: ReportSnapshot): string => {
      switch (groupBy) {
        case 'system':
          return s.system ?? 'unknown';
        case 'owner':
          return s.owner ?? 'unknown';
        case 'playbook':
          return s.playbook ?? 'unknown';
        default:
          return s.tier ?? 'unknown';
      }
    };
    const byGroup = new Map<string, ReportSnapshot[]>();
    for (const s of scoped) {
      const k = groupValue(s);
      const arr = byGroup.get(k);
      if (arr) arr.push(s);
      else byGroup.set(k, [s]);
    }
    const groups: ExploreGroup[] = [...byGroup.entries()]
      .map(([key, rows]) => {
        const scored = rows.filter(r => typeof r.score === 'number');
        const tiers: Record<string, number> = {};
        for (const r of rows) {
          const t = r.tier ?? 'untiered';
          tiers[t] = (tiers[t] ?? 0) + 1;
        }
        return {
          key,
          count: rows.length,
          avgScore: scored.length
            ? Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length)
            : 0,
          tiers,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    const distinct = (vals: Array<string | undefined | null>): string[] =>
      [...new Set(vals.filter((v): v is string => !!v))].sort();
    const facets = {
      systems: distinct(scoped.map(s => s.system)),
      owners: distinct(scoped.map(s => s.owner)),
      playbooks: distinct(scoped.map(s => s.playbook)),
      tiers: distinct(scoped.map(s => s.tier ?? undefined)),
    };

    const trend = this.trend(days, today, {
      system: filters.system,
      owner: filters.owner,
      playbook: filters.playbook,
    });

    return { trend, groups, images, facets };
  }

  /**
   * ISO timestamp of the last successful refresh — the true "data as of" time
   * (the served buckets come from the cache, not the request wall-clock).
   */
  lastRefreshIso(): string {
    return new Date(this.lastRunAt).toISOString();
  }
}
