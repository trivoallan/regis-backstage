import type {
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import {
  ExploreResponse,
  ExploreGroupBy,
  PlaybooksResponse,
  PortfolioTrend,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
} from '@regis/backstage-plugin-regis-common';
import express from 'express';
import Router from 'express-promise-router';
import { ReportFetchError } from './service/ReportSource';
import {
  EntityNotFoundError,
  NoReportError,
  ReportService,
} from './service/ReportService';
import type { CatalogAggregator } from './service/CatalogAggregator';
import {
  NoImageRefError,
  ReportHistoryService,
} from './service/ReportHistoryService';
import type { PortfolioTrendAggregator } from './service/PortfolioTrendAggregator';

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  reportService: ReportService;
  aggregator: CatalogAggregator;
  historyService: ReportHistoryService;
  portfolioTrend: PortfolioTrendAggregator;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, reportService, aggregator, historyService, portfolioTrend } =
    options;
  const router = Router();
  router.use(express.json());

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/report', async (req, res) => {
    const entityRef = req.query.entityRef;
    if (typeof entityRef !== 'string' || !entityRef) {
      throw new InputError('query parameter "entityRef" is required');
    }
    const credentials = await httpAuth.credentials(req);
    const envelope = await reportService.getReport(entityRef, credentials);
    res.json(envelope);
  });

  router.get('/reports', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    await aggregator.ensureFresh(30_000);
    res.json(aggregator.getSnapshot());
  });

  router.get('/report/history', async (req, res) => {
    const entityRef = req.query.entityRef;
    if (typeof entityRef !== 'string' || !entityRef) {
      throw new InputError('query parameter "entityRef" is required');
    }
    const credentials = await httpAuth.credentials(req);
    const history = await historyService.getHistory(entityRef, credentials);
    res.json(history);
  });

  router.get('/portfolio/trend', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    const system =
      typeof req.query.system === 'string' && req.query.system ? req.query.system : undefined;
    const owner =
      typeof req.query.owner === 'string' && req.query.owner ? req.query.owner : undefined;
    const playbook =
      typeof req.query.playbook === 'string' && req.query.playbook
        ? req.query.playbook
        : undefined;
    const filters: { system?: string; owner?: string; playbook?: string } = {};
    if (system) filters.system = system;
    if (owner) filters.owner = owner;
    if (playbook) filters.playbook = playbook;
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    const { bands, buckets } = portfolioTrend.trend(days, today, filters);
    const body: PortfolioTrend = {
      // The true freshness of the served buckets (from the cache), not request time.
      generatedAt: portfolioTrend.lastRefreshIso(),
      days,
      filters,
      facets: portfolioTrend.facets(),
      bands,
      buckets,
    };
    res.json(body);
  });

  router.get('/playbooks', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    await portfolioTrend.ensureFresh(30_000);
    const body: PlaybooksResponse = { playbooks: portfolioTrend.playbookLadders() };
    res.json(body);
  });

  router.get('/portfolio/explore', async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 90;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const filters: { system?: string; owner?: string; playbook?: string; tier?: string } = {};
    const system = str(req.query.system);
    const owner = str(req.query.owner);
    const playbook = str(req.query.playbook);
    const tier = str(req.query.tier);
    if (system) filters.system = system;
    if (owner) filters.owner = owner;
    if (playbook) filters.playbook = playbook;
    if (tier) filters.tier = tier;
    const allowed: ExploreGroupBy[] = ['system', 'owner', 'playbook', 'tier'];
    const gb = str(req.query.groupBy) as ExploreGroupBy | undefined;
    const groupBy: ExploreGroupBy = gb && allowed.includes(gb) ? gb : 'system';
    await portfolioTrend.ensureFresh(30_000);
    const today = new Date().toISOString().slice(0, 10);
    const { trend, groups, images, facets } = portfolioTrend.explore({
      days, today, filters, groupBy,
    });
    const body: ExploreResponse = { filters, groupBy, trend, groups, images, facets };
    res.json(body);
  });

  // Error -> HTTP mapping. EntityNotFound/NoReport/NoImageRef=404; version/schema=422
  // (distinct kinds); fetch=502; everything else falls through to the default
  // error handler.
  router.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err instanceof EntityNotFoundError || err instanceof NoReportError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof NoImageRefError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof UnsupportedSchemaVersionError) {
        res
          .status(422)
          .json({ error: err.message, kind: 'unsupported-version' });
      } else if (err instanceof ReportSchemaError) {
        res.status(422).json({ error: err.message, kind: 'invalid-report' });
      } else if (err instanceof ReportFetchError) {
        res.status(502).json({ error: err.message });
      } else {
        next(err);
      }
    },
  );

  return router;
}
