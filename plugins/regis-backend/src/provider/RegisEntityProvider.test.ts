import { mockServices } from '@backstage/backend-test-utils';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type { SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { RegisEntityProvider } from './RegisEntityProvider';

const validIndex = {
  schemaVersion: 1,
  playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
  images: [
    {
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      digest: 'sha256:aaa',
      reportUrl: 'https://h/a.json',
      tier: 'Gold',
      score: 100,
      playbook: 'default',
    },
  ],
};

function makeProvider(fetchResult: unknown) {
  const connection = {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  // A task runner that runs the scheduled task immediately when connect() schedules it.
  const taskRunner: SchedulerServiceTaskRunner = {
    run: async task => {
      await task.fn(new AbortController().signal);
    },
  };
  const provider = new RegisEntityProvider({
    indexUrl: 'https://h/index.json',
    source: { fetch: jest.fn().mockResolvedValue(fetchResult) },
    taskRunner,
    logger: mockServices.logger.mock(),
    defaultOwner: 'group:default/guests',
    namespace: 'default',
  });
  return { provider, connection };
}

describe('RegisEntityProvider', () => {
  it('has a stable provider name', () => {
    const { provider } = makeProvider(validIndex);
    expect(provider.getProviderName()).toBe('regis-entity-provider');
  });

  it('applies a full mutation of built entities on connect/run', async () => {
    const { provider, connection } = makeProvider(validIndex);
    await provider.connect(connection as unknown as EntityProviderConnection);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities).toHaveLength(2); // 1 playbook + 1 image
    expect(arg.entities[0].locationKey).toBe(
      'regis-provider:https://h/index.json',
    );
    const names = arg.entities.map((e: any) => e.entity.metadata.name);
    expect(names).toEqual(['default', 'library-nginx-1.27']);
  });

  it('throws a validation error for an unsupported index version', async () => {
    const { provider, connection } = makeProvider({
      schemaVersion: 999,
      images: [],
    });
    await expect(
      provider.connect(connection as unknown as EntityProviderConnection),
    ).rejects.toThrow(/schemaVersion 999/);
    expect(connection.applyMutation).not.toHaveBeenCalled();
  });
});
