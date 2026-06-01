import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './schema/report.schema.json';
import type { Report } from './types';

/** Highest report `schemaVersion` this package understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

function ajvMessage(errors: ErrorObject[]): string {
  return errors
    .map(e => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
    .join('; ');
}

/** Thrown when a report does not match the report schema. */
export class ReportSchemaError extends Error {
  constructor(public readonly errors: ErrorObject[]) {
    super(`report failed schema validation: ${ajvMessage(errors)}`);
    this.name = 'ReportSchemaError';
  }
}

/** Thrown when a report's schemaVersion is newer than this package supports. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly schemaVersion: number) {
    super(
      `report uses schemaVersion ${schemaVersion}; this plugin supports up to ` +
        `${SUPPORTED_SCHEMA_VERSION} — upgrade the Regis plugin`,
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile<Report>(schema as object);

/**
 * Validates raw JSON against the report contract.
 * Checks `schemaVersion` first so a newer-major report yields the actionable
 * UnsupportedSchemaVersionError rather than a noisy schema error.
 */
export function validateReport(input: unknown): Report {
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version);
  }
  if (!validateSchema(input)) {
    throw new ReportSchemaError(validateSchema.errors ?? []);
  }
  return input as Report;
}
