import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  ReportIndex,
  ReportSnapshot,
} from '@regis/backstage-plugin-regis-common';
import { fetchIndex } from './fetchIndex';
import type { ReportSource } from './ReportSource';
import type { ReportHistoryStore } from './ReportHistoryStore';

/** Pure: map a validated index to snapshot rows for a given run time. */
export function toSnapshots(index: ReportIndex, runDate: Date): ReportSnapshot[] {
  const recordedAt = runDate.toISOString();
  const fallbackDate = recordedAt.slice(0, 10); // YYYY-MM-DD
  return index.images.map(e => ({
    imageRef: e.imageRef,
    snapshotDate: e.snapshotDate ?? fallbackDate,
    digest: e.digest,
    tier: e.tier,
    score: e.score,
    playbook: e.playbook,
    reportUrl: e.reportUrl,
    recordedAt,
    owner: e.owner,
    system: e.system,
  }));
}

export interface RegisHistoryRecorderDeps {
  source: ReportSource;
  store: ReportHistoryStore;
  indexUrl: string;
  logger: LoggerService;
  now?: () => Date;
}

/** Fetches the published index and records one snapshot per image. */
export class RegisHistoryRecorder {
  private readonly now: () => Date;

  constructor(private readonly deps: RegisHistoryRecorderDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async record(): Promise<void> {
    const index = await fetchIndex(this.deps.source, this.deps.indexUrl);
    const snapshots = toSnapshots(index, this.now());
    await this.deps.store.append(snapshots);
    this.deps.logger.info(
      `regis: recorded ${snapshots.length} report snapshot(s)`,
    );
  }
}
