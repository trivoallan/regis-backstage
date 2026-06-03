import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { RegisEntityProvider } from './provider/RegisEntityProvider';
import { makeFragmentSource } from './provider/makeFragmentSource';
import { RegisAliasRelationProcessor } from './processor/RegisAliasRelationProcessor';

/**
 * Registers the Regis entity provider with the catalog. Disabled (no-op) unless
 * `regis.catalog.indexDirUrl` is configured.
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
        urlReader: coreServices.urlReader,
      },
      async init({ catalog, scheduler, config, logger, urlReader }) {
        catalog.addProcessor(new RegisAliasRelationProcessor());

        const indexDirUrl = config.getOptionalString(
          'regis.catalog.indexDirUrl',
        );
        if (!indexDirUrl) {
          logger.info(
            'regis: regis.catalog.indexDirUrl not set — entity provider disabled (alias relations still active)',
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
            indexDirUrl,
            fragmentSource: makeFragmentSource(indexDirUrl, urlReader),
            taskRunner,
            logger,
            defaultOwner,
            namespace,
          }),
        );
        logger.info(`regis: entity provider registered for ${indexDirUrl}`);
      },
    });
  },
});
