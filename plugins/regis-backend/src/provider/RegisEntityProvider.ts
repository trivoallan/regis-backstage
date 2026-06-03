import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type { IndexFragmentSource } from './IndexFragmentSource';
import { assembleIndex } from './assembleIndex';
import { buildEntities, BuildOpts } from './buildEntities';

export interface RegisEntityProviderOptions {
  /** URL of the index *directory* (a repo tree URL, or a local file:// dir). */
  indexDirUrl: string;
  fragmentSource: IndexFragmentSource;
  taskRunner: SchedulerServiceTaskRunner;
  logger: LoggerService;
  defaultOwner: string;
  namespace: string;
}

/**
 * Mints `Resource` entities (container-image + regis-playbook) from a published
 * Regis report index, now stored as a directory of fragments. Owns the entities
 * it provides (full mutation): images whose fragment leaves the index directory
 * are removed from the catalog.
 */
export class RegisEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(private readonly options: RegisEntityProviderOptions) {}

  getProviderName(): string {
    return 'regis-entity-provider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.options.taskRunner.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error('RegisEntityProvider is not connected');
    }
    const { indexDirUrl, fragmentSource, logger, defaultOwner, namespace } =
      this.options;

    const fragments = await fragmentSource.list(indexDirUrl);
    const index = assembleIndex(fragments, logger);

    // buildEntities uses opts.indexUrl only to derive the location key.
    const opts: BuildOpts = { indexUrl: indexDirUrl, defaultOwner, namespace };
    const entities = buildEntities(index, opts);
    const locationKey = `regis-provider:${indexDirUrl}`;

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({ entity, locationKey })),
    });

    logger.info(
      `regis: provided ${entities.length} entities from ${indexDirUrl}`,
    );
  }
}
