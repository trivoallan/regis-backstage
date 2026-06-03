import type { Knex } from 'knex';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';
import type { ReportHistoryStore } from './ReportHistoryStore';

const TABLE = 'regis_report_snapshots';

interface Row {
  image_ref: string;
  snapshot_date: string;
  digest: string | null;
  tier: string | null;
  score: number | null;
  playbook: string | null;
  report_url: string | null;
  recorded_at: string;
  owner: string | null;
  system: string | null;
}

/** Knex-backed persistent history store. Self-creates its table on first use. */
export class KnexReportHistoryStore implements ReportHistoryStore {
  private constructor(private readonly db: Knex) {}

  static async create(db: Knex): Promise<KnexReportHistoryStore> {
    try {
      await db.schema.createTable(TABLE, t => {
        t.text('image_ref').notNullable();
        t.text('snapshot_date').notNullable();
        t.text('digest').nullable();
        t.text('tier').nullable();
        t.integer('score').nullable();
        t.text('playbook').nullable();
        t.text('report_url').nullable();
        t.text('owner').nullable();
        t.text('system').nullable();
        t.text('recorded_at').notNullable();
        t.primary(['image_ref', 'snapshot_date']);
        t.index(['image_ref']);
      });
    } catch (err) {
      // Table may already exist (another replica created it concurrently).
      if (!String((err as Error).message).includes('already exists')) throw err;
    }
    for (const col of ['owner', 'system'] as const) {
      if (!(await db.schema.hasColumn(TABLE, col))) {
        await db.schema.alterTable(TABLE, t => t.text(col).nullable());
      }
    }
    return new KnexReportHistoryStore(db);
  }

  async append(snapshots: ReportSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const rows: Row[] = snapshots.map(s => ({
      image_ref: s.imageRef,
      snapshot_date: s.snapshotDate,
      digest: s.digest ?? null,
      tier: s.tier ?? null,
      score: s.score ?? null,
      playbook: s.playbook ?? null,
      report_url: s.reportUrl ?? null,
      recorded_at: s.recordedAt,
      owner: s.owner ?? null,
      system: s.system ?? null,
    }));
    await this.db<Row>(TABLE)
      .insert(rows)
      .onConflict(['image_ref', 'snapshot_date'])
      .merge();
  }

  async getByImageRef(imageRef: string): Promise<ReportSnapshot[]> {
    const rows = await this.db<Row>(TABLE)
      .where({ image_ref: imageRef })
      .orderBy('snapshot_date', 'asc');
    return rows.map(r => ({
      imageRef: r.image_ref,
      snapshotDate: r.snapshot_date,
      digest: r.digest ?? undefined,
      tier: r.tier ?? undefined,
      score: r.score ?? undefined,
      playbook: r.playbook ?? undefined,
      reportUrl: r.report_url ?? undefined,
      recordedAt: r.recorded_at,
      owner: r.owner ?? undefined,
      system: r.system ?? undefined,
    }));
  }

  async listSnapshots(): Promise<ReportSnapshot[]> {
    const rows = await this.db<Row>(TABLE).select('*');
    return rows.map(r => ({
      imageRef: r.image_ref,
      snapshotDate: r.snapshot_date,
      digest: r.digest ?? undefined,
      tier: r.tier ?? undefined,
      score: r.score ?? undefined,
      playbook: r.playbook ?? undefined,
      reportUrl: r.report_url ?? undefined,
      recordedAt: r.recorded_at,
      owner: r.owner ?? undefined,
      system: r.system ?? undefined,
    }));
  }
}
