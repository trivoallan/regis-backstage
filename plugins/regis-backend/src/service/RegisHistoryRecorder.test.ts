import { mockServices } from '@backstage/backend-test-utils';
import { toSnapshots, RegisHistoryRecorder } from './RegisHistoryRecorder';
import { InMemoryReportHistoryStore } from './ReportHistoryStore';
import type { ReportIndex } from '@regis/backstage-plugin-regis-common';

const RUN = new Date('2026-05-10T09:30:00.000Z');

describe('toSnapshots', () => {
  it('maps index entries to snapshots, using snapshotDate when present', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [
        {
          imageRef: 'r/n:1',
          reportUrl: 'https://x/r.json',
          digest: 'sha256:abc',
          tier: 'Gold',
          score: 100,
          playbook: 'default',
          snapshotDate: '2026-05-09',
        },
      ],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s).toEqual({
      imageRef: 'r/n:1',
      snapshotDate: '2026-05-09',
      digest: 'sha256:abc',
      tier: 'Gold',
      score: 100,
      playbook: 'default',
      reportUrl: 'https://x/r.json',
      recordedAt: '2026-05-10T09:30:00.000Z',
    });
  });

  it('falls back to the run date (day granularity) when snapshotDate is absent', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s.snapshotDate).toBe('2026-05-10');
    expect(s.tier).toBeUndefined();
    expect(s.score).toBeUndefined();
  });

  it('maps owner and system from the index entry', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [
        {
          imageRef: 'r/n:1',
          reportUrl: 'https://x/r.json',
          owner: 'group:default/team-x',
          system: 'shop',
        },
      ],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s.owner).toBe('group:default/team-x');
    expect(s.system).toBe('shop');
  });

  it('passes null tier through as null', () => {
    const index: ReportIndex = {
      schemaVersion: 1,
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json', tier: null }],
    };
    const [s] = toSnapshots(index, RUN);
    expect(s.tier).toBeNull();
  });
});

describe('RegisHistoryRecorder.record', () => {
  it('fetches the index and appends snapshots to the store', async () => {
    const store = new InMemoryReportHistoryStore();
    const source = {
      fetch: jest.fn().mockResolvedValue({
        schemaVersion: 1,
        images: [
          { imageRef: 'r/n:1', reportUrl: 'https://x/r.json', score: 80, snapshotDate: '2026-05-09' },
        ],
      }),
    };
    const recorder = new RegisHistoryRecorder({
      source: source as any,
      store,
      indexUrl: 'https://x/index.json',
      logger: mockServices.logger.mock(),
      now: () => RUN,
    });
    await recorder.record();
    const rows = await store.getByImageRef('r/n:1');
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(80);
  });
});
