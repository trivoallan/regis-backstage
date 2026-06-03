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

  it('GET /report/history returns an empty series for a known image with no history', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [imageEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/report/history?entityRef=resource:default/library-nginx-1.27')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      snapshots: [],
    });
  });

  it('GET /report/history 404s when the entity has no image-ref', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/report/history?entityRef=component:default/bare')
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

  it('GET /portfolio/trend returns a bounded daily series', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=7')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets).toHaveLength(7);
    expect(typeof res.body.generatedAt).toBe('string');
  });

  it('GET /portfolio/trend returns filters echo and facets', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=7&system=shop')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.filters).toEqual({ system: 'shop' });
    expect(res.body.facets).toEqual({ systems: [], owners: [] }); // empty store
    expect(res.body.buckets).toHaveLength(7);
  });

  it('GET /portfolio/trend clamps days out of range', async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [bareEntity] }),
      ],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=9999')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(365);
  });
});
