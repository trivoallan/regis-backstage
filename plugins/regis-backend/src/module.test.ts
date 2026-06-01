import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModuleRegisEntityProvider } from './module';

describe('catalogModuleRegisEntityProvider', () => {
  it('registers an entity provider when indexUrl is configured', async () => {
    const extensionPoint = { addEntityProvider: jest.fn() };
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({
          data: { regis: { catalog: { indexUrl: 'https://h/index.json' } } },
        }),
      ],
    });
    expect(extensionPoint.addEntityProvider).toHaveBeenCalledTimes(1);
  });

  it('stays disabled when no indexUrl is configured', async () => {
    const extensionPoint = { addEntityProvider: jest.fn() };
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });
    expect(extensionPoint.addEntityProvider).not.toHaveBeenCalled();
  });
});
