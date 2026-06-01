import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { regisPlugin } from './plugin';

describe('regisPlugin scheduling', () => {
  it('schedules the aggregate refresh to run on every instance shortly after startup', async () => {
    const scheduler = mockServices.scheduler.mock();

    await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [] }),
        scheduler.factory,
      ],
    });

    // The background warm-up runs soon after boot (initialDelay) and on every
    // replica (scope 'local'); GET /reports additionally refreshes on demand
    // via CatalogAggregator.ensureFresh.
    expect(scheduler.scheduleTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'regis-aggregate',
        initialDelay: { seconds: 15 },
        scope: 'local',
      }),
    );
  });
});
