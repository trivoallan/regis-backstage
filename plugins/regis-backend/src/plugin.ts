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
import { KnexReportHistoryStore } from './service/KnexReportHistoryStore';
import { ReportHistoryService } from './service/ReportHistoryService';
import { RegisHistoryRecorder } from './service/RegisHistoryRecorder';
import { makeFragmentSource } from './provider/makeFragmentSource';
import { seedHistory } from './service/seedHistory';
import { PortfolioTrendAggregator } from './service/PortfolioTrendAggregator';

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
        database: coreServices.database,
        urlReader: coreServices.urlReader,
      },
      async init({
        logger,
        httpRouter,
        httpAuth,
        auth,
        scheduler,
        config,
        catalog,
        database,
        urlReader,
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
        const historyStore = await KnexReportHistoryStore.create(
          await database.getClient(),
        );
        const historyService = new ReportHistoryService({
          catalog,
          store: historyStore,
        });
        const portfolioTrend = new PortfolioTrendAggregator({
          store: historyStore,
          logger,
          rowWarnThreshold: config.getOptionalNumber(
            'regis.portfolio.inMemoryRowLimit',
          ),
        });

        const historySeedUrl = config.getOptionalString(
          'regis.catalog.historySeedUrl',
        );
        if (historySeedUrl) {
          try {
            await seedHistory({
              source,
              store: historyStore,
              seedUrl: historySeedUrl,
              logger,
            });
          } catch (error) {
            logger.warn(`regis: history seed failed: ${error}`);
          }
        }

        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            reportService,
            aggregator,
            historyService,
            portfolioTrend,
          }),
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

        // Warm the portfolio-trend cache (the expensive listSnapshots read)
        // periodically. `scope: 'local'` warms each replica's own cache.
        await scheduler.scheduleTask({
          id: 'regis-portfolio-trend',
          frequency: { minutes: 30 },
          timeout: { minutes: 5 },
          initialDelay: { seconds: 25 },
          scope: 'local',
          fn: async () => {
            await portfolioTrend.refresh();
          },
        });

        // Persistent report history: on each tick, fetch the published index and
        // record one snapshot per image. `scope: 'global'` because the DB is
        // shared across replicas, so only one replica should write per tick.
        const indexDirUrl = config.getOptionalString('regis.catalog.indexDirUrl');
        if (indexDirUrl) {
          const refreshMinutes =
            config.getOptionalNumber('regis.catalog.refreshMinutes') ?? 30;
          const recorder = new RegisHistoryRecorder({
            fragmentSource: makeFragmentSource(indexDirUrl, urlReader),
            store: historyStore,
            indexDirUrl,
            logger,
          });
          await scheduler.scheduleTask({
            id: 'regis-history-record',
            frequency: { minutes: refreshMinutes },
            timeout: { minutes: 5 },
            initialDelay: { seconds: 20 },
            scope: 'global',
            fn: async () => {
              await recorder.record();
            },
          });
        }
      },
    });
  },
});
