import { mockCredentials } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import {
  ReportHistoryService,
  NoImageRefError,
} from './ReportHistoryService';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';

const imageEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'library-nginx-1.27',
    namespace: 'default',
    annotations: { 'regis.io/image-ref': 'registry-1.docker.io/library/nginx:1.27' },
  },
  spec: { type: 'container-image', owner: 'group:default/team' },
};

const bareEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'bare', namespace: 'default', annotations: {} },
  spec: { type: 'service', owner: 'team', lifecycle: 'production' },
};

const creds = mockCredentials.user();

describe('ReportHistoryService', () => {
  it('resolves the image-ref and returns its ordered snapshots', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      {
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        snapshotDate: '2026-05-01',
        score: 70,
        recordedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);
    const svc = new ReportHistoryService({
      catalog: catalogServiceMock({ entities: [imageEntity] }),
      store,
    });
    const out = await svc.getHistory('resource:default/library-nginx-1.27', creds);
    expect(out.imageRef).toBe('registry-1.docker.io/library/nginx:1.27');
    expect(out.snapshots).toHaveLength(1);
  });

  it('throws NoImageRefError when the entity has no image-ref', async () => {
    const svc = new ReportHistoryService({
      catalog: catalogServiceMock({ entities: [bareEntity] }),
      store: new InMemoryReportHistoryStore(),
    });
    await expect(
      svc.getHistory('component:default/bare', creds),
    ).rejects.toBeInstanceOf(NoImageRefError);
  });
});
