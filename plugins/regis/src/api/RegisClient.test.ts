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
});
