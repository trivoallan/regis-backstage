import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './schema/report-index.schema.json';

/** Highest report-index `schemaVersion` this package understands. */
export const SUPPORTED_INDEX_SCHEMA_VERSION = 1;

/** One tier in a playbook's ladder, as published in the index. */
export interface IndexTierDef {
  /** Tier name, e.g. "Gold". */
  name: string;
  /** Optional display color (hex). */
  color?: string;
}

/** A playbook entry in the published index (mirrors the regis v0.34.0 envelope metadata). */
export interface IndexPlaybookEntry {
  /** Machine id — regis `metadata.name`. */
  id: string;
  /** Display name — regis `metadata.title`. */
  title?: string;
  /** Bundle version — regis `metadata.labels["app.kubernetes.io/version"]`. */
  version?: string;
  /** Backstage owner entity ref (regis has no owner concept). */
  owner?: string;
  /** Ordered tier ladder, best→worst. Array order is the source of truth for rank. */
  tiers?: IndexTierDef[];
}

/** An analyzed-image entry in the published index. */
export interface IndexImageEntry {
  /** Full canonical image reference (authoritative identity). */
  imageRef: string;
  /** Resolved content digest (required for alias grouping). */
  digest?: string;
  /** URL of this image's report.json. */
  reportUrl: string;
  /** Earned tier (Gold/Silver/Bronze) or null. */
  tier?: string | null;
  /** Overall score 0-100. */
  score?: number;
  /** Id of the playbook this image was assessed against. */
  playbook?: string;
  /** Backstage owner entity ref. */
  owner?: string;
  /** Backstage system name. */
  system?: string;
  /** ISO date of the report snapshot (report-true dating for history). */
  snapshotDate?: string;
}

/** The published report index. */
export interface ReportIndex {
  schemaVersion: number;
  playbooks?: IndexPlaybookEntry[];
  images: IndexImageEntry[];
}

function ajvMessage(errors: ErrorObject[]): string {
  return errors
    .map(e => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
    .join('; ');
}

/** Thrown when an index does not match the index schema. */
export class IndexSchemaError extends Error {
  constructor(public readonly errors: ErrorObject[]) {
    super(`report index failed schema validation: ${ajvMessage(errors)}`);
    this.name = 'IndexSchemaError';
  }
}

/** Thrown when a single image entry does not match the entry schema. */
export class IndexEntrySchemaError extends Error {
  constructor(public readonly errors: ErrorObject[]) {
    super(`index image entry failed schema validation: ${ajvMessage(errors)}`);
    this.name = 'IndexEntrySchemaError';
  }
}

/** Thrown when an index `schemaVersion` is newer than this package supports. */
export class UnsupportedIndexSchemaVersionError extends Error {
  constructor(public readonly schemaVersion: number) {
    super(
      `report index uses schemaVersion ${schemaVersion}; this plugin supports up to ` +
        `${SUPPORTED_INDEX_SCHEMA_VERSION} — upgrade the Regis plugin`,
    );
    this.name = 'UnsupportedIndexSchemaVersionError';
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile<ReportIndex>(schema as object);
const validateEntrySchema = ajv.compile<IndexImageEntry>(
  (schema as { properties: { images: { items: object } } }).properties.images
    .items,
);

/** Validates raw JSON against the report-index contract. */
export function validateReportIndex(input: unknown): ReportIndex {
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SUPPORTED_INDEX_SCHEMA_VERSION) {
    throw new UnsupportedIndexSchemaVersionError(version);
  }
  if (!validateSchema(input)) {
    throw new IndexSchemaError(validateSchema.errors ?? []);
  }
  return input as ReportIndex;
}

/** Validates a single raw image entry against the index entry contract. */
export function validateIndexImageEntry(input: unknown): IndexImageEntry {
  if (!validateEntrySchema(input)) {
    throw new IndexEntrySchemaError(validateEntrySchema.errors ?? []);
  }
  return input as IndexImageEntry;
}
