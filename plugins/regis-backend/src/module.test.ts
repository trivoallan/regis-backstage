import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModuleRegisEntityProvider } from './module';

const stub = () => ({ addEntityProvider: jest.fn(), addProcessor: jest.fn() });

describe('catalogModuleRegisEntityProvider', () => {
  it('registers the alias processor and the provider when indexUrl is set', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({
          data: { regis: { catalog: { indexUrl: 'https://h/index.json' } } },
        }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).toHaveBeenCalledTimes(1);
  });

  it('registers the alias processor even when indexUrl is absent', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).not.toHaveBeenCalled();
  });
});
