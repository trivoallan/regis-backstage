import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ReportSnapshot,
  TrendBucket,
} from '@regis/backstage-plugin-regis-common';
import { aggregateTrend } from './aggregateTrend';
import type { ReportHistoryStore } from './ReportHistoryStore';

export interface PortfolioTrendAggregatorDeps {
  store: ReportHistoryStore;
  logger: LoggerService;
  /** Log a warning past this many loaded rows (scaling signal). Default 500_000. */
  rowWarnThreshold?: number;
  now?: () => number;
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

  constructor(private readonly deps: PortfolioTrendAggregatorDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.rowWarnThreshold = deps.rowWarnThreshold ?? 500_000;
  }

  async refresh(): Promise<void> {
    this.snapshots = await this.deps.store.listSnapshots();
    this.lastRunAt = this.now();
    if (this.snapshots.length > this.rowWarnThreshold) {
      this.deps.logger.warn(
        `regis: portfolio trend loaded ${this.snapshots.length} snapshots in memory ` +
          `(> ${this.rowWarnThreshold}); consider the SQL/rollup aggregation path`,
      );
    }
  }

  async ensureFresh(maxAgeMs: number): Promise<void> {
    const isFresh = this.lastRunAt !== 0 && this.now() - this.lastRunAt < maxAgeMs;
    if (isFresh) return;
    if (!this.inFlight) {
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = null;
      });
    }
    await this.inFlight;
  }

  /** Compute the trend for the cached snapshots. `today` = ISO date. */
  trend(days: number, today: string): TrendBucket[] {
    return aggregateTrend(this.snapshots, { days, today });
  }
}
