import { mockServices } from '@backstage/backend-test-utils';
import { seedHistory } from './seedHistory';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';

describe('seedHistory', () => {
  it('appends the snapshots fetched from the seed URL', async () => {
    const store = new InMemoryReportHistoryStore();
    const source = {
      fetch: jest.fn().mockResolvedValue([
        { imageRef: 'r/n:1', snapshotDate: '2026-04-01', score: 70, tier: 'Silver', recordedAt: '2026-04-01T08:00:00.000Z' },
        { imageRef: 'r/n:1', snapshotDate: '2026-05-01', score: 100, tier: 'Gold', recordedAt: '2026-05-01T08:00:00.000Z' },
      ]),
    };
    await seedHistory({
      source: source as any,
      store,
      seedUrl: 'http://localhost:8080/regis-history.json',
      logger: mockServices.logger.mock(),
    });
    expect(source.fetch).toHaveBeenCalledWith('http://localhost:8080/regis-history.json');
    expect(await store.getByImageRef('r/n:1')).toHaveLength(2);
  });

  it('throws when the seed payload is not an array', async () => {
    const source = { fetch: jest.fn().mockResolvedValue({ nope: true }) };
    await expect(
      seedHistory({
        source: source as any,
        store: new InMemoryReportHistoryStore(),
        seedUrl: 'http://x',
        logger: mockServices.logger.mock(),
      }),
    ).rejects.toThrow(/array/);
  });
});
