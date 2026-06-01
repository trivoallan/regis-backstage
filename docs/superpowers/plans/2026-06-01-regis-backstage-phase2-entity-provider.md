# Regis Backstage — Phase 2 Entity Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the canonical entity model from `docs/superpowers/specs/2026-06-01-regis-backstage-entity-model-design.md` — a catalog **entity provider** that reads a published report index and mints `Resource` entities for container images and playbooks, with posture labels/annotations, `dependsOn` relations, and digest-grouped aliases.

**Architecture:** A new **report-index contract** in `@regis/backstage-plugin-regis-common` (hand-authored schema + types + Ajv validator, mirroring the existing report contract). A new **`RegisEntityProvider`** in `@regis/backstage-plugin-regis-backend` that fetches+validates the index (reusing the existing `ReportSource` abstraction), builds entities via pure functions, and applies a `full` mutation; it is wired through a **catalog backend module** (`catalogModuleRegisEntityProvider`) registered against `catalogProcessingExtensionPoint` and scheduled via `coreServices.scheduler`. The demo backend adds the module; `app-config.yaml` gains a `regis.catalog.*` section.

**Tech Stack:** TypeScript, Backstage new backend system (`@backstage/backend-plugin-api`, `@backstage/plugin-catalog-node`, `@backstage/catalog-model`), Ajv 2020 (already a `regis-common` dep), Jest via `backstage-cli package test`, `@backstage/backend-test-utils`.

**Conventions (from the existing Phase 1 code):**
- Run a single package's tests: `yarn workspace @regis/backstage-plugin-regis-common test` (or `...-regis-backend`). Append `-- <path>` to scope to a file. `backstage-cli package test` runs Jest in watch-off mode in CI.
- Typecheck the repo: `yarn tsc`. Lint a package: `yarn workspace <pkg> lint`.
- Conventional Commits. Commit after each green task.
- Pure logic lives in small focused files with co-located `*.test.ts`; services/providers under `src/<area>/`.

---

## File Structure

**`@regis/backstage-plugin-regis-common`** (the contract layer):
- Create `src/schema/report-index.schema.json` — JSON Schema for the index (hand-authored; the index is the plugin's own contract, not synced from the core).
- Create `src/report-index.ts` — index TS types + `validateReportIndex` + `IndexSchemaError` + `UnsupportedIndexSchemaVersionError` + `SUPPORTED_INDEX_SCHEMA_VERSION`.
- Create `src/catalog.ts` — entity vocabulary: `Resource` type constants, the `regis.io/*` annotation/label key constants, and the pure `scoreBand(score)` helper.
- Create fixtures `src/__fixtures__/index.valid.json`, `index.future.json`, `index.invalid.json`.
- Create tests `src/report-index.test.ts`, `src/catalog.test.ts`.
- Modify `src/index.ts` — re-export the new public surface.

**`@regis/backstage-plugin-regis-backend`** (the provider):
- Create `src/provider/imageRef.ts` — `parseImageRef`, `sanitizeName`, `shortHash`, `imageEntityName` (pure).
- Create `src/provider/buildEntities.ts` — `groupAliasesByDigest`, `buildPlaybookEntity`, `buildImageEntity`, `buildEntities` (pure).
- Create `src/provider/RegisEntityProvider.ts` — the `EntityProvider` implementation.
- Create `src/module.ts` — `catalogModuleRegisEntityProvider` (catalog backend module).
- Create tests `src/provider/imageRef.test.ts`, `src/provider/buildEntities.test.ts`, `src/provider/RegisEntityProvider.test.ts`, `src/module.test.ts`.
- Modify `src/index.ts` — export the module.

**Demo app:**
- Modify `packages/backend/src/index.ts` — add the module.
- Modify `app-config.yaml` — add the `regis.catalog.*` section.
- Create `examples/regis-index.json` — a sample index (reference + manual demo).
- Modify `plugins/regis-backend/README.md` — document the provider + config.

---

## Task 1: regis-common — report-index contract (schema, types, validator)

**Files:**
- Create: `plugins/regis-common/src/schema/report-index.schema.json`
- Create: `plugins/regis-common/src/report-index.ts`
- Create: `plugins/regis-common/src/__fixtures__/index.valid.json`
- Create: `plugins/regis-common/src/__fixtures__/index.future.json`
- Create: `plugins/regis-common/src/__fixtures__/index.invalid.json`
- Test: `plugins/regis-common/src/report-index.test.ts`

- [ ] **Step 1: Write the schema file**

Create `plugins/regis-common/src/schema/report-index.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://trivoallan.github.io/regis-backstage/schemas/report-index.schema.json",
  "title": "Regis Report Index",
  "description": "Registry-agnostic index of analyzed images and playbooks, consumed by the Regis Backstage entity provider.",
  "type": "object",
  "required": ["schemaVersion", "images"],
  "properties": {
    "schemaVersion": { "type": "integer", "minimum": 1 },
    "playbooks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id"],
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "title": { "type": "string" },
          "version": { "type": "string" },
          "owner": { "type": "string" }
        }
      }
    },
    "images": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["imageRef", "reportUrl"],
        "properties": {
          "imageRef": { "type": "string", "minLength": 1 },
          "digest": { "type": "string" },
          "reportUrl": { "type": "string", "minLength": 1 },
          "tier": { "type": ["string", "null"] },
          "score": { "type": "number" },
          "playbook": { "type": "string" },
          "owner": { "type": "string" },
          "system": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the fixtures**

Create `plugins/regis-common/src/__fixtures__/index.valid.json`:

```json
{
  "schemaVersion": 1,
  "playbooks": [
    {
      "id": "default",
      "title": "Regis Default Playbook",
      "version": "1.0.0",
      "owner": "group:default/team-platform"
    }
  ],
  "images": [
    {
      "imageRef": "registry-1.docker.io/library/nginx:1.27",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "reportUrl": "https://example.test/reports/nginx-1.27/report.json",
      "tier": "Gold",
      "score": 100,
      "playbook": "default",
      "owner": "group:default/team-platform",
      "system": "nginx"
    },
    {
      "imageRef": "registry-1.docker.io/library/nginx:latest",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "reportUrl": "https://example.test/reports/nginx-latest/report.json",
      "tier": "Gold",
      "score": 100,
      "playbook": "default"
    }
  ]
}
```

Create `plugins/regis-common/src/__fixtures__/index.future.json`:

```json
{ "schemaVersion": 999, "images": [] }
```

Create `plugins/regis-common/src/__fixtures__/index.invalid.json`:

```json
{ "schemaVersion": 1, "images": [{ "digest": "sha256:abc" }] }
```

- [ ] **Step 3: Write the failing test**

Create `plugins/regis-common/src/report-index.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test -- src/report-index.test.ts`
Expected: FAIL — `Cannot find module './report-index'`.

- [ ] **Step 5: Implement the validator**

Create `plugins/regis-common/src/report-index.ts`:

```typescript
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './schema/report-index.schema.json';

/** Highest report-index `schemaVersion` this package understands. */
export const SUPPORTED_INDEX_SCHEMA_VERSION = 1;

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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test -- src/report-index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-common/src/schema/report-index.schema.json plugins/regis-common/src/report-index.ts plugins/regis-common/src/report-index.test.ts plugins/regis-common/src/__fixtures__/index.valid.json plugins/regis-common/src/__fixtures__/index.future.json plugins/regis-common/src/__fixtures__/index.invalid.json
git commit -m "feat(regis-common): add report-index contract and validator"
```

---

## Task 2: regis-common — entity vocabulary + scoreBand

**Files:**
- Create: `plugins/regis-common/src/catalog.ts`
- Test: `plugins/regis-common/src/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-common/src/catalog.test.ts`:

```typescript
import {
  REGIS_RESOURCE_TYPE_IMAGE,
  REGIS_RESOURCE_TYPE_PLAYBOOK,
  REGIS_ANNOTATION_IMAGE_REF,
  REGIS_ANNOTATION_IMAGE_DIGEST,
  REGIS_ANNOTATION_IMAGE_ALIASES,
  REGIS_ANNOTATION_SCORE,
  REGIS_ANNOTATION_SNAPSHOT_DATE,
  REGIS_ANNOTATION_REGIS_VERSION,
  REGIS_ANNOTATION_PLAYBOOK,
  REGIS_ANNOTATION_PLAYBOOK_ID,
  REGIS_LABEL_TIER,
  REGIS_LABEL_SCORE_BAND,
  scoreBand,
} from './catalog';

describe('entity vocabulary', () => {
  it('uses the documented constant values', () => {
    expect(REGIS_RESOURCE_TYPE_IMAGE).toBe('container-image');
    expect(REGIS_RESOURCE_TYPE_PLAYBOOK).toBe('regis-playbook');
    expect(REGIS_ANNOTATION_IMAGE_REF).toBe('regis.io/image-ref');
    expect(REGIS_ANNOTATION_IMAGE_DIGEST).toBe('regis.io/image-digest');
    expect(REGIS_ANNOTATION_IMAGE_ALIASES).toBe('regis.io/image-aliases');
    expect(REGIS_ANNOTATION_SCORE).toBe('regis.io/score');
    expect(REGIS_ANNOTATION_SNAPSHOT_DATE).toBe('regis.io/snapshot-date');
    expect(REGIS_ANNOTATION_REGIS_VERSION).toBe('regis.io/regis-version');
    expect(REGIS_ANNOTATION_PLAYBOOK).toBe('regis.io/playbook');
    expect(REGIS_ANNOTATION_PLAYBOOK_ID).toBe('regis.io/playbook-id');
    expect(REGIS_LABEL_TIER).toBe('regis.io/tier');
    expect(REGIS_LABEL_SCORE_BAND).toBe('regis.io/score-band');
  });
});

describe('scoreBand', () => {
  it.each([
    [0, '0-49'],
    [49, '0-49'],
    [50, '50-79'],
    [79, '50-79'],
    [80, '80-89'],
    [89, '80-89'],
    [90, '90-100'],
    [100, '90-100'],
  ])('maps %i -> %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });

  it('clamps out-of-range scores', () => {
    expect(scoreBand(-5)).toBe('0-49');
    expect(scoreBand(150)).toBe('90-100');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test -- src/catalog.test.ts`
Expected: FAIL — `Cannot find module './catalog'`.

- [ ] **Step 3: Implement the vocabulary**

Create `plugins/regis-common/src/catalog.ts`:

```typescript
/** `spec.type` for a minted container-image Resource. */
export const REGIS_RESOURCE_TYPE_IMAGE = 'container-image';
/** `spec.type` for a minted playbook Resource. */
export const REGIS_RESOURCE_TYPE_PLAYBOOK = 'regis-playbook';

/** Annotation: full canonical analyzed image reference (authoritative identity). */
export const REGIS_ANNOTATION_IMAGE_REF = 'regis.io/image-ref';
/** Annotation: current resolved content digest (tracks the tag). */
export const REGIS_ANNOTATION_IMAGE_DIGEST = 'regis.io/image-digest';
/** Annotation: comma-separated other refs sharing this digest. */
export const REGIS_ANNOTATION_IMAGE_ALIASES = 'regis.io/image-aliases';
/** Annotation: exact integer score. */
export const REGIS_ANNOTATION_SCORE = 'regis.io/score';
/** Annotation: ISO date of the report snapshot. */
export const REGIS_ANNOTATION_SNAPSHOT_DATE = 'regis.io/snapshot-date';
/** Annotation: version of regis that produced the report. */
export const REGIS_ANNOTATION_REGIS_VERSION = 'regis.io/regis-version';
/** Annotation: entityRef of the playbook the image was assessed against. */
export const REGIS_ANNOTATION_PLAYBOOK = 'regis.io/playbook';
/** Annotation: original regis playbook id (kept when the Backstage name was sanitised). */
export const REGIS_ANNOTATION_PLAYBOOK_ID = 'regis.io/playbook-id';

/** Label: earned tier (queryable). */
export const REGIS_LABEL_TIER = 'regis.io/tier';
/** Label: score band bucket (queryable). */
export const REGIS_LABEL_SCORE_BAND = 'regis.io/score-band';

/** Maps a 0-100 score to its band bucket label value. */
export function scoreBand(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s < 50) return '0-49';
  if (s < 80) return '50-79';
  if (s < 90) return '80-89';
  return '90-100';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test -- src/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-common/src/catalog.ts plugins/regis-common/src/catalog.test.ts
git commit -m "feat(regis-common): add catalog entity vocabulary and scoreBand"
```

---

## Task 3: regis-common — export the new public surface

**Files:**
- Modify: `plugins/regis-common/src/index.ts`

- [ ] **Step 1: Update the barrel exports**

Replace the entire contents of `plugins/regis-common/src/index.ts` with:

```typescript
export {
  REGIS_ANNOTATION_REPORT_URL,
  getRegisReportUrl,
  isRegisAvailable,
} from './annotations';
export {
  validateReport,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
  SUPPORTED_SCHEMA_VERSION,
} from './validate';
export {
  validateReportIndex,
  IndexSchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
export type {
  ReportIndex,
  IndexImageEntry,
  IndexPlaybookEntry,
} from './report-index';
export {
  REGIS_RESOURCE_TYPE_IMAGE,
  REGIS_RESOURCE_TYPE_PLAYBOOK,
  REGIS_ANNOTATION_IMAGE_REF,
  REGIS_ANNOTATION_IMAGE_DIGEST,
  REGIS_ANNOTATION_IMAGE_ALIASES,
  REGIS_ANNOTATION_SCORE,
  REGIS_ANNOTATION_SNAPSHOT_DATE,
  REGIS_ANNOTATION_REGIS_VERSION,
  REGIS_ANNOTATION_PLAYBOOK,
  REGIS_ANNOTATION_PLAYBOOK_ID,
  REGIS_LABEL_TIER,
  REGIS_LABEL_SCORE_BAND,
  scoreBand,
} from './catalog';
export type { Report } from './types';
```

- [ ] **Step 2: Build and typecheck the package**

Run: `yarn workspace @regis/backstage-plugin-regis-common test && yarn tsc`
Expected: PASS — all regis-common tests green, no type errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-common/src/index.ts
git commit -m "feat(regis-common): export report-index and catalog vocabulary"
```

---

## Task 4: regis-backend — parse image references

**Files:**
- Create: `plugins/regis-backend/src/provider/imageRef.ts`
- Test: `plugins/regis-backend/src/provider/imageRef.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/imageRef.test.ts`:

```typescript
import { parseImageRef } from './imageRef';

describe('parseImageRef', () => {
  it('parses a full registry/repository:tag ref', () => {
    expect(parseImageRef('registry-1.docker.io/library/nginx:1.27')).toEqual({
      registry: 'registry-1.docker.io',
      repository: 'library/nginx',
      tag: '1.27',
      digest: undefined,
    });
  });

  it('treats a dotless first segment as repository (Docker Hub implied)', () => {
    expect(parseImageRef('library/nginx:1.27')).toEqual({
      registry: undefined,
      repository: 'library/nginx',
      tag: '1.27',
      digest: undefined,
    });
  });

  it('handles a registry with a port', () => {
    expect(parseImageRef('localhost:5000/team/app:dev')).toEqual({
      registry: 'localhost:5000',
      repository: 'team/app',
      tag: 'dev',
      digest: undefined,
    });
  });

  it('splits a trailing digest', () => {
    expect(
      parseImageRef('ghcr.io/acme/api@sha256:deadbeef'),
    ).toEqual({
      registry: 'ghcr.io',
      repository: 'acme/api',
      tag: undefined,
      digest: 'sha256:deadbeef',
    });
  });

  it('handles a ref with no tag', () => {
    expect(parseImageRef('ghcr.io/acme/api')).toEqual({
      registry: 'ghcr.io',
      repository: 'acme/api',
      tag: undefined,
      digest: undefined,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/imageRef.test.ts`
Expected: FAIL — `Cannot find module './imageRef'`.

- [ ] **Step 3: Implement parseImageRef (and helpers used by later tasks)**

Create `plugins/regis-backend/src/provider/imageRef.ts`:

```typescript
import { createHash } from 'crypto';

export interface ParsedImageRef {
  registry?: string;
  repository: string;
  tag?: string;
  digest?: string;
}

/** Parses an OCI image reference into registry/repository:tag@digest parts. */
export function parseImageRef(ref: string): ParsedImageRef {
  let rest = ref;
  let digest: string | undefined;

  const at = rest.indexOf('@');
  if (at !== -1) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }

  let registry: string | undefined;
  const firstSlash = rest.indexOf('/');
  if (firstSlash !== -1) {
    const head = rest.slice(0, firstSlash);
    if (head.includes('.') || head.includes(':') || head === 'localhost') {
      registry = head;
      rest = rest.slice(firstSlash + 1);
    }
  }

  let tag: string | undefined;
  const lastColon = rest.lastIndexOf(':');
  if (lastColon !== -1) {
    tag = rest.slice(lastColon + 1);
    rest = rest.slice(0, lastColon);
  }

  return { registry, repository: rest, tag, digest };
}

const MAX_NAME = 63;

/** First 8 hex chars of the sha256 of the input — a stable short disambiguator. */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/** Lowercases and maps a string to the Backstage entity-name charset `[a-z0-9._-]`. */
export function sanitizeName(raw: string): string {
  const mapped = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return mapped || 'unnamed';
}

/**
 * Deterministic, ≤63-char, collision-safe Backstage entity name for an image.
 * Appends `-<shortHash(imageRef)>` when the base is too long or already taken.
 * Mutates `taken` to record the assigned name.
 */
export function imageEntityName(
  repository: string,
  tag: string | undefined,
  imageRef: string,
  taken: Set<string>,
): string {
  const base = sanitizeName(`${repository}-${tag ?? 'latest'}`);
  let name = base;
  if (name.length > MAX_NAME || taken.has(name)) {
    const suffix = `-${shortHash(imageRef)}`; // 9 chars
    const head = sanitizeName(base.slice(0, MAX_NAME - suffix.length));
    name = `${head}${suffix}`;
  }
  taken.add(name);
  return name;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/imageRef.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/imageRef.ts plugins/regis-backend/src/provider/imageRef.test.ts
git commit -m "feat(regis-backend): add image-ref parsing and name derivation"
```

---

## Task 5: regis-backend — name derivation edge cases

**Files:**
- Modify: `plugins/regis-backend/src/provider/imageRef.test.ts`

- [ ] **Step 1: Add failing tests for sanitizeName / imageEntityName**

Append to `plugins/regis-backend/src/provider/imageRef.test.ts`:

```typescript
import { sanitizeName, imageEntityName, shortHash } from './imageRef';

describe('sanitizeName', () => {
  it('lowercases and replaces illegal characters with dashes', () => {
    expect(sanitizeName('library/nginx:1.27')).toBe('library-nginx-1.27');
  });

  it('collapses repeats and trims leading/trailing separators', () => {
    expect(sanitizeName('--Foo//Bar..')).toBe('foo-bar');
  });

  it('falls back to "unnamed" for an all-illegal input', () => {
    expect(sanitizeName('@@@')).toBe('unnamed');
  });
});

describe('imageEntityName', () => {
  it('produces a readable base name for a normal ref', () => {
    const taken = new Set<string>();
    expect(
      imageEntityName('library/nginx', '1.27', 'docker.io/library/nginx:1.27', taken),
    ).toBe('library-nginx-1.27');
  });

  it('disambiguates a collision with a hash suffix', () => {
    const taken = new Set<string>();
    const first = imageEntityName('library/nginx', '1.27', 'reg-a/library/nginx:1.27', taken);
    const second = imageEntityName('library/nginx', '1.27', 'reg-b/library/nginx:1.27', taken);
    expect(first).toBe('library-nginx-1.27');
    expect(second).toBe(`library-nginx-1.27-${shortHash('reg-b/library/nginx:1.27')}`);
    expect(second).not.toBe(first);
  });

  it('truncates over-long names to <=63 chars with a hash suffix', () => {
    const taken = new Set<string>();
    const longRepo = 'org/' + 'a'.repeat(80);
    const name = imageEntityName(longRepo, 'v1', 'reg/' + longRepo + ':v1', taken);
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name).toMatch(/-[0-9a-f]{8}$/);
  });

  it('defaults a missing tag to "latest"', () => {
    const taken = new Set<string>();
    expect(imageEntityName('acme/api', undefined, 'ghcr.io/acme/api', taken)).toBe(
      'acme-api-latest',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/imageRef.test.ts`
Expected: PASS — the implementation from Task 4 already satisfies these (this task locks the behaviour with tests).

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-backend/src/provider/imageRef.test.ts
git commit -m "test(regis-backend): cover name sanitisation and collision handling"
```

---

## Task 6: regis-backend — group aliases by digest

**Files:**
- Create: `plugins/regis-backend/src/provider/buildEntities.ts`
- Test: `plugins/regis-backend/src/provider/buildEntities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/buildEntities.test.ts`:

```typescript
import type { IndexImageEntry } from '@regis/backstage-plugin-regis-common';
import { groupAliasesByDigest } from './buildEntities';

const img = (imageRef: string, digest?: string): IndexImageEntry => ({
  imageRef,
  digest,
  reportUrl: `https://h/${imageRef}.json`,
});

describe('groupAliasesByDigest', () => {
  it('links refs that share a digest, excluding self', () => {
    const aliases = groupAliasesByDigest([
      img('r/nginx:1.27', 'sha256:aaa'),
      img('r/nginx:latest', 'sha256:aaa'),
      img('r/redis:7', 'sha256:bbb'),
    ]);
    expect(aliases.get('r/nginx:1.27')).toEqual(['r/nginx:latest']);
    expect(aliases.get('r/nginx:latest')).toEqual(['r/nginx:1.27']);
    expect(aliases.get('r/redis:7')).toEqual([]);
  });

  it('treats digest-less entries as singletons', () => {
    const aliases = groupAliasesByDigest([img('r/nginx:1.27')]);
    expect(aliases.get('r/nginx:1.27')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: FAIL — `Cannot find module './buildEntities'`.

- [ ] **Step 3: Implement groupAliasesByDigest**

Create `plugins/regis-backend/src/provider/buildEntities.ts`:

```typescript
import type { IndexImageEntry } from '@regis/backstage-plugin-regis-common';

/**
 * For each image, the list of OTHER imageRefs that resolve to the same digest.
 * Digest-less entries map to an empty array (treated as singletons).
 */
export function groupAliasesByDigest(
  images: IndexImageEntry[],
): Map<string, string[]> {
  const byDigest = new Map<string, string[]>();
  for (const img of images) {
    if (!img.digest) continue;
    const list = byDigest.get(img.digest) ?? [];
    list.push(img.imageRef);
    byDigest.set(img.digest, list);
  }

  const aliases = new Map<string, string[]>();
  for (const img of images) {
    const siblings = img.digest
      ? (byDigest.get(img.digest) ?? []).filter(r => r !== img.imageRef)
      : [];
    aliases.set(img.imageRef, siblings);
  }
  return aliases;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/buildEntities.ts plugins/regis-backend/src/provider/buildEntities.test.ts
git commit -m "feat(regis-backend): group image aliases by digest"
```

---

## Task 7: regis-backend — build the playbook entity

**Files:**
- Modify: `plugins/regis-backend/src/provider/buildEntities.ts`
- Modify: `plugins/regis-backend/src/provider/buildEntities.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `plugins/regis-backend/src/provider/buildEntities.test.ts`:

```typescript
import { buildPlaybookEntity, BuildOpts } from './buildEntities';

const opts: BuildOpts = {
  indexUrl: 'https://h/index.json',
  defaultOwner: 'group:default/guests',
  namespace: 'default',
};

describe('buildPlaybookEntity', () => {
  it('maps the v0.34.0 envelope metadata onto a Resource', () => {
    const entity = buildPlaybookEntity(
      { id: 'default', title: 'Regis Default Playbook', version: '1.0.0', owner: 'group:default/team-platform' },
      opts,
    );
    expect(entity.kind).toBe('Resource');
    expect(entity.metadata.name).toBe('default');
    expect(entity.metadata.title).toBe('Regis Default Playbook');
    expect(entity.metadata.labels?.['app.kubernetes.io/version']).toBe('1.0.0');
    expect(entity.metadata.annotations?.['regis.io/playbook-id']).toBe('default');
    expect(entity.metadata.annotations?.['backstage.io/managed-by-location']).toBe(
      'regis-provider:https://h/index.json',
    );
    expect((entity.spec as any).type).toBe('regis-playbook');
    expect((entity.spec as any).owner).toBe('group:default/team-platform');
  });

  it('falls back to the default owner when none is given', () => {
    const entity = buildPlaybookEntity({ id: 'minimal' }, opts);
    expect((entity.spec as any).owner).toBe('group:default/guests');
    expect(entity.metadata.labels).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: FAIL — `buildPlaybookEntity`/`BuildOpts` not exported.

- [ ] **Step 3: Implement buildPlaybookEntity**

Add to the top of `plugins/regis-backend/src/provider/buildEntities.ts` (imports) and append the function:

```typescript
import {
  Entity,
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
} from '@backstage/catalog-model';
import {
  IndexPlaybookEntry,
  REGIS_RESOURCE_TYPE_PLAYBOOK,
  REGIS_ANNOTATION_PLAYBOOK_ID,
} from '@regis/backstage-plugin-regis-common';
import { sanitizeName } from './imageRef';

export interface BuildOpts {
  indexUrl: string;
  defaultOwner: string;
  namespace: string;
}

function locationRef(indexUrl: string): string {
  return `regis-provider:${indexUrl}`;
}

export function buildPlaybookEntity(
  entry: IndexPlaybookEntry,
  opts: BuildOpts,
): Entity {
  const location = locationRef(opts.indexUrl);
  const labels = entry.version
    ? { 'app.kubernetes.io/version': sanitizeName(entry.version) }
    : undefined;

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
      name: sanitizeName(entry.id),
      namespace: opts.namespace,
      ...(entry.title ? { title: entry.title } : {}),
      ...(labels ? { labels } : {}),
      annotations: {
        [ANNOTATION_LOCATION]: location,
        [ANNOTATION_ORIGIN_LOCATION]: location,
        [REGIS_ANNOTATION_PLAYBOOK_ID]: entry.id,
      },
    },
    spec: {
      type: REGIS_RESOURCE_TYPE_PLAYBOOK,
      owner: entry.owner ?? opts.defaultOwner,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/buildEntities.ts plugins/regis-backend/src/provider/buildEntities.test.ts
git commit -m "feat(regis-backend): build playbook Resource from index entry"
```

---

## Task 8: regis-backend — build the image entity

**Files:**
- Modify: `plugins/regis-backend/src/provider/buildEntities.ts`
- Modify: `plugins/regis-backend/src/provider/buildEntities.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `plugins/regis-backend/src/provider/buildEntities.test.ts`:

```typescript
import { buildImageEntity } from './buildEntities';

describe('buildImageEntity', () => {
  const entry: IndexImageEntry = {
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    digest: 'sha256:aaa',
    reportUrl: 'https://h/nginx-1.27/report.json',
    tier: 'Gold',
    score: 100,
    playbook: 'default',
    owner: 'group:default/team-platform',
    system: 'nginx',
  };

  it('maps posture into labels + annotations and wires dependsOn', () => {
    const entity = buildImageEntity(
      entry,
      'library-nginx-1.27',
      ['registry-1.docker.io/library/nginx:latest'],
      opts,
    );
    expect(entity.kind).toBe('Resource');
    expect(entity.metadata.name).toBe('library-nginx-1.27');
    expect(entity.metadata.title).toBe('nginx:1.27');
    expect(entity.metadata.labels?.['regis.io/tier']).toBe('gold');
    expect(entity.metadata.labels?.['regis.io/score-band']).toBe('90-100');
    const ann = entity.metadata.annotations!;
    expect(ann['regis.io/report-url']).toBe('https://h/nginx-1.27/report.json');
    expect(ann['regis.io/image-ref']).toBe('registry-1.docker.io/library/nginx:1.27');
    expect(ann['regis.io/image-digest']).toBe('sha256:aaa');
    expect(ann['regis.io/image-aliases']).toBe(
      'registry-1.docker.io/library/nginx:latest',
    );
    expect(ann['regis.io/score']).toBe('100');
    expect(ann['regis.io/playbook']).toBe('resource:default/default');
    expect((entity.spec as any).type).toBe('container-image');
    expect((entity.spec as any).owner).toBe('group:default/team-platform');
    expect((entity.spec as any).system).toBe('nginx');
    expect((entity.spec as any).dependsOn).toEqual(['resource:default/default']);
  });

  it('omits optional fields and falls back to the default owner', () => {
    const entity = buildImageEntity(
      { imageRef: 'ghcr.io/acme/api:dev', reportUrl: 'https://h/api.json' },
      'acme-api-dev',
      [],
      opts,
    );
    const ann = entity.metadata.annotations!;
    expect(entity.metadata.labels).toBeUndefined();
    expect(ann['regis.io/image-digest']).toBeUndefined();
    expect(ann['regis.io/image-aliases']).toBeUndefined();
    expect(ann['regis.io/playbook']).toBeUndefined();
    expect((entity.spec as any).owner).toBe('group:default/guests');
    expect((entity.spec as any).dependsOn).toBeUndefined();
    expect((entity.spec as any).system).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: FAIL — `buildImageEntity` not exported.

- [ ] **Step 3: Implement buildImageEntity**

Extend the imports in `plugins/regis-backend/src/provider/buildEntities.ts` and append the function. Update the existing common import to add the image vocabulary, and the imageRef import to add `parseImageRef`:

```typescript
// extend the existing '@regis/backstage-plugin-regis-common' import with:
//   IndexImageEntry,
//   REGIS_RESOURCE_TYPE_IMAGE,
//   REGIS_ANNOTATION_REPORT_URL,
//   REGIS_ANNOTATION_IMAGE_REF,
//   REGIS_ANNOTATION_IMAGE_DIGEST,
//   REGIS_ANNOTATION_IMAGE_ALIASES,
//   REGIS_ANNOTATION_SCORE,
//   REGIS_ANNOTATION_SNAPSHOT_DATE,
//   REGIS_ANNOTATION_REGIS_VERSION,
//   REGIS_ANNOTATION_PLAYBOOK,
//   REGIS_LABEL_TIER,
//   REGIS_LABEL_SCORE_BAND,
//   scoreBand,
// extend the './imageRef' import with: parseImageRef

export function buildImageEntity(
  entry: IndexImageEntry,
  name: string,
  aliases: string[],
  opts: BuildOpts,
): Entity {
  const location = locationRef(opts.indexUrl);
  const parsed = parseImageRef(entry.imageRef);
  const shortRepo = parsed.repository.split('/').pop() ?? parsed.repository;
  const playbookRef = entry.playbook
    ? `resource:${opts.namespace}/${sanitizeName(entry.playbook)}`
    : undefined;

  const annotations: Record<string, string> = {
    [ANNOTATION_LOCATION]: location,
    [ANNOTATION_ORIGIN_LOCATION]: location,
    [REGIS_ANNOTATION_REPORT_URL]: entry.reportUrl,
    [REGIS_ANNOTATION_IMAGE_REF]: entry.imageRef,
  };
  if (entry.digest) annotations[REGIS_ANNOTATION_IMAGE_DIGEST] = entry.digest;
  if (aliases.length) {
    annotations[REGIS_ANNOTATION_IMAGE_ALIASES] = aliases.join(', ');
  }
  if (typeof entry.score === 'number') {
    annotations[REGIS_ANNOTATION_SCORE] = String(entry.score);
  }
  if (playbookRef) annotations[REGIS_ANNOTATION_PLAYBOOK] = playbookRef;

  const labels: Record<string, string> = {};
  if (entry.tier) labels[REGIS_LABEL_TIER] = sanitizeName(entry.tier);
  if (typeof entry.score === 'number') {
    labels[REGIS_LABEL_SCORE_BAND] = scoreBand(entry.score);
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
      name,
      namespace: opts.namespace,
      title: parsed.tag ? `${shortRepo}:${parsed.tag}` : shortRepo,
      description: `Container image ${entry.imageRef}`,
      ...(Object.keys(labels).length ? { labels } : {}),
      annotations,
    },
    spec: {
      type: REGIS_RESOURCE_TYPE_IMAGE,
      owner: entry.owner ?? opts.defaultOwner,
      ...(entry.system ? { system: entry.system } : {}),
      ...(playbookRef ? { dependsOn: [playbookRef] } : {}),
    },
  };
}
```

> Note: `REGIS_ANNOTATION_SNAPSHOT_DATE` and `REGIS_ANNOTATION_REGIS_VERSION` are imported for use when the index later carries those fields; they are part of the vocabulary surface. They are not set from the current index entry shape (snapshot date / regis version live in the report, fetched on demand by the tab). Leaving them unset here is intentional — the image entity carries pointers + the queryable summary only.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/buildEntities.ts plugins/regis-backend/src/provider/buildEntities.test.ts
git commit -m "feat(regis-backend): build container-image Resource from index entry"
```

---

## Task 9: regis-backend — orchestrate the full entity set

**Files:**
- Modify: `plugins/regis-backend/src/provider/buildEntities.ts`
- Modify: `plugins/regis-backend/src/provider/buildEntities.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `plugins/regis-backend/src/provider/buildEntities.test.ts`:

```typescript
import type { ReportIndex } from '@regis/backstage-plugin-regis-common';
import { buildEntities } from './buildEntities';

describe('buildEntities', () => {
  const index: ReportIndex = {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
    images: [
      {
        imageRef: 'registry-1.docker.io/library/nginx:1.27',
        digest: 'sha256:aaa',
        reportUrl: 'https://h/a.json',
        tier: 'Gold',
        score: 100,
        playbook: 'default',
      },
      {
        imageRef: 'registry-1.docker.io/library/nginx:latest',
        digest: 'sha256:aaa',
        reportUrl: 'https://h/b.json',
        tier: 'Gold',
        score: 100,
        playbook: 'default',
      },
    ],
  };

  it('emits one playbook + one image per entry, with aliases cross-linked', () => {
    const entities = buildEntities(index, opts);
    expect(entities).toHaveLength(3); // 1 playbook + 2 images

    const names = entities.map(e => `${e.kind}:${e.metadata.name}`);
    expect(names).toEqual([
      'Resource:default',
      'Resource:library-nginx-1.27',
      'Resource:library-nginx-latest',
    ]);

    const first = entities.find(e => e.metadata.name === 'library-nginx-1.27')!;
    expect(first.metadata.annotations?.['regis.io/image-aliases']).toBe(
      'registry-1.docker.io/library/nginx:latest',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: FAIL — `buildEntities` not exported.

- [ ] **Step 3: Implement buildEntities**

Append to `plugins/regis-backend/src/provider/buildEntities.ts` (extend the common import with `ReportIndex`, and the `./imageRef` import with `imageEntityName`):

```typescript
export function buildEntities(index: ReportIndex, opts: BuildOpts): Entity[] {
  const entities: Entity[] = [];

  for (const playbook of index.playbooks ?? []) {
    entities.push(buildPlaybookEntity(playbook, opts));
  }

  const aliasMap = groupAliasesByDigest(index.images);
  const taken = new Set<string>();
  for (const image of index.images) {
    const { repository, tag } = parseImageRef(image.imageRef);
    const name = imageEntityName(repository, tag, image.imageRef, taken);
    entities.push(
      buildImageEntity(image, name, aliasMap.get(image.imageRef) ?? [], opts),
    );
  }

  return entities;
}
```

- [ ] **Step 4: Run the full builder test suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/buildEntities.test.ts`
Expected: PASS — all builder tests green.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/buildEntities.ts plugins/regis-backend/src/provider/buildEntities.test.ts
git commit -m "feat(regis-backend): orchestrate full entity set from the index"
```

---

## Task 10: regis-backend — the entity provider

**Files:**
- Create: `plugins/regis-backend/src/provider/RegisEntityProvider.ts`
- Test: `plugins/regis-backend/src/provider/RegisEntityProvider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/RegisEntityProvider.test.ts`:

```typescript
import { mockServices } from '@backstage/backend-test-utils';
import type {
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type { SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { RegisEntityProvider } from './RegisEntityProvider';

const validIndex = {
  schemaVersion: 1,
  playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
  images: [
    {
      imageRef: 'registry-1.docker.io/library/nginx:1.27',
      digest: 'sha256:aaa',
      reportUrl: 'https://h/a.json',
      tier: 'Gold',
      score: 100,
      playbook: 'default',
    },
  ],
};

function makeProvider(fetchResult: unknown) {
  const connection: jest.Mocked<EntityProviderConnection> = {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  // A task runner that runs the task immediately when connect() schedules it.
  const taskRunner: SchedulerServiceTaskRunner = {
    run: async task => {
      await task.fn(undefined as any);
    },
  };
  const provider = new RegisEntityProvider({
    indexUrl: 'https://h/index.json',
    source: { fetch: jest.fn().mockResolvedValue(fetchResult) },
    taskRunner,
    logger: mockServices.logger.mock(),
    defaultOwner: 'group:default/guests',
    namespace: 'default',
  });
  return { provider, connection };
}

describe('RegisEntityProvider', () => {
  it('has a stable provider name', () => {
    const { provider } = makeProvider(validIndex);
    expect(provider.getProviderName()).toBe('regis-entity-provider');
  });

  it('applies a full mutation of built entities on connect/run', async () => {
    const { provider, connection } = makeProvider(validIndex);
    await provider.connect(connection);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities).toHaveLength(2); // 1 playbook + 1 image
    expect(arg.entities[0].locationKey).toBe(
      'regis-provider:https://h/index.json',
    );
    const kinds = arg.entities.map((e: any) => e.entity.metadata.name);
    expect(kinds).toEqual(['default', 'library-nginx-1.27']);
  });

  it('throws a validation error for an unsupported index version', async () => {
    const { provider, connection } = makeProvider({
      schemaVersion: 999,
      images: [],
    });
    await expect(provider.connect(connection)).rejects.toThrow(
      /schemaVersion 999/,
    );
    expect(connection.applyMutation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/RegisEntityProvider.test.ts`
Expected: FAIL — `Cannot find module './RegisEntityProvider'`.

- [ ] **Step 3: Implement the provider**

Create `plugins/regis-backend/src/provider/RegisEntityProvider.ts`:

```typescript
import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { validateReportIndex } from '@regis/backstage-plugin-regis-common';
import { ReportSource } from '../service/ReportSource';
import { buildEntities, BuildOpts } from './buildEntities';

export interface RegisEntityProviderOptions {
  indexUrl: string;
  source: ReportSource;
  taskRunner: SchedulerServiceTaskRunner;
  logger: LoggerService;
  defaultOwner: string;
  namespace: string;
}

/**
 * Mints `Resource` entities (container-image + regis-playbook) from a published
 * Regis report index. Owns the entities it provides (full mutation): images that
 * leave the index are removed from the catalog.
 */
export class RegisEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(private readonly options: RegisEntityProviderOptions) {}

  getProviderName(): string {
    return 'regis-entity-provider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.options.taskRunner.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error('RegisEntityProvider is not connected');
    }
    const { indexUrl, source, logger, defaultOwner, namespace } = this.options;

    const raw = await source.fetch(indexUrl);
    const index = validateReportIndex(raw);

    const opts: BuildOpts = { indexUrl, defaultOwner, namespace };
    const entities = buildEntities(index, opts);
    const locationKey = `regis-provider:${indexUrl}`;

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({ entity, locationKey })),
    });

    logger.info(
      `regis: provided ${entities.length} entities from ${indexUrl}`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/provider/RegisEntityProvider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/RegisEntityProvider.ts plugins/regis-backend/src/provider/RegisEntityProvider.test.ts
git commit -m "feat(regis-backend): add RegisEntityProvider (full mutation)"
```

---

## Task 11: regis-backend — catalog backend module + export

**Files:**
- Create: `plugins/regis-backend/src/module.ts`
- Test: `plugins/regis-backend/src/module.test.ts`
- Modify: `plugins/regis-backend/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/module.test.ts`:

```typescript
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModuleRegisEntityProvider } from './module';

describe('catalogModuleRegisEntityProvider', () => {
  it('registers an entity provider when indexUrl is configured', async () => {
    const addEntityProvider = jest.fn();
    await startTestBackend({
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({
          data: {
            regis: { catalog: { indexUrl: 'https://h/index.json' } },
          },
        }),
        // Provide a stub catalog processing extension point to capture the registration.
        createExtensionPointStub(catalogProcessingExtensionPoint, {
          addEntityProvider,
        }),
      ],
    });
    expect(addEntityProvider).toHaveBeenCalledTimes(1);
  });

  it('stays disabled when no indexUrl is configured', async () => {
    const addEntityProvider = jest.fn();
    await startTestBackend({
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({ data: {} }),
        createExtensionPointStub(catalogProcessingExtensionPoint, {
          addEntityProvider,
        }),
      ],
    });
    expect(addEntityProvider).not.toHaveBeenCalled();
  });
});

// Minimal helper to satisfy a module's extension-point dependency in tests.
function createExtensionPointStub<T>(ref: any, impl: T) {
  const { createServiceFactory } = require('@backstage/backend-plugin-api');
  return createServiceFactory({
    service: ref,
    deps: {},
    factory: () => impl,
  });
}
```

> If `createExtensionPointStub` does not resolve the extension point in your Backstage version (extension points and services register differently), fall back to a direct unit test: construct the module's init by calling `registerInit` indirectly is not exposed, so instead test the provider wiring via `RegisEntityProvider` (Task 10) and assert the module is exported and shaped correctly:
>
> ```typescript
> import { catalogModuleRegisEntityProvider } from './module';
> it('is a backend feature', () => {
>   expect(catalogModuleRegisEntityProvider).toBeDefined();
>   expect(typeof catalogModuleRegisEntityProvider).toBe('object');
> });
> ```
>
> Prefer the `startTestBackend` form; use the fallback only if the extension-point stub is incompatible with the installed `@backstage/backend-test-utils`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/module.test.ts`
Expected: FAIL — `Cannot find module './module'`.

- [ ] **Step 3: Implement the module**

Create `plugins/regis-backend/src/module.ts`:

```typescript
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { HttpReportSource } from './service/ReportSource';
import { RegisEntityProvider } from './provider/RegisEntityProvider';

/**
 * Registers the Regis entity provider with the catalog. Disabled (no-op) unless
 * `regis.catalog.indexUrl` is configured.
 */
export const catalogModuleRegisEntityProvider = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'regis-entity-provider',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ catalog, scheduler, config, logger }) {
        const indexUrl = config.getOptionalString('regis.catalog.indexUrl');
        if (!indexUrl) {
          logger.info(
            'regis: regis.catalog.indexUrl not set — entity provider disabled',
          );
          return;
        }
        const defaultOwner =
          config.getOptionalString('regis.catalog.defaultOwner') ??
          'group:default/guests';
        const namespace =
          config.getOptionalString('regis.catalog.namespace') ?? 'default';
        const refreshMinutes =
          config.getOptionalNumber('regis.catalog.refreshMinutes') ?? 30;

        const taskRunner = scheduler.createScheduledTaskRunner({
          frequency: { minutes: refreshMinutes },
          timeout: { minutes: 5 },
        });

        catalog.addEntityProvider(
          new RegisEntityProvider({
            indexUrl,
            source: new HttpReportSource(),
            taskRunner,
            logger,
            defaultOwner,
            namespace,
          }),
        );
        logger.info(`regis: entity provider registered for ${indexUrl}`);
      },
    });
  },
});
```

- [ ] **Step 4: Update the package exports**

Replace the contents of `plugins/regis-backend/src/index.ts` with:

```typescript
export { regisPlugin as default } from './plugin';
export { catalogModuleRegisEntityProvider } from './module';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test -- src/module.test.ts`
Expected: PASS. If the extension-point stub is incompatible, switch to the fallback test noted in Step 1 and re-run.

- [ ] **Step 6: Typecheck and run the whole backend suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test && yarn tsc`
Expected: PASS — all backend tests green, no type errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-backend/src/module.ts plugins/regis-backend/src/module.test.ts plugins/regis-backend/src/index.ts
git commit -m "feat(regis-backend): wire entity provider via catalog backend module"
```

---

## Task 12: demo wiring, config, example index, docs

**Files:**
- Modify: `packages/backend/src/index.ts`
- Modify: `app-config.yaml`
- Create: `examples/regis-index.json`
- Modify: `plugins/regis-backend/README.md`

- [ ] **Step 1: Add the module to the demo backend**

In `packages/backend/src/index.ts`, replace the regis registration block (currently the single line at the `// regis plugin (this repo)` comment) with:

```typescript
// regis plugin (this repo)
import { catalogModuleRegisEntityProvider } from '@regis/backstage-plugin-regis-backend';
backend.add(import('@regis/backstage-plugin-regis-backend'));
backend.add(catalogModuleRegisEntityProvider);
```

> The default export (`regisPlugin`) provides the report API; the named `catalogModuleRegisEntityProvider` registers the entity provider with the catalog. Place the `import` with the other imports at the top of the file if your linter requires imports-first (move the `import { catalogModuleRegisEntityProvider }` line up to sit beside `import { createBackend }`).

- [ ] **Step 2: Add the config section**

Append to `app-config.yaml` (top-level key):

```yaml
# Regis Backstage plugin configuration.
regis:
  # TTL (seconds) for the on-demand report cache used by the report API.
  cacheTtlSeconds: 1800
  # Phase 2 entity provider. Leave indexUrl unset to disable entity minting
  # (the Phase 1 report viewer still works via the regis.io/report-url annotation).
  catalog:
    # URL of a published Regis report index (see examples/regis-index.json for the shape).
    # indexUrl: https://trivoallan.github.io/regis/index.json
    # Owner assigned to minted Resources that don't carry their own owner.
    defaultOwner: group:default/guests
    # Namespace for minted entities.
    namespace: default
    # How often to re-read the index.
    refreshMinutes: 30
```

> `indexUrl` is left commented so local dev / CI does not attempt a network fetch. The provider logs "entity provider disabled" when it is unset. To see entities locally, host `examples/regis-index.json` over HTTP (e.g. GitHub Pages or a static server) and set `indexUrl` to that URL. `Resource` is already in the catalog `rules` allow-list (`app-config.yaml`), so minted entities are accepted.

- [ ] **Step 3: Add the example index**

Create `examples/regis-index.json`:

```json
{
  "schemaVersion": 1,
  "playbooks": [
    {
      "id": "default",
      "title": "Regis Default Playbook",
      "version": "1.0.0",
      "owner": "group:default/guests"
    }
  ],
  "images": [
    {
      "imageRef": "registry-1.docker.io/library/nginx:1.27",
      "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "reportUrl": "https://trivoallan.github.io/regis/reports/nginx-1.27/report.json",
      "tier": "Gold",
      "score": 100,
      "playbook": "default",
      "system": "nginx"
    },
    {
      "imageRef": "registry-1.docker.io/library/nginx:latest",
      "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "reportUrl": "https://trivoallan.github.io/regis/reports/nginx-latest/report.json",
      "tier": "Gold",
      "score": 100,
      "playbook": "default"
    }
  ]
}
```

- [ ] **Step 4: Document the provider in the backend README**

Append to `plugins/regis-backend/README.md`:

```markdown
## Entity provider (Phase 2)

The backend exposes `catalogModuleRegisEntityProvider`, a catalog module that mints
`Resource` entities from a published **report index**:

- `kind: Resource`, `spec.type: container-image` — one per analyzed image ref. Carries
  posture as queryable labels (`regis.io/tier`, `regis.io/score-band`) and annotation
  pointers (`regis.io/report-url`, `regis.io/image-ref`, `regis.io/image-digest`,
  `regis.io/image-aliases`, `regis.io/score`, `regis.io/playbook`). `dependsOn` the
  playbook Resource.
- `kind: Resource`, `spec.type: regis-playbook` — one per playbook (mapped from the
  regis v0.34.0 `kind: Playbook` envelope).

Aliases (tags sharing a digest) are grouped and cross-linked via `regis.io/image-aliases`.
The provider owns these entities (full mutation): images dropped from the index are removed.

### Configuration

```yaml
regis:
  catalog:
    indexUrl: https://your-host/regis/index.json # required to enable; unset = disabled
    defaultOwner: group:default/guests           # fallback owner for minted Resources
    namespace: default
    refreshMinutes: 30
```

Register it in your backend:

```ts
import { catalogModuleRegisEntityProvider } from '@regis/backstage-plugin-regis-backend';
backend.add(catalogModuleRegisEntityProvider);
```

See `examples/regis-index.json` for the index shape. The model is specified in
`docs/superpowers/specs/2026-06-01-regis-backstage-entity-model-design.md`.
```

- [ ] **Step 5: Typecheck and lint the touched packages**

Run: `yarn tsc && yarn workspace @regis/backstage-plugin-regis-backend lint`
Expected: PASS — no type errors, no lint errors.

- [ ] **Step 6: Manual verification (demo)**

1. Serve the example index over HTTP, e.g. from the repo root: `npx http-server examples -p 8080` (or any static server). The index is then at `http://localhost:8080/regis-index.json`.
2. In `app-config.yaml`, set `regis.catalog.indexUrl: http://localhost:8080/regis-index.json`.
3. Run the app: `yarn start`.
4. Open the catalog, filter `Kind = Resource`. Expect to see `library-nginx-1.27`, `library-nginx-latest`, and `default` (the playbook).
5. Open `library-nginx-1.27`. Verify: `regis.io/tier: gold` label, the `dependsOn` relation to the playbook in the Relations card, and the `regis.io/image-aliases` annotation listing `…/library/nginx:latest`.
6. Revert `indexUrl` to commented before committing if you don't want the demo to fetch by default.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/index.ts app-config.yaml examples/regis-index.json plugins/regis-backend/README.md
git commit -m "feat: wire Regis entity provider into the demo app + docs"
```

---

## Out of scope / follow-ups (not in this plan)

These are intentionally deferred (see the spec's "Non-goals & open questions"):

- **Frontend surfacing of minted entities.** The native `Resource` entity page renders the
  image/playbook out of the box. Extending the Regis tab/card `filter` so it also matches
  `spec.type: container-image` Resources, and a "images of this service" aggregate card on
  the consuming `Component`, are separate frontend tasks.
- **Optional `regis.io/aliasOf` custom relation.** v1 surfaces aliases via the
  `regis.io/image-aliases` annotation only; emitting a graph relation is deferred.
- **Phase 1 → Phase 2 annotation migration.** Moving `regis.io/report-url` off the
  consuming `Component` onto the minted image `Resource` (and de-duping display) is a
  coherence task once both surfaces coexist.
- **Persistent store / history & trends.** Belongs to the Phase 2 `ReportStore` (Knex), not
  the catalog.
- **Index contract sync.** If the regis core ever publishes its own index schema, add a
  drift-guarded sync (mirroring `scripts/sync-contract.ts`); for now the index schema is
  hand-authored in `regis-common`.

---

## Self-Review

**Spec coverage** (each spec section → task):
- Two new `Resource` entities (image/playbook) → Tasks 7, 8.
- Identity by ref + name derivation + 63-char/hash → Tasks 4, 5.
- Tag-as-alias / digest tracked / aliases linked by digest → Tasks 6, 8, 9.
- Posture: labels (`tier`, `score-band`) + annotation pointers; full report stays plugin data → Tasks 2, 8 (+ the "snapshot-date/regis-version unset" note).
- Relations: image `dependsOn` playbook; owner from entry→config fallback; optional system → Tasks 7, 8.
- v0.34.0 playbook envelope mapping (name/title/`app.kubernetes.io/version`, spec not copied) → Tasks 2, 7.
- Published report index contract (schemaVersion + validation, same discipline as report) → Task 1.
- Provider: full mutation, scheduler, `managed-by-origin`/location, disabled without indexUrl → Tasks 10, 11.
- Demo wiring + config + Resource allow-list confirmed → Task 12.
- `Report` stays a domain object (no catalog entity) → respected (no Report entity is built anywhere).

**Placeholder scan:** No `TODO`/`TBD`/"implement later" steps; every code step shows complete code; every run step has an expected result.

**Type consistency:** `BuildOpts` (indexUrl/defaultOwner/namespace) is defined in Task 7 and reused in Tasks 8, 9, 10. `RegisEntityProviderOptions` matches the `module.ts` construction in Task 11. `validateReportIndex`/`ReportIndex`/`IndexImageEntry`/`IndexPlaybookEntry` (Task 1) are consumed in Tasks 6–10. `scoreBand` and the `REGIS_*` constants (Task 2) are consumed in Task 8. `parseImageRef`/`sanitizeName`/`imageEntityName`/`shortHash` (Task 4) are consumed in Tasks 7–9. `ReportSource` is the existing Phase 1 interface (`fetch(url): Promise<unknown>`), reused unchanged.
