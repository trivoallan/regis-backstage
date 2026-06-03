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
    expect(res.body.facets).toEqual({ systems: [], owners: [], playbooks: [] }); // empty store
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

  it('GET /portfolio/trend passes ?playbook= into filters and echoes it back', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/trend?days=7&playbook=p1')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.filters).toEqual({ playbook: 'p1' });
    expect(res.body.facets).toHaveProperty('playbooks');
    expect(res.body.buckets).toHaveLength(7);
  });

  it('GET /playbooks returns 200 with resolved ladders list', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/playbooks')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    // Empty history store → empty ladder list; this pins the response contract
    // (always a `{ playbooks: [...] }` envelope). The PlaybookLadder shape itself
    // is covered by PortfolioTrendAggregator.test.ts ('builds PlaybookLadder list').
    expect(res.body).toEqual({ playbooks: [] });
  });

  it('GET /portfolio/explore returns the explorer payload with the requested groupBy', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/explore?groupBy=owner&system=shop')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('owner');
    expect(res.body.filters).toEqual({ system: 'shop' });
    expect(res.body).toHaveProperty('groups');
    expect(res.body).toHaveProperty('images');
    expect(res.body).toHaveProperty('facets');
    expect(res.body.trend).toHaveProperty('bands');
  });

  it('defaults groupBy to system when missing/invalid', async () => {
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bareEntity] })],
    });
    const res = await request(server)
      .get('/api/regis/portfolio/explore?groupBy=bogus')
      .set('Authorization', mockCredentials.user.header());
    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('system');
  });

});
