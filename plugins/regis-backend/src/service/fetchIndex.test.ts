import { fetchIndex } from './fetchIndex';

describe('fetchIndex', () => {
  it('fetches and validates the index', async () => {
    const source = {
      fetch: jest.fn().mockResolvedValue({
        schemaVersion: 1,
        images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/report.json' }],
      }),
    };
    const index = await fetchIndex(source as any, 'https://x/index.json');
    expect(source.fetch).toHaveBeenCalledWith('https://x/index.json');
    expect(index.images).toHaveLength(1);
  });

  it('propagates validation errors', async () => {
    const source = { fetch: jest.fn().mockResolvedValue({ schemaVersion: 1 }) };
    await expect(fetchIndex(source as any, 'https://x/index.json')).rejects.toThrow();
  });
});
