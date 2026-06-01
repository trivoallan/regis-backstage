import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { HttpReportSource } from './service/ReportSource';
import { RegisEntityProvider } from './provider/RegisEntityProvider';

/**
 * Registers the Regis entity provider with the catalog. Disabled (no-op) unless
 * `regis.catalog.indexUrl` is configured.
 */
export const catalogModuleRegisEntityProvider = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'regis-entity-provider',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ catalog, scheduler, config, logger }) {
        const indexUrl = config.getOptionalString('regis.catalog.indexUrl');
        if (!indexUrl) {
          logger.info(
            'regis: regis.catalog.indexUrl not set — entity provider disabled',
          );
          return;
        }
        const defaultOwner =
          config.getOptionalString('regis.catalog.defaultOwner') ??
          'group:default/guests';
        const namespace =
          config.getOptionalString('regis.catalog.namespace') ?? 'default';
        const refreshMinutes =
          config.getOptionalNumber('regis.catalog.refreshMinutes') ?? 30;

        const taskRunner = scheduler.createScheduledTaskRunner({
          frequency: { minutes: refreshMinutes },
          timeout: { minutes: 5 },
        });

        catalog.addEntityProvider(
          new RegisEntityProvider({
            indexUrl,
            source: new HttpReportSource(),
            taskRunner,
            logger,
            defaultOwner,
            namespace,
          }),
        );
        logger.info(`regis: entity provider registered for ${indexUrl}`);
      },
    });
  },
});
