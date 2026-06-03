import { mockServices } from '@backstage/backend-test-utils';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type { SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { RegisEntityProvider } from './RegisEntityProvider';
import type { IndexFragment } from './IndexFragmentSource';

const baseFragment: IndexFragment = {
  path: 'index.json',
  content: {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
  },
};

const imageFragment: IndexFragment = {
  path: 'images/nginx.json',
  content: {
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    digest: 'sha256:aaa',
    reportUrl: 'https://h/a.json',
    tier: 'Gold',
    score: 100,
    playbook: 'default',
  },
};

function makeProvider(fragments: IndexFragment[]) {
  const connection = {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  const taskRunner: SchedulerServiceTaskRunner = {
    run: async task => {
      await task.fn(new AbortController().signal);
    },
  };
  const provider = new RegisEntityProvider({
    indexDirUrl: 'file:///tmp/regis-index.d',
    fragmentSource: { list: jest.fn().mockResolvedValue(fragments) },
    taskRunner,
    logger: mockServices.logger.mock(),
    defaultOwner: 'group:default/guests',
    namespace: 'default',
  });
  return { provider, connection };
}

describe('RegisEntityProvider', () => {
  it('has a stable provider name', () => {
    const { provider } = makeProvider([baseFragment, imageFragment]);
    expect(provider.getProviderName()).toBe('regis-entity-provider');
  });

  it('applies a full mutation of built entities on connect/run', async () => {
    const { provider, connection } = makeProvider([baseFragment, imageFragment]);
    await provider.connect(connection as unknown as EntityProviderConnection);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities).toHaveLength(2); // 1 playbook + 1 image
    expect(arg.entities[0].locationKey).toBe(
      'regis-provider:file:///tmp/regis-index.d',
    );
    const names = arg.entities.map((e: any) => e.entity.metadata.name);
    expect(names).toEqual(['default', 'library-nginx-1.27']);
  });

  it('removes entities when a fragment disappears (full mutation)', async () => {
    const { provider, connection } = makeProvider([baseFragment]); // no images
    await provider.connect(connection as unknown as EntityProviderConnection);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities.map((e: any) => e.entity.metadata.name)).toEqual([
      'default',
    ]);
  });

  it('throws if run() is called before connect()', async () => {
    const { provider } = makeProvider([baseFragment, imageFragment]);
    await expect(provider.run()).rejects.toThrow(/not connected/);
  });
});
