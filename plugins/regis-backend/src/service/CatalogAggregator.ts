import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { CATALOG_FILTER_EXISTS } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { REGIS_ANNOTATION_REPORT_URL } from '@regis/backstage-plugin-regis-common';
import type { ReportService } from './ReportService';
import type { ReportSummary } from './types';

export interface CatalogAggregatorDeps {
  catalog: CatalogService;
  auth: AuthService;
  reportService: ReportService;
  logger: LoggerService;
  concurrency?: number;
  now?: () => number;
}

/** Maps an array through `fn` with a bounded number of in-flight promises. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export class CatalogAggregator {
  private snapshot: ReportSummary[] = [];
  private lastRunAt = 0;
  private inFlight: Promise<void> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: CatalogAggregatorDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  getSnapshot(): ReportSummary[] {
    return this.snapshot;
  }

  /**
   * Refresh if the snapshot has never been built, is empty, or is older than
   * `maxAgeMs`. Concurrent callers share one in-flight refresh. Lets the catalog
   * page populate on first view (cold start) without waiting for the scheduled
   * warm-up, while still caching once it holds data.
   */
  async ensureFresh(maxAgeMs: number): Promise<void> {
    const isFresh =
      this.lastRunAt !== 0 && this.now() - this.lastRunAt < maxAgeMs;
    if (isFresh && this.snapshot.length > 0) return;
    if (!this.inFlight) {
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = null;
      });
    }
    await this.inFlight;
  }

  async refresh(): Promise<void> {
    const credentials = await this.deps.auth.getOwnServiceCredentials();
    const { items } = await this.deps.catalog.getEntities(
      {
        filter: {
          [`metadata.annotations.${REGIS_ANNOTATION_REPORT_URL}`]:
            CATALOG_FILTER_EXISTS,
        },
      },
      { credentials },
    );

    this.snapshot = await mapBounded(
      items,
      this.deps.concurrency ?? 8,
      async entity => {
        const entityRef = stringifyEntityRef(entity);
        try {
          const { report } = await this.deps.reportService.getReport(
            entityRef,
            credentials,
          );
          const byTag: Record<string, number> = {};
          for (const [tag, group] of Object.entries(
            report.rules_summary?.by_tag ?? {},
          )) {
            byTag[tag] = (group as { score: number }).score;
          }
          return {
            entityRef,
            status: 'ok' as const,
            imageRef: report.request
              ? `${report.request.registry}/${report.request.repository}:${report.request.tag}`
              : undefined,
            tier: report.tier ?? null,
            score: report.rules_summary?.score,
            byTag,
          };
        } catch (err) {
          this.deps.logger.warn(
            `regis: failed to aggregate ${entityRef}: ${err}`,
          );
          return {
            entityRef,
            status: 'error' as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );
    this.lastRunAt = this.now();
  }
}
