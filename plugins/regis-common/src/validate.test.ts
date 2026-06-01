import valid from './__fixtures__/report.valid.json';
import invalid from './__fixtures__/report.invalid.json';
import future from './__fixtures__/report.future.json';
import degraded from './__fixtures__/report.degraded.json';
import {
  validateReport,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
  SUPPORTED_SCHEMA_VERSION,
} from './validate';

describe('validateReport', () => {
  it('accepts a valid report and returns it typed', () => {
    const r = validateReport(valid);
    expect(r.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(r.request.repository).toBe('library/nginx');
  });

  it('accepts a degraded report (tier null, minimal fields)', () => {
    const r = validateReport(degraded);
    expect(r.tier).toBeNull();
    expect(r.rules).toBeUndefined();
  });

  it('throws ReportSchemaError on a malformed report', () => {
    expect(() => validateReport(invalid)).toThrow(ReportSchemaError);
  });

  it('throws UnsupportedSchemaVersionError on a newer schemaVersion', () => {
    expect(() => validateReport(future)).toThrow(UnsupportedSchemaVersionError);
  });

  it('prefers the version error over schema errors', () => {
    expect(() => validateReport({ schemaVersion: 99 })).toThrow(
      UnsupportedSchemaVersionError,
    );
  });
});
