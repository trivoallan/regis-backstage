import type {
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import {
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

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  reportService: ReportService;
  aggregator: CatalogAggregator;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, reportService, aggregator } = options;
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

  // Error -> HTTP mapping. EntityNotFound/NoReport=404; version/schema=422
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
