import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { ReportSource } from '../service/ReportSource';
import { fetchIndex } from '../service/fetchIndex';
import { buildEntities, BuildOpts } from './buildEntities';

export interface RegisEntityProviderOptions {
  indexUrl: string;
  source: ReportSource;
  taskRunner: SchedulerServiceTaskRunner;
  logger: LoggerService;
  defaultOwner: string;
  namespace: string;
}

/**
 * Mints `Resource` entities (container-image + regis-playbook) from a published
 * Regis report index. Owns the entities it provides (full mutation): images that
 * leave the index are removed from the catalog.
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
    const { indexUrl, source, logger, defaultOwner, namespace } = this.options;

    const index = await fetchIndex(source, indexUrl);

    const opts: BuildOpts = { indexUrl, defaultOwner, namespace };
    const entities = buildEntities(index, opts);
    const locationKey = `regis-provider:${indexUrl}`;

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({ entity, locationKey })),
    });

    logger.info(`regis: provided ${entities.length} entities from ${indexUrl}`);
  }
}
