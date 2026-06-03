import type { LoggerService } from '@backstage/backend-plugin-api';
import type { ReportSnapshot } from '@regis/backstage-plugin-regis-common';
import type { ReportSource } from './ReportSource';
import type { ReportHistoryStore } from './ReportHistoryStore';

export interface SeedHistoryDeps {
  source: ReportSource;
  store: ReportHistoryStore;
  seedUrl: string;
  logger: LoggerService;
}

/**
 * Dev convenience: load a JSON array of `ReportSnapshot` from `seedUrl` into the
 * history store. Idempotent (the store upserts by (imageRef, snapshotDate)), so
 * it is safe to run on every boot. Not used in production — gated on config.
 */
export async function seedHistory(deps: SeedHistoryDeps): Promise<void> {
  const raw = await deps.source.fetch(deps.seedUrl);
  if (!Array.isArray(raw)) {
    throw new Error('regis: history seed must be a JSON array of snapshots');
  }
  const snapshots = raw as ReportSnapshot[];
  await deps.store.append(snapshots);
  deps.logger.info(`regis: seeded ${snapshots.length} history snapshot(s)`);
}
