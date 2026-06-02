import {
  validateReportIndex,
  IndexSchemaError,
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
});
