import { RegisClient } from './RegisClient';

const discoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/regis'),
};

function clientWith(fetchImpl: jest.Mock) {
  return new RegisClient({
    discoveryApi: discoveryApi as any,
    fetchApi: { fetch: fetchImpl } as any,
  });
}

describe('RegisClient', () => {
  it('GETs /report with an encoded entityRef', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ report: { schemaVersion: 1 }, meta: {} }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getReport('component:default/svc');
    expect(out.report.schemaVersion).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/report?entityRef=component%3Adefault%2Fsvc',
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'bad' }),
    });
    const client = clientWith(fetchImpl);
    await expect(client.getReport('component:default/svc')).rejects.toThrow(
      /422|bad/,
    );
  });

  it('GETs /reports for the catalog page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ entityRef: 'component:default/svc', status: 'ok' }],
    });
    const client = clientWith(fetchImpl);
    const rows = await client.listReports();
    expect(rows).toHaveLength(1);
  });

  it('GETs /report/history with an encoded entityRef', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageRef: 'r/n:1', snapshots: [] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getHistory('resource:default/library-nginx-1.27');
    expect(out.imageRef).toBe('r/n:1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/report/history?entityRef=resource%3Adefault%2Flibrary-nginx-1.27',
    );
  });

  it('GETs /portfolio/trend with the days param', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: 'x', days: 90, buckets: [] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getPortfolioTrend(90);
    expect(out.days).toBe(90);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/portfolio/trend?days=90',
    );
  });

  it('GETs /portfolio/trend with system/owner filters when provided', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: 'x', days: 90, filters: {}, facets: { systems: [], owners: [] }, buckets: [] }),
    });
    const client = clientWith(fetchImpl);
    await client.getPortfolioTrend(90, { system: 'shop', owner: 'group:default/team-x' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/portfolio/trend?days=90&system=shop&owner=group%3Adefault%2Fteam-x',
    );
  });

  it('GETs /playbooks', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ playbooks: [{ id: 'p3', tiers: [] }] }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getPlaybooks();
    expect(out.playbooks[0].id).toBe('p3');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:7007/api/regis/playbooks',
    );
  });

  it('includes ?playbook= in the trend request when filtered', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buckets: [], bands: [], facets: {} }),
    });
    const client = clientWith(fetchImpl);
    await client.getPortfolioTrend(30, { playbook: 'p3' });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('playbook=p3'),
    );
  });

  it('GETs /portfolio/explore with groupBy and filters', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groupBy: 'owner', filters: {}, trend: { bands: [], buckets: [] }, groups: [], images: [], facets: {} }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.explore({ groupBy: 'owner', system: 'shop', tier: 'Gold' });
    expect(out.groupBy).toBe('owner');
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toContain('/portfolio/explore?');
    expect(url).toContain('groupBy=owner');
    expect(url).toContain('system=shop');
    expect(url).toContain('tier=Gold');
  });
});
