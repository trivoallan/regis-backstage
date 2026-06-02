import { InMemoryReportHistoryStore } from './ReportHistoryStore';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

describe('InMemoryReportHistoryStore', () => {
  it('returns snapshots for an imageRef ordered by snapshotDate', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([
      snap({ snapshotDate: '2026-05-03', score: 90 }),
      snap({ snapshotDate: '2026-05-01', score: 70 }),
    ]);
    const rows = await store.getByImageRef('r/n:1');
    expect(rows.map(r => r.snapshotDate)).toEqual(['2026-05-01', '2026-05-03']);
  });

  it('upserts idempotently on (imageRef, snapshotDate)', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([snap({ snapshotDate: '2026-05-01', score: 70 })]);
    await store.append([snap({ snapshotDate: '2026-05-01', score: 95 })]);
    const rows = await store.getByImageRef('r/n:1');
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(95);
  });

  it('isolates rows by imageRef', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([snap({ imageRef: 'a:1' }), snap({ imageRef: 'b:1' })]);
    expect(await store.getByImageRef('a:1')).toHaveLength(1);
    expect(await store.getByImageRef('missing')).toEqual([]);
  });

  it('normalizes tier null to undefined on read (matches Knex store contract)', async () => {
    const store = new InMemoryReportHistoryStore();
    await store.append([snap({ tier: null as unknown as undefined })]);
    const rows = await store.getByImageRef('r/n:1');
    expect(rows[0].tier).toBeUndefined();
  });
});
