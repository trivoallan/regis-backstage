import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';

/** Append-only per-image posture snapshot series. Keyed by (imageRef, snapshotDate). */
export interface ReportHistoryStore {
  /** Idempotent upsert by (imageRef, snapshotDate). */
  append(snapshots: ReportSnapshot[]): Promise<void>;
  /** All snapshots for an image, ordered by snapshotDate ascending. */
  getByImageRef(imageRef: string): Promise<ReportSnapshot[]>;
  /** All snapshots across all images (data access for aggregation). */
  listSnapshots(): Promise<ReportSnapshot[]>;
}

/** In-memory impl for tests. */
export class InMemoryReportHistoryStore implements ReportHistoryStore {
  private readonly rows = new Map<string, ReportSnapshot>();

  private key(s: { imageRef: string; snapshotDate: string }): string {
    return `${s.imageRef} ${s.snapshotDate}`;
  }

  async append(snapshots: ReportSnapshot[]): Promise<void> {
    for (const s of snapshots) this.rows.set(this.key(s), s);
  }

  // Reads normalize null → undefined to match the Knex store's read contract.
  async getByImageRef(imageRef: string): Promise<ReportSnapshot[]> {
    return [...this.rows.values()]
      .filter(s => s.imageRef === imageRef)
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
      .map(s => ({ ...s, tier: s.tier ?? undefined }));
  }

  async listSnapshots(): Promise<ReportSnapshot[]> {
    return [...this.rows.values()].map(s => ({ ...s, tier: s.tier ?? undefined }));
  }
}
