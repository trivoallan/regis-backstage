import type {
  BackstageCredentials,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  getRegisReportUrl,
  validateReport,
} from '@regis/backstage-plugin-regis-common';
import type { ReportSource } from './ReportSource';
import type { ReportStore } from './ReportStore';
import type { ReportEnvelope } from './types';

/** Thrown when an entity has no `regis.io/report-url` annotation. */
export class NoReportError extends Error {
  constructor(entityRef: string) {
    super(`no Regis report annotation on ${entityRef}`);
    this.name = 'NoReportError';
  }
}

export interface ReportServiceDeps {
  catalog: CatalogService;
  source: ReportSource;
  store: ReportStore;
  logger: LoggerService;
  now?: () => Date;
}

export class ReportService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReportServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async getReport(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<ReportEnvelope> {
    const cached = this.deps.store.get(entityRef);
    if (cached) return cached;

    const entity = await this.deps.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    const url = entity && getRegisReportUrl(entity);
    if (!url) throw new NoReportError(entityRef);

    const raw = await this.deps.source.fetch(url);
    const report = validateReport(raw); // throws Unsupported*/ReportSchemaError
    const envelope: ReportEnvelope = {
      report,
      meta: {
        fetchedAt: this.now().toISOString(),
        source: 'http',
        schemaVersion: report.schemaVersion,
      },
    };
    this.deps.store.set(entityRef, envelope);
    return envelope;
  }
}
