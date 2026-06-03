import { TestDatabases } from '@backstage/backend-test-utils';
import { KnexReportHistoryStore } from './KnexReportHistoryStore';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

const snap = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  imageRef: 'r/n:1',
  snapshotDate: '2026-05-01',
  recordedAt: '2026-05-01T00:00:00.000Z',
  ...over,
});

describe('KnexReportHistoryStore', () => {
  const databases = TestDatabases.create();

  it('creates its schema, upserts idempotently, and reads ordered rows', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);

    await store.append([
      snap({ snapshotDate: '2026-05-03', score: 90, digest: 'sha256:b', tier: 'Gold' }),
      snap({ snapshotDate: '2026-05-01', score: 70, digest: 'sha256:a', tier: null }),
    ]);
    // re-observe 2026-05-01 with a new score -> upsert, no duplicate
    await store.append([snap({ snapshotDate: '2026-05-01', score: 75 })]);

    const rows = await store.getByImageRef('r/n:1');
    expect(rows.map(r => r.snapshotDate)).toEqual(['2026-05-01', '2026-05-03']);
    expect(rows[0].score).toBe(75);
    expect(rows[0].tier).toBeUndefined(); // null collapses to undefined on read
    expect(rows[1].digest).toBe('sha256:b');
    expect(await store.getByImageRef('missing')).toEqual([]);
  }, 60_000);
});
