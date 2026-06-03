import {
  createMockDirectory,
  mockCredentials,
  mockServices,
} from '@backstage/backend-test-utils';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createAddEntryAction } from './addEntry';

function makeContext(input: Record<string, unknown>, workspacePath: string) {
  return {
    input,
    workspacePath,
    logger: mockServices.logger.mock(),
    output: jest.fn(),
    async getInitiatorCredentials() {
      return mockCredentials.user();
    },
    async createTemporaryDirectory() {
      return workspacePath;
    },
    checkpoint: jest.fn(),
  } as any;
}

describe('regis:index:add-entry', () => {
  const mockDir = createMockDirectory();
  afterEach(() => mockDir.clear());

  it('writes a valid first-party fragment with a derived reportUrl', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'ghcr.io/shop/storefront-web:2.3.0',
        type: 'first-party',
        system: 'shop',
        playbook: 'default',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await action.handler(ctx);

    const written = JSON.parse(
      await fs.readFile(
        join(
          ws,
          'examples/regis-index.d/images/ghcr.io_shop_storefront-web_2.3.0.json',
        ),
        'utf8',
      ),
    );
    expect(written).toEqual({
      imageRef: 'ghcr.io/shop/storefront-web:2.3.0',
      reportUrl:
        'https://reports.example/regis/ghcr.io_shop_storefront-web_2.3.0.json',
      system: 'shop',
      playbook: 'default',
    });
    expect(ctx.output).toHaveBeenCalledWith(
      'fragmentPath',
      'examples/regis-index.d/images/ghcr.io_shop_storefront-web_2.3.0.json',
    );
    expect(ctx.output).toHaveBeenCalledWith(
      'slug',
      'ghcr.io_shop_storefront-web_2.3.0',
    );
  });

  it('includes the owner for third-party and writes it', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws2');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'docker.io/bitnami/redis:7.2',
        type: 'third-party',
        owner: 'group:default/team-platform',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await action.handler(ctx);

    const written = JSON.parse(
      await fs.readFile(
        join(
          ws,
          'examples/regis-index.d/images/docker.io_bitnami_redis_7.2.json',
        ),
        'utf8',
      ),
    );
    expect(written.owner).toBe('group:default/team-platform');
  });

  it('refuses a third-party request without an owner', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws3');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'docker.io/bitnami/redis:7.2',
        type: 'third-party',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await expect(action.handler(ctx)).rejects.toThrow(/owner/i);
  });
});
