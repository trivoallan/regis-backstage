import {
  validateReportIndex,
  validateIndexImageEntry,
  IndexSchemaError,
  IndexEntrySchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
import validIndex from './__fixtures__/index.valid.json';
import futureIndex from './__fixtures__/index.future.json';
import invalidIndex from './__fixtures__/index.invalid.json';

describe('validateReportIndex', () => {
  it('accepts a valid index and returns it typed', () => {
    const index = validateReportIndex(validIndex);
    expect(index.schemaVersion).toBe(1);
    expect(index.images).toHaveLength(2);
    expect(index.images[0].imageRef).toBe(
      'registry-1.docker.io/library/nginx:1.27',
    );
    expect(index.playbooks?.[0].id).toBe('default');
  });

  it('rejects a future schemaVersion with an actionable error', () => {
    expect(() => validateReportIndex(futureIndex)).toThrow(
      UnsupportedIndexSchemaVersionError,
    );
  });

  it('rejects a schema-invalid index (image missing imageRef/reportUrl)', () => {
    expect(() => validateReportIndex(invalidIndex)).toThrow(IndexSchemaError);
  });

  it('exposes the supported version', () => {
    expect(SUPPORTED_INDEX_SCHEMA_VERSION).toBe(1);
  });

  it('accepts an optional snapshotDate on an image entry', () => {
    const index = validateReportIndex({
      schemaVersion: 1,
      images: [
        {
          imageRef: 'registry-1.docker.io/library/nginx:1.27',
          reportUrl: 'https://example.test/report.json',
          snapshotDate: '2026-05-31',
        },
      ],
    });
    expect(index.images[0].snapshotDate).toBe('2026-05-31');
  });
});

describe('report index tiers', () => {
  it('accepts an index whose playbooks carry an ordered tiers list', () => {
    const idx = validateReportIndex({
      schemaVersion: 1,
      playbooks: [
        {
          id: 'default',
          title: 'Default',
          tiers: [
            { name: 'Gold', color: '#d4af37' },
            { name: 'Silver' },
            { name: 'Bronze' },
          ],
        },
      ],
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    });
    expect(idx.playbooks?.[0].tiers?.map(t => t.name)).toEqual([
      'Gold',
      'Silver',
      'Bronze',
    ]);
  });

  it('still accepts a v1 index whose playbooks omit tiers (backward compatible)', () => {
    const idx = validateReportIndex({
      schemaVersion: 1,
      playbooks: [{ id: 'default', title: 'Default' }],
      images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
    });
    expect(idx.playbooks?.[0].tiers).toBeUndefined();
  });

  it('rejects a tier entry missing its name', () => {
    expect(() =>
      validateReportIndex({
        schemaVersion: 1,
        playbooks: [{ id: 'default', tiers: [{ color: '#fff' }] }],
        images: [{ imageRef: 'r/n:1', reportUrl: 'https://x/r.json' }],
      }),
    ).toThrow();
  });
});

describe('validateIndexImageEntry', () => {
  it('accepts a minimal valid entry (imageRef + reportUrl) and returns it typed', () => {
    const entry = validateIndexImageEntry({
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      reportUrl: 'https://example.test/reports/nginx.json',
    });
    expect(entry.imageRef).toBe('registry-1.docker.io/library/nginx:1.27');
  });

  it('accepts the optional fields (owner, system, playbook, tier, score)', () => {
    const entry = validateIndexImageEntry({
      imageRef: 'r/n:1',
      reportUrl: 'https://x/r.json',
      owner: 'group:default/team-platform',
      system: 'shop',
      playbook: 'default',
      tier: 'Gold',
      score: 100,
    });
    expect(entry.owner).toBe('group:default/team-platform');
  });

  it('rejects an entry missing reportUrl', () => {
    expect(() =>
      validateIndexImageEntry({ imageRef: 'r/n:1' }),
    ).toThrow(IndexEntrySchemaError);
  });

  it('rejects an entry missing imageRef', () => {
    expect(() =>
      validateIndexImageEntry({ reportUrl: 'https://x/r.json' }),
    ).toThrow(IndexEntrySchemaError);
  });

  it('rejects a wrong-typed score', () => {
    expect(() =>
      validateIndexImageEntry({
        imageRef: 'r/n:1',
        reportUrl: 'https://x/r.json',
        score: 'high',
      }),
    ).toThrow(IndexEntrySchemaError);
  });
});
