import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';
import { HttpReportSource } from './service/ReportSource';
import { InMemoryTtlStore } from './service/ReportStore';
import { ReportService } from './service/ReportService';
import { CatalogAggregator } from './service/CatalogAggregator';

/** The Regis backend plugin (new backend system). */
export const regisPlugin = createBackendPlugin({
  pluginId: 'regis',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
        catalog: catalogServiceRef,
      },
      async init({
        logger,
        httpRouter,
        httpAuth,
        auth,
        scheduler,
        config,
        catalog,
      }) {
        const ttlMs =
          (config.getOptionalNumber('regis.cacheTtlSeconds') ?? 1800) * 1000;
        const store = new InMemoryTtlStore(ttlMs);
        const source = new HttpReportSource();
        const reportService = new ReportService({
          catalog,
          source,
          store,
          logger,
        });
        const aggregator = new CatalogAggregator({
          catalog,
          auth,
          reportService,
          logger,
        });

        httpRouter.use(
          await createRouter({ logger, httpAuth, reportService, aggregator }),
        );
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });

        // Warm the snapshot shortly after boot so the catalog page is populated
        // without waiting for the first 30-minute tick. (GET /reports also
        // refreshes on demand via CatalogAggregator.ensureFresh.) `scope:
        // 'local'` warms every replica's own in-memory snapshot — the scheduler
        // default of 'global' would run the warm-up on only one replica.
        await scheduler.scheduleTask({
          id: 'regis-aggregate',
          frequency: { minutes: 30 },
          timeout: { minutes: 5 },
          initialDelay: { seconds: 15 },
          scope: 'local',
          fn: async () => {
            await aggregator.refresh();
          },
        });
      },
    });
  },
});
