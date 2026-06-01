import { HttpReportSource, ReportFetchError } from './ReportSource';

describe('HttpReportSource', () => {
  it('returns parsed JSON on 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: 1 }),
    });
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch('https://h/r.json')).resolves.toEqual({
      schemaVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://h/r.json',
      expect.any(Object),
    );
  });

  it('throws ReportFetchError on non-200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch('https://h/r.json')).rejects.toThrow(
      ReportFetchError,
    );
  });

  it('wraps network errors as ReportFetchError', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch('https://h/r.json')).rejects.toThrow(
      ReportFetchError,
    );
  });
});
