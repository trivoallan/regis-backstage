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

  it('listSnapshots returns all rows across images', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);
    await store.append([
      snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', score: 70 }),
      snap({ imageRef: 'b:1', snapshotDate: '2026-05-02', score: 90 }),
    ]);
    const all = await store.listSnapshots();
    expect(all).toHaveLength(2);
    expect(all.map(s => s.imageRef).sort()).toEqual(['a:1', 'b:1']);
  }, 60_000);

  it('round-trips owner and system', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = await KnexReportHistoryStore.create(knex);
    await store.append([
      snap({ imageRef: 'a:1', snapshotDate: '2026-05-01', owner: 'group:default/team-x', system: 'shop' }),
    ]);
    const [row] = await store.listSnapshots();
    expect(row.owner).toBe('group:default/team-x');
    expect(row.system).toBe('shop');
  }, 60_000);

  it('adds owner/system columns to a pre-existing table without them', async () => {
    const knex = await databases.init('SQLITE_3');
    // Simulate the merged #8 schema (no owner/system columns).
    await knex.schema.createTable('regis_report_snapshots', t => {
      t.text('image_ref').notNullable();
      t.text('snapshot_date').notNullable();
      t.text('digest').nullable();
      t.text('tier').nullable();
      t.integer('score').nullable();
      t.text('playbook').nullable();
      t.text('report_url').nullable();
      t.text('recorded_at').notNullable();
      t.primary(['image_ref', 'snapshot_date']);
    });
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'owner')).toBe(false);

    const store = await KnexReportHistoryStore.create(knex); // should migrate
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'owner')).toBe(true);
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'system')).toBe(true);

    await store.append([snap({ imageRef: 'a:1', system: 'shop' })]);
    expect((await store.listSnapshots())[0].system).toBe('shop');

    // idempotent: a second create is a no-op
    await KnexReportHistoryStore.create(knex);
    expect(await knex.schema.hasColumn('regis_report_snapshots', 'system')).toBe(true);
  }, 60_000);
});
