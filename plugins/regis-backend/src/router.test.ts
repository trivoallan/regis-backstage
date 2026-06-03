import {
  mockCredentials,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import request from 'supertest';
import { regisPlugin } from './plugin';

const bareEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'bare', namespace: 'default', annotations: {} },
  spec: { type: 'service', owner: 'team', lifecycle: 'production' },
};

describe('regis-backend routes', () => {
  it('GET /health returns ok without auth', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server).get('/api/regis/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /report 404s when the annotation is missing', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/report?entityRef=component:default/bare')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(404);
  });

  it('GET /report 404s when the entity does not exist', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [] })],
    });
    const res = await request(server)
      .get('/api/regis/report?entityRef=component:default/missing')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(404);
  });
});
