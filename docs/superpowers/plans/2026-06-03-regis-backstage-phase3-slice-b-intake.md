# Phase 3 Slice B — Scaffolder Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the intake front door — a Backstage Software Template that opens a PR adding one fragment file to a directory-based report index, so merging the PR mints a `container-image` Resource.

**Architecture:** The single `regis-index.json` becomes a directory `regis-index.d/` with `index.json` (schemaVersion + playbooks) and one `images/<slug>.json` per image. The `RegisEntityProvider` enumerates fragments (via `UrlReaderService.readTree` for SCM, or the local filesystem for `file://`), validates each, assembles a `ReportIndex` in memory, then reuses the existing `buildEntities` + full-mutation pipeline unchanged. A new `plugins/regis-scaffolder-backend` provides a `regis:index:add-entry` action; the template calls it then `publish:github:pull-request`.

**Tech Stack:** Backstage 1.51 new backend system (`createBackendModule`, `coreServices`, `scaffolderActionsExtensionPoint`), `@backstage/plugin-scaffolder-node` `createTemplateAction` (v2 zod schema), Ajv (`regis-common`), `@backstage/backend-test-utils` (`createMockDirectory`, `mockServices`, `startTestBackend`), `fs-extra`.

**Spec:** [`2026-06-03-regis-backstage-phase3-slice-b-intake-design.md`](../specs/2026-06-03-regis-backstage-phase3-slice-b-intake-design.md)

**Conventions:**
- Run a single test file: `yarn workspace <pkg> test <path> --watchAll=false`.
- Workspace names: `@regis/backstage-plugin-regis-common`, `@regis/backstage-plugin-regis-backend`, `@regis/backstage-plugin-regis-scaffolder-backend` (new).
- All `node_modules` live at the repo root (yarn workspaces). Run `yarn install` from the repo root after adding dependencies.

---

## File Structure

**`regis-common`** (foundation — slug + single-entry validation):
- Create `plugins/regis-common/src/slug.ts` — `slugForImageRef(imageRef)`.
- Create `plugins/regis-common/src/slug.test.ts`.
- Modify `plugins/regis-common/src/report-index.ts` — add `validateIndexImageEntry` + `IndexEntrySchemaError`.
- Modify `plugins/regis-common/src/report-index.test.ts` — cover the new validator.
- Modify `plugins/regis-common/src/index.ts` — export the new symbols.

**`regis-backend`** (provider reads fragments):
- Create `plugins/regis-backend/src/provider/IndexFragmentSource.ts` — interface + `FilesystemFragmentSource`.
- Create `plugins/regis-backend/src/provider/IndexFragmentSource.test.ts`.
- Create `plugins/regis-backend/src/provider/assembleIndex.ts` — assemble + per-fragment validate.
- Create `plugins/regis-backend/src/provider/assembleIndex.test.ts`.
- Create `plugins/regis-backend/src/provider/UrlReaderFragmentSource.ts` — wraps `urlReader.readTree`.
- Create `plugins/regis-backend/src/provider/UrlReaderFragmentSource.test.ts`.
- Modify `plugins/regis-backend/src/provider/RegisEntityProvider.ts` — `indexDirUrl` + `fragmentSource`.
- Modify `plugins/regis-backend/src/provider/RegisEntityProvider.test.ts`.
- Modify `plugins/regis-backend/src/module.ts` — config `indexDirUrl`, inject `urlReader`, pick source by scheme.
- Modify `plugins/regis-backend/src/module.test.ts`.
- Create `examples/regis-index.d/index.json` + `examples/regis-index.d/images/*.json`; delete `examples/regis-index.json`.
- Modify `app-config.yaml` — `indexUrl` → `indexDirUrl`.

**`regis-scaffolder-backend`** (new plugin — the action):
- Create `plugins/regis-scaffolder-backend/package.json`, `tsconfig.json`, `src/index.ts`.
- Create `plugins/regis-scaffolder-backend/src/actions/addEntry.ts` + `addEntry.test.ts`.
- Create `plugins/regis-scaffolder-backend/src/module.ts`.
- Modify `packages/backend/src/index.ts` — register the module.
- Modify `packages/backend/package.json` — depend on the new plugin.

**Template wiring:**
- Create `examples/intake/template.yaml`.
- Modify `app-config.yaml` — register the template `file:` location.

---

## Task 1: `slugForImageRef` in regis-common

**Files:**
- Create: `plugins/regis-common/src/slug.ts`
- Test: `plugins/regis-common/src/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-common/src/slug.test.ts`:

```ts
import { slugForImageRef } from './slug';

describe('slugForImageRef', () => {
  it('maps a full image ref to a filesystem-safe slug', () => {
    expect(slugForImageRef('registry-1.docker.io/library/nginx:1.27')).toBe(
      'registry-1.docker.io_library_nginx_1.27',
    );
  });

  it('preserves the allowed charset [A-Za-z0-9._-] including case', () => {
    expect(slugForImageRef('ghcr.io/Shop/Storefront-Web:2.3.0')).toBe(
      'ghcr.io_Shop_Storefront-Web_2.3.0',
    );
  });

  it('replaces digests and every other separator with underscore', () => {
    expect(
      slugForImageRef('repo/app@sha256:abc123'),
    ).toBe('repo_app_sha256_abc123');
  });

  it('is deterministic', () => {
    const ref = 'registry-1.docker.io/library/nginx:1.27';
    expect(slugForImageRef(ref)).toBe(slugForImageRef(ref));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test src/slug.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-common/src/slug.ts`:

```ts
/**
 * Deterministic, filesystem-safe slug for an image reference. Maps every
 * character outside `[A-Za-z0-9._-]` to `_`. Used for the intake fragment
 * filename AND for deriving the report URL, so the two stay consistent.
 *
 * Example: `registry-1.docker.io/library/nginx:1.27`
 *       -> `registry-1.docker.io_library_nginx_1.27`
 */
export function slugForImageRef(imageRef: string): string {
  return imageRef.replace(/[^A-Za-z0-9._-]/g, '_');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test src/slug.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-common/src/slug.ts plugins/regis-common/src/slug.test.ts
git commit -m "feat(regis-common): slugForImageRef for intake fragment filenames"
```

---

## Task 2: `validateIndexImageEntry` in regis-common

**Files:**
- Modify: `plugins/regis-common/src/report-index.ts`
- Modify: `plugins/regis-common/src/report-index.test.ts`
- Modify: `plugins/regis-common/src/index.ts`

Background: `report-index.ts` already compiles the whole-index schema with a shared `ajv` instance and an `ajvMessage(errors)` helper. The image-entry subschema is `schema.properties.images.items` (a self-contained object schema, no `$ref`), so it can be compiled directly.

- [ ] **Step 1: Write the failing test**

Add to `plugins/regis-common/src/report-index.test.ts` (new `describe` block at the end of the file, and extend the import at the top):

Change the top import from:

```ts
import {
  validateReportIndex,
  IndexSchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
```

to:

```ts
import {
  validateReportIndex,
  validateIndexImageEntry,
  IndexSchemaError,
  IndexEntrySchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
```

Append this block to the file:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-common test src/report-index.test.ts --watchAll=false`
Expected: FAIL — `validateIndexImageEntry` / `IndexEntrySchemaError` are not exported.

- [ ] **Step 3: Write the implementation**

In `plugins/regis-common/src/report-index.ts`, after the existing `IndexSchemaError` class, add the new error class:

```ts
/** Thrown when a single image entry does not match the entry schema. */
export class IndexEntrySchemaError extends Error {
  constructor(public readonly errors: ErrorObject[]) {
    super(`index image entry failed schema validation: ${ajvMessage(errors)}`);
    this.name = 'IndexEntrySchemaError';
  }
}
```

After the existing `const validateSchema = ajv.compile<ReportIndex>(schema as object);` line, add a compiled validator for the entry subschema:

```ts
const validateEntrySchema = ajv.compile<IndexImageEntry>(
  (schema as { properties: { images: { items: object } } }).properties.images
    .items,
);
```

After the existing `validateReportIndex` function, add:

```ts
/** Validates a single raw image entry against the index entry contract. */
export function validateIndexImageEntry(input: unknown): IndexImageEntry {
  if (!validateEntrySchema(input)) {
    throw new IndexEntrySchemaError(validateEntrySchema.errors ?? []);
  }
  return input as IndexImageEntry;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-common test src/report-index.test.ts --watchAll=false`
Expected: PASS (original tests + 5 new).

- [ ] **Step 5: Export the new symbols**

In `plugins/regis-common/src/index.ts`, change the `report-index` export block from:

```ts
export {
  validateReportIndex,
  IndexSchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
```

to:

```ts
export {
  validateReportIndex,
  validateIndexImageEntry,
  IndexSchemaError,
  IndexEntrySchemaError,
  UnsupportedIndexSchemaVersionError,
  SUPPORTED_INDEX_SCHEMA_VERSION,
} from './report-index';
export { slugForImageRef } from './slug';
```

- [ ] **Step 6: Run the whole package test suite**

Run: `yarn workspace @regis/backstage-plugin-regis-common test --watchAll=false`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add plugins/regis-common/src/report-index.ts plugins/regis-common/src/report-index.test.ts plugins/regis-common/src/index.ts
git commit -m "feat(regis-common): validateIndexImageEntry + export slug/entry symbols"
```

---

## Task 3: `IndexFragmentSource` + `FilesystemFragmentSource`

**Files:**
- Create: `plugins/regis-backend/src/provider/IndexFragmentSource.ts`
- Test: `plugins/regis-backend/src/provider/IndexFragmentSource.test.ts`

This introduces the enumeration abstraction and the local-filesystem implementation (used by the bundled demo, which serves `examples/` from disk). Paths in the returned fragments are **relative to the index directory**, matching what `readTree` yields.

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/IndexFragmentSource.test.ts`:

```ts
import { createMockDirectory } from '@backstage/backend-test-utils';
import { pathToFileURL } from 'url';
import { FilesystemFragmentSource } from './IndexFragmentSource';

describe('FilesystemFragmentSource', () => {
  const mockDir = createMockDirectory();
  afterEach(() => mockDir.clear());

  it('lists every .json file with a path relative to the index dir', async () => {
    mockDir.setContent({
      'regis-index.d': {
        'index.json': JSON.stringify({ schemaVersion: 1, playbooks: [] }),
        images: {
          'a.json': JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }),
          'b.json': JSON.stringify({ imageRef: 'r/b:1', reportUrl: 'u' }),
        },
      },
    });
    const dirUrl = pathToFileURL(mockDir.resolve('regis-index.d')).href;

    const source = new FilesystemFragmentSource();
    const fragments = await source.list(dirUrl);

    const byPath = Object.fromEntries(
      fragments.map(f => [f.path.replace(/\\/g, '/'), f.content]),
    );
    expect(Object.keys(byPath).sort()).toEqual([
      'images/a.json',
      'images/b.json',
      'index.json',
    ]);
    expect((byPath['images/a.json'] as any).imageRef).toBe('r/a:1');
  });

  it('ignores non-json files', async () => {
    mockDir.setContent({
      'regis-index.d': {
        'index.json': JSON.stringify({ schemaVersion: 1 }),
        'README.md': '# not an entry',
        images: { 'a.json': JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }) },
      },
    });
    const dirUrl = pathToFileURL(mockDir.resolve('regis-index.d')).href;

    const fragments = await new FilesystemFragmentSource().list(dirUrl);
    const paths = fragments.map(f => f.path.replace(/\\/g, '/')).sort();
    expect(paths).toEqual(['images/a.json', 'index.json']);
  });

  it('throws a clear error when the dir url is not a file:// url', async () => {
    await expect(
      new FilesystemFragmentSource().list('https://example.test/regis-index.d'),
    ).rejects.toThrow(/file:\/\//);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/IndexFragmentSource.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module './IndexFragmentSource'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/provider/IndexFragmentSource.ts`:

```ts
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { join, relative, sep } from 'path';

/** One file under the index directory; `path` is relative to that directory. */
export interface IndexFragment {
  path: string;
  content: unknown;
}

/** Enumerates the JSON fragment files that make up a directory-based index. */
export interface IndexFragmentSource {
  list(indexDirUrl: string): Promise<IndexFragment[]>;
}

async function walkJson(root: string, dir: string): Promise<IndexFragment[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: IndexFragment[] = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJson(root, abs)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const raw = await fs.readFile(abs, 'utf8');
      out.push({
        path: relative(root, abs).split(sep).join('/'),
        content: JSON.parse(raw),
      });
    }
  }
  return out;
}

/**
 * Reads index fragments from a local directory addressed by a `file://` URL.
 * Used by the bundled demo (which serves `examples/` from disk).
 */
export class FilesystemFragmentSource implements IndexFragmentSource {
  async list(indexDirUrl: string): Promise<IndexFragment[]> {
    if (!indexDirUrl.startsWith('file://')) {
      throw new Error(
        `FilesystemFragmentSource requires a file:// url, got ${indexDirUrl}`,
      );
    }
    const root = fileURLToPath(indexDirUrl);
    return walkJson(root, root);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/IndexFragmentSource.test.ts --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/IndexFragmentSource.ts plugins/regis-backend/src/provider/IndexFragmentSource.test.ts
git commit -m "feat(regis-backend): IndexFragmentSource + filesystem implementation"
```

---

## Task 4: `assembleIndex` (assemble + per-fragment validate)

**Files:**
- Create: `plugins/regis-backend/src/provider/assembleIndex.ts`
- Test: `plugins/regis-backend/src/provider/assembleIndex.test.ts`

Takes the raw fragments, reads `index.json` for `schemaVersion` + `playbooks`, validates each `images/*.json` with `validateIndexImageEntry` (**skips + warns** on an invalid fragment so one bad merged file can't blank the catalog), then validates the assembled whole with `validateReportIndex`.

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/assembleIndex.test.ts`:

```ts
import { mockServices } from '@backstage/backend-test-utils';
import { assembleIndex } from './assembleIndex';
import type { IndexFragment } from './IndexFragmentSource';

const base: IndexFragment = {
  path: 'index.json',
  content: {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default' }],
  },
};

function image(name: string, content: unknown): IndexFragment {
  return { path: `images/${name}.json`, content };
}

describe('assembleIndex', () => {
  it('assembles schemaVersion + playbooks + valid image entries', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [
        base,
        image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' }),
        image('b', { imageRef: 'r/b:1', reportUrl: 'https://x/b.json' }),
      ],
      logger,
    );

    expect(index.schemaVersion).toBe(1);
    expect(index.playbooks).toHaveLength(1);
    expect(index.images.map(i => i.imageRef).sort()).toEqual([
      'r/a:1',
      'r/b:1',
    ]);
  });

  it('skips an invalid fragment and warns, keeping the rest', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [
        base,
        image('good', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' }),
        image('bad', { digest: 'sha256:abc' }), // missing imageRef + reportUrl
      ],
      logger,
    );

    expect(index.images.map(i => i.imageRef)).toEqual(['r/a:1']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('images/bad.json'),
    );
  });

  it('ignores files outside images/ (e.g. the base index.json)', () => {
    const logger = mockServices.logger.mock();
    const index = assembleIndex(
      [base, image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' })],
      logger,
    );
    expect(index.images).toHaveLength(1);
  });

  it('throws when index.json is missing', () => {
    const logger = mockServices.logger.mock();
    expect(() =>
      assembleIndex(
        [image('a', { imageRef: 'r/a:1', reportUrl: 'https://x/a.json' })],
        logger,
      ),
    ).toThrow(/index\.json/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/assembleIndex.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module './assembleIndex'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/provider/assembleIndex.ts`:

```ts
import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  validateIndexImageEntry,
  validateReportIndex,
  type IndexImageEntry,
  type IndexPlaybookEntry,
  type ReportIndex,
} from '@regis/backstage-plugin-regis-common';
import type { IndexFragment } from './IndexFragmentSource';

function norm(path: string): string {
  return path.replace(/^\.?\//, '');
}

interface BaseDoc {
  schemaVersion?: number;
  playbooks?: IndexPlaybookEntry[];
}

/**
 * Assembles a `ReportIndex` from raw fragments. `index.json` supplies
 * `schemaVersion` + `playbooks`; every `images/*.json` is a single image entry.
 * Invalid image fragments are skipped with a warning (resilience: a single bad
 * merged file must not blank the whole catalog). The assembled index is then
 * validated as a whole.
 */
export function assembleIndex(
  fragments: IndexFragment[],
  logger: LoggerService,
): ReportIndex {
  const baseFragment = fragments.find(f => norm(f.path) === 'index.json');
  if (!baseFragment) {
    throw new Error(
      'index.json (schemaVersion + playbooks) not found in index directory',
    );
  }
  const base = baseFragment.content as BaseDoc;

  const images: IndexImageEntry[] = [];
  for (const fragment of fragments) {
    const path = norm(fragment.path);
    if (!path.startsWith('images/') || !path.endsWith('.json')) continue;
    try {
      images.push(validateIndexImageEntry(fragment.content));
    } catch (err) {
      logger.warn(
        `regis: skipping invalid index fragment ${fragment.path}: ${String(
          err,
        )}`,
      );
    }
  }

  return validateReportIndex({
    schemaVersion: base.schemaVersion,
    playbooks: base.playbooks,
    images,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/assembleIndex.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/assembleIndex.ts plugins/regis-backend/src/provider/assembleIndex.test.ts
git commit -m "feat(regis-backend): assembleIndex (fragments -> ReportIndex, skip-invalid)"
```

---

## Task 5: `UrlReaderFragmentSource` (SCM enumeration via readTree)

**Files:**
- Create: `plugins/regis-backend/src/provider/UrlReaderFragmentSource.ts`
- Test: `plugins/regis-backend/src/provider/UrlReaderFragmentSource.test.ts`

Wraps `UrlReaderService.readTree(dirUrl)`. The response exposes `files()` → `{ path, content(): Promise<Buffer> }`; we JSON-parse each `.json` file's buffer.

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/provider/UrlReaderFragmentSource.test.ts`:

```ts
import type { UrlReaderService } from '@backstage/backend-plugin-api';
import { UrlReaderFragmentSource } from './UrlReaderFragmentSource';

function fakeReader(files: Array<{ path: string; content: string }>): UrlReaderService {
  return {
    readUrl: jest.fn(),
    readTree: jest.fn().mockResolvedValue({
      etag: 'etag',
      files: async () =>
        files.map(f => ({
          path: f.path,
          content: async () => Buffer.from(f.content, 'utf8'),
        })),
      archive: jest.fn(),
      dir: jest.fn(),
    }),
    search: jest.fn(),
  } as unknown as UrlReaderService;
}

describe('UrlReaderFragmentSource', () => {
  it('reads each .json file in the tree and parses its content', async () => {
    const reader = fakeReader([
      { path: 'index.json', content: JSON.stringify({ schemaVersion: 1 }) },
      {
        path: 'images/a.json',
        content: JSON.stringify({ imageRef: 'r/a:1', reportUrl: 'u' }),
      },
    ]);
    const source = new UrlReaderFragmentSource(reader);

    const fragments = await source.list('https://github.com/org/index/tree/main/regis-index.d');

    expect(reader.readTree).toHaveBeenCalledWith(
      'https://github.com/org/index/tree/main/regis-index.d',
    );
    const byPath = Object.fromEntries(fragments.map(f => [f.path, f.content]));
    expect(Object.keys(byPath).sort()).toEqual(['images/a.json', 'index.json']);
    expect((byPath['images/a.json'] as any).imageRef).toBe('r/a:1');
  });

  it('ignores non-json files in the tree', async () => {
    const reader = fakeReader([
      { path: 'index.json', content: JSON.stringify({ schemaVersion: 1 }) },
      { path: 'README.md', content: '# nope' },
    ]);
    const fragments = await new UrlReaderFragmentSource(reader).list('https://x/tree');
    expect(fragments.map(f => f.path)).toEqual(['index.json']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/UrlReaderFragmentSource.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module './UrlReaderFragmentSource'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/provider/UrlReaderFragmentSource.ts`:

```ts
import type { UrlReaderService } from '@backstage/backend-plugin-api';
import type { IndexFragment, IndexFragmentSource } from './IndexFragmentSource';

/**
 * Enumerates index fragments from a remote SCM directory using the Backstage
 * UrlReader. `indexDirUrl` is a repo tree URL (e.g. a GitHub `.../tree/main/...`
 * URL) backed by a configured integration.
 */
export class UrlReaderFragmentSource implements IndexFragmentSource {
  constructor(private readonly reader: UrlReaderService) {}

  async list(indexDirUrl: string): Promise<IndexFragment[]> {
    const tree = await this.reader.readTree(indexDirUrl);
    const files = await tree.files();
    const fragments: IndexFragment[] = [];
    for (const file of files) {
      if (!file.path.endsWith('.json')) continue;
      const buffer = await file.content();
      fragments.push({
        path: file.path,
        content: JSON.parse(buffer.toString('utf8')),
      });
    }
    return fragments;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/UrlReaderFragmentSource.test.ts --watchAll=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/provider/UrlReaderFragmentSource.ts plugins/regis-backend/src/provider/UrlReaderFragmentSource.test.ts
git commit -m "feat(regis-backend): UrlReaderFragmentSource (readTree enumeration)"
```

---

## Task 6: Refactor `RegisEntityProvider` to read fragments

**Files:**
- Modify: `plugins/regis-backend/src/provider/RegisEntityProvider.ts`
- Modify: `plugins/regis-backend/src/provider/RegisEntityProvider.test.ts`

The provider stops calling `fetchIndex(source, url)` and instead lists fragments via an `IndexFragmentSource`, assembles them with `assembleIndex`, then feeds the existing `buildEntities`. `buildEntities`/`BuildOpts` are **unchanged** — `opts.indexUrl` is only used to derive the `locationKey`, so we pass the directory URL as its value.

- [ ] **Step 1: Update the test to the new options shape**

Replace the whole body of `plugins/regis-backend/src/provider/RegisEntityProvider.test.ts` with:

```ts
import { mockServices } from '@backstage/backend-test-utils';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type { SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { RegisEntityProvider } from './RegisEntityProvider';
import type { IndexFragment } from './IndexFragmentSource';

const baseFragment: IndexFragment = {
  path: 'index.json',
  content: {
    schemaVersion: 1,
    playbooks: [{ id: 'default', title: 'Default', version: '1.0.0' }],
  },
};

const imageFragment: IndexFragment = {
  path: 'images/nginx.json',
  content: {
    imageRef: 'registry-1.docker.io/library/nginx:1.27',
    digest: 'sha256:aaa',
    reportUrl: 'https://h/a.json',
    tier: 'Gold',
    score: 100,
    playbook: 'default',
  },
};

function makeProvider(fragments: IndexFragment[]) {
  const connection = {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  const taskRunner: SchedulerServiceTaskRunner = {
    run: async task => {
      await task.fn(new AbortController().signal);
    },
  };
  const provider = new RegisEntityProvider({
    indexDirUrl: 'file:///tmp/regis-index.d',
    fragmentSource: { list: jest.fn().mockResolvedValue(fragments) },
    taskRunner,
    logger: mockServices.logger.mock(),
    defaultOwner: 'group:default/guests',
    namespace: 'default',
  });
  return { provider, connection };
}

describe('RegisEntityProvider', () => {
  it('has a stable provider name', () => {
    const { provider } = makeProvider([baseFragment, imageFragment]);
    expect(provider.getProviderName()).toBe('regis-entity-provider');
  });

  it('applies a full mutation of built entities on connect/run', async () => {
    const { provider, connection } = makeProvider([baseFragment, imageFragment]);
    await provider.connect(connection as unknown as EntityProviderConnection);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities).toHaveLength(2); // 1 playbook + 1 image
    expect(arg.entities[0].locationKey).toBe(
      'regis-provider:file:///tmp/regis-index.d',
    );
    const names = arg.entities.map((e: any) => e.entity.metadata.name);
    expect(names).toEqual(['default', 'library-nginx-1.27']);
  });

  it('removes entities when a fragment disappears (full mutation)', async () => {
    const { provider, connection } = makeProvider([baseFragment]); // no images
    await provider.connect(connection as unknown as EntityProviderConnection);
    const arg = connection.applyMutation.mock.calls[0][0] as any;
    expect(arg.type).toBe('full');
    expect(arg.entities.map((e: any) => e.entity.metadata.name)).toEqual([
      'default',
    ]);
  });

  it('throws if run() is called before connect()', async () => {
    const { provider } = makeProvider([baseFragment, imageFragment]);
    await expect(provider.run()).rejects.toThrow(/not connected/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/RegisEntityProvider.test.ts --watchAll=false`
Expected: FAIL — `RegisEntityProviderOptions` has no `indexDirUrl`/`fragmentSource`; type/compile errors.

- [ ] **Step 3: Rewrite the provider**

Replace the whole content of `plugins/regis-backend/src/provider/RegisEntityProvider.ts` with:

```ts
import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type { IndexFragmentSource } from './IndexFragmentSource';
import { assembleIndex } from './assembleIndex';
import { buildEntities, BuildOpts } from './buildEntities';

export interface RegisEntityProviderOptions {
  /** URL of the index *directory* (a repo tree URL, or a local file:// dir). */
  indexDirUrl: string;
  fragmentSource: IndexFragmentSource;
  taskRunner: SchedulerServiceTaskRunner;
  logger: LoggerService;
  defaultOwner: string;
  namespace: string;
}

/**
 * Mints `Resource` entities (container-image + regis-playbook) from a published
 * Regis report index, now stored as a directory of fragments. Owns the entities
 * it provides (full mutation): images whose fragment leaves the index directory
 * are removed from the catalog.
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
    const { indexDirUrl, fragmentSource, logger, defaultOwner, namespace } =
      this.options;

    const fragments = await fragmentSource.list(indexDirUrl);
    const index = assembleIndex(fragments, logger);

    // buildEntities uses opts.indexUrl only to derive the location key.
    const opts: BuildOpts = { indexUrl: indexDirUrl, defaultOwner, namespace };
    const entities = buildEntities(index, opts);
    const locationKey = `regis-provider:${indexDirUrl}`;

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({ entity, locationKey })),
    });

    logger.info(
      `regis: provided ${entities.length} entities from ${indexDirUrl}`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/provider/RegisEntityProvider.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Delete the now-unused `fetchIndex`**

`fetchIndex` was the single-file fetch path, fully replaced by `assembleIndex`. Remove it and its test:

```bash
git rm plugins/regis-backend/src/service/fetchIndex.ts plugins/regis-backend/src/service/fetchIndex.test.ts
```

Verify nothing else imports it:

Run: `grep -rn "fetchIndex" plugins/regis-backend/src`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/provider/RegisEntityProvider.ts plugins/regis-backend/src/provider/RegisEntityProvider.test.ts
git commit -m "refactor(regis-backend): provider reads fragment directory via IndexFragmentSource"
```

---

## Task 7: Rewire `module.ts` (config + urlReader + source selection)

**Files:**
- Modify: `plugins/regis-backend/src/module.ts`
- Modify: `plugins/regis-backend/src/module.test.ts`

Config key `regis.catalog.indexUrl` becomes `regis.catalog.indexDirUrl`. Inject `coreServices.urlReader`. Pick `FilesystemFragmentSource` for `file://` URLs, else `UrlReaderFragmentSource`.

- [ ] **Step 1: Update the test**

Replace the whole content of `plugins/regis-backend/src/module.test.ts` with:

```ts
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { catalogModuleRegisEntityProvider } from './module';

const stub = () => ({ addEntityProvider: jest.fn(), addProcessor: jest.fn() });

describe('catalogModuleRegisEntityProvider', () => {
  it('registers the alias processor and the provider when indexDirUrl is set', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({
          data: {
            regis: {
              catalog: {
                indexDirUrl: 'https://github.com/org/index/tree/main/regis-index.d',
              },
            },
          },
        }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).toHaveBeenCalledTimes(1);
  });

  it('registers the alias processor even when indexDirUrl is absent', async () => {
    const extensionPoint = stub();
    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleRegisEntityProvider,
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });
    expect(extensionPoint.addProcessor).toHaveBeenCalledTimes(1);
    expect(extensionPoint.addEntityProvider).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/module.test.ts --watchAll=false`
Expected: FAIL — provider still reads `indexUrl`, so the first test finds no provider registered.

- [ ] **Step 3: Rewrite the module**

Replace the whole content of `plugins/regis-backend/src/module.ts` with:

```ts
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { RegisEntityProvider } from './provider/RegisEntityProvider';
import {
  FilesystemFragmentSource,
  type IndexFragmentSource,
} from './provider/IndexFragmentSource';
import { UrlReaderFragmentSource } from './provider/UrlReaderFragmentSource';
import { RegisAliasRelationProcessor } from './processor/RegisAliasRelationProcessor';

/**
 * Registers the Regis entity provider with the catalog. Disabled (no-op) unless
 * `regis.catalog.indexDirUrl` is configured.
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
        urlReader: coreServices.urlReader,
      },
      async init({ catalog, scheduler, config, logger, urlReader }) {
        catalog.addProcessor(new RegisAliasRelationProcessor());

        const indexDirUrl = config.getOptionalString(
          'regis.catalog.indexDirUrl',
        );
        if (!indexDirUrl) {
          logger.info(
            'regis: regis.catalog.indexDirUrl not set — entity provider disabled (alias relations still active)',
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

        const fragmentSource: IndexFragmentSource = indexDirUrl.startsWith(
          'file://',
        )
          ? new FilesystemFragmentSource()
          : new UrlReaderFragmentSource(urlReader);

        catalog.addEntityProvider(
          new RegisEntityProvider({
            indexDirUrl,
            fragmentSource,
            taskRunner,
            logger,
            defaultOwner,
            namespace,
          }),
        );
        logger.info(`regis: entity provider registered for ${indexDirUrl}`);
      },
    });
  },
});
```

- [ ] **Step 4: Run the module test + the whole package suite**

Run: `yarn workspace @regis/backstage-plugin-regis-backend test src/module.test.ts --watchAll=false`
Expected: PASS (2 tests).

Run: `yarn workspace @regis/backstage-plugin-regis-backend test --watchAll=false`
Expected: PASS (all files; no stragglers referencing `fetchIndex` or the old options).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/module.ts plugins/regis-backend/src/module.test.ts
git commit -m "feat(regis-backend): wire indexDirUrl + fragment-source selection"
```

---

## Task 8: Restructure example data + app-config

**Files:**
- Create: `examples/regis-index.d/index.json`
- Create: `examples/regis-index.d/images/*.json` (7 files)
- Delete: `examples/regis-index.json`
- Modify: `app-config.yaml`

The existing `examples/regis-index.json` has a `playbooks` array + 7 image entries. Split it: `playbooks` → `index.d/index.json`; each image → `index.d/images/<slug>.json` where `<slug> = slugForImageRef(imageRef)`.

- [ ] **Step 1: Create the base file**

Create `examples/regis-index.d/index.json`:

```json
{
  "schemaVersion": 1,
  "playbooks": [
    {
      "id": "default",
      "title": "Regis Default Playbook",
      "version": "1.0.0",
      "owner": "team-platform"
    },
    {
      "id": "pci-dss",
      "title": "PCI-DSS Hardened Playbook",
      "version": "2.1.0",
      "owner": "team-payments"
    }
  ]
}
```

- [ ] **Step 2: Create one image fragment per entry**

Create these 7 files (filename = `slugForImageRef(imageRef)`):

`examples/regis-index.d/images/ghcr.io_shop_storefront-web_2.3.0.json`:

```json
{
  "imageRef": "ghcr.io/shop/storefront-web:2.3.0",
  "digest": "sha256:a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
  "reportUrl": "http://localhost:8080/reports/storefront-web.json",
  "tier": "Gold",
  "score": 100,
  "playbook": "default",
  "owner": "group:default/team-storefront",
  "system": "shop"
}
```

`examples/regis-index.d/images/ghcr.io_shop_catalog-api_4.1.0.json`:

```json
{
  "imageRef": "ghcr.io/shop/catalog-api:4.1.0",
  "digest": "sha256:b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
  "reportUrl": "http://localhost:8080/reports/catalog-api.json",
  "tier": "Gold",
  "score": 95,
  "playbook": "default",
  "owner": "group:default/team-search",
  "system": "shop"
}
```

`examples/regis-index.d/images/ghcr.io_shop_checkout-api_1.8.2.json`:

```json
{
  "imageRef": "ghcr.io/shop/checkout-api:1.8.2",
  "digest": "sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
  "reportUrl": "http://localhost:8080/reports/checkout-api.json",
  "tier": "Silver",
  "score": 82,
  "playbook": "default",
  "owner": "group:default/team-payments",
  "system": "shop"
}
```

`examples/regis-index.d/images/ghcr.io_shop_payments-gateway_3.0.1.json`:

```json
{
  "imageRef": "ghcr.io/shop/payments-gateway:3.0.1",
  "digest": "sha256:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
  "reportUrl": "http://localhost:8080/reports/payments-gateway.json",
  "tier": "Silver",
  "score": 78,
  "playbook": "pci-dss",
  "owner": "group:default/team-payments",
  "system": "shop"
}
```

`examples/regis-index.d/images/ghcr.io_shop_search_8.12.0.json`:

```json
{
  "imageRef": "ghcr.io/shop/search:8.12.0",
  "digest": "sha256:e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
  "reportUrl": "http://localhost:8080/reports/search.json",
  "tier": "Bronze",
  "score": 64,
  "playbook": "default",
  "owner": "group:default/team-search",
  "system": "shop"
}
```

`examples/regis-index.d/images/registry-1.docker.io_library_nginx_1.27.json`:

```json
{
  "imageRef": "registry-1.docker.io/library/nginx:1.27",
  "digest": "sha256:f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6",
  "reportUrl": "http://localhost:8080/reports/nginx.json",
  "tier": "Gold",
  "score": 100,
  "playbook": "default",
  "owner": "group:default/team-platform",
  "system": "shop"
}
```

`examples/regis-index.d/images/registry-1.docker.io_library_nginx_latest.json`:

```json
{
  "imageRef": "registry-1.docker.io/library/nginx:latest",
  "digest": "sha256:f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6",
  "reportUrl": "http://localhost:8080/reports/nginx.json",
  "tier": "Gold",
  "score": 100,
  "playbook": "default",
  "owner": "group:default/team-platform",
  "system": "shop"
}
```

- [ ] **Step 3: Delete the old single-file index**

```bash
git rm examples/regis-index.json
```

- [ ] **Step 4: Update `app-config.yaml`**

In `app-config.yaml`, replace the `catalog:` comment block under `regis:` (the lines documenting `indexUrl`) so the key is `indexDirUrl` pointing at the local directory. Change:

```yaml
  catalog:
    # URL of a published Regis report index (see examples/regis-index.json for the shape).
    # For the bundled demo dataset, serve it locally: npx http-server examples -p 8080
    # indexUrl: http://localhost:8080/regis-index.json
```

to:

```yaml
  catalog:
    # URL of the published Regis report index *directory* (fragments: index.json
    # + images/<slug>.json — see examples/regis-index.d for the shape).
    # For the bundled demo dataset, read it from disk:
    # indexDirUrl: file://${PWD}/examples/regis-index.d
    # For a real deployment, point at a repo tree URL (GitHub integration):
    # indexDirUrl: https://github.com/your-org/regis-index/tree/main/regis-index.d
```

(The key stays commented out → provider disabled by default, same as before.)

- [ ] **Step 5: Verify the example data assembles**

Run the backend package suite (the provider/assemble tests already cover assembly logic; this confirms nothing else referenced the deleted file):

Run: `grep -rn "regis-index.json" plugins packages app-config.yaml`
Expected: no matches (only `regis-index.d` references remain, if any).

- [ ] **Step 6: Commit**

```bash
git add examples/regis-index.d app-config.yaml
git commit -m "feat: migrate example index to fragment directory (regis-index.d)"
```

---

## Task 9: Scaffold `regis-scaffolder-backend` plugin

**Files:**
- Create: `plugins/regis-scaffolder-backend/package.json`
- Create: `plugins/regis-scaffolder-backend/tsconfig.json`
- Create: `plugins/regis-scaffolder-backend/src/index.ts`

This stands up an empty-but-buildable backend plugin package so later tasks have a home for the action + module. Mirror `plugins/regis-backend` conventions.

- [ ] **Step 1: Create `package.json`**

Create `plugins/regis-scaffolder-backend/package.json`:

```json
{
  "name": "@regis/backstage-plugin-regis-scaffolder-backend",
  "version": "0.1.0",
  "description": "Scaffolder actions for Regis intake (image onboarding -> index PR).",
  "license": "Apache-2.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.cjs.js",
    "types": "dist/index.d.ts"
  },
  "backstage": {
    "role": "backend-plugin-module",
    "pluginId": "scaffolder",
    "pluginPackage": "@backstage/plugin-scaffolder-backend"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean",
    "prepack": "backstage-cli package prepack",
    "postpack": "backstage-cli package postpack"
  },
  "dependencies": {
    "@backstage/backend-plugin-api": "^1.9.1",
    "@backstage/plugin-scaffolder-node": "^0.13.3",
    "@regis/backstage-plugin-regis-common": "^0.1.0",
    "fs-extra": "^11.2.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@backstage/backend-test-utils": "^1.7.0",
    "@types/fs-extra": "^11.0.4"
  },
  "files": [
    "dist"
  ]
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Create `plugins/regis-scaffolder-backend/tsconfig.json` (mirror `plugins/regis-backend/tsconfig.json`):

```json
{
  "extends": "@backstage/cli/config/tsconfig.json",
  "include": ["src", "dev", "migrations"],
  "exclude": ["node_modules"],
  "compilerOptions": {
    "outDir": "../../dist-types/plugins/regis-scaffolder-backend",
    "rootDir": "."
  }
}
```

(If `plugins/regis-backend/tsconfig.json` differs, copy that one verbatim and only change the `outDir` path segment to `regis-scaffolder-backend`.)

- [ ] **Step 3: Create a placeholder `src/index.ts`**

Create `plugins/regis-scaffolder-backend/src/index.ts`:

```ts
/**
 * Scaffolder actions for Regis intake.
 *
 * @packageDocumentation
 */

export { scaffolderModuleRegisIntake as default } from './module';
```

(The `./module` import resolves in Task 11; create the file there. For now this will not compile alone — that's fine, it is completed together with Tasks 10–11 before the package suite is run.)

- [ ] **Step 4: Install dependencies**

Run from the repo root: `yarn install`
Expected: resolves `@backstage/plugin-scaffolder-node`, `fs-extra`, `zod`, `@types/fs-extra` into the workspace.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-scaffolder-backend/package.json plugins/regis-scaffolder-backend/tsconfig.json plugins/regis-scaffolder-backend/src/index.ts yarn.lock
git commit -m "chore(regis-scaffolder-backend): scaffold plugin package"
```

---

## Task 10: `regis:index:add-entry` action

**Files:**
- Create: `plugins/regis-scaffolder-backend/src/actions/addEntry.ts`
- Test: `plugins/regis-scaffolder-backend/src/actions/addEntry.test.ts`

The action derives the slug + `reportUrl`, enforces the third-party owner rule, validates the entry with `validateIndexImageEntry`, and writes `${indexDirPath}/images/<slug>.json` into the scaffolder workspace. The test builds an `ActionContext` by hand over a real temp dir (`createMockDirectory`).

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-scaffolder-backend/src/actions/addEntry.test.ts`:

```ts
import { createMockDirectory, mockServices } from '@backstage/backend-test-utils';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createAddEntryAction } from './addEntry';

function makeContext(input: Record<string, unknown>, workspacePath: string) {
  return {
    input,
    workspacePath,
    logger: mockServices.logger.mock(),
    output: jest.fn(),
    async getInitiatorCredentials() {
      return mockServices.credentials.user();
    },
    async createTemporaryDirectory() {
      return workspacePath;
    },
    checkpoint: jest.fn(),
  } as any;
}

describe('regis:index:add-entry', () => {
  const mockDir = createMockDirectory();
  afterEach(() => mockDir.clear());

  it('writes a valid first-party fragment with a derived reportUrl', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'ghcr.io/shop/storefront-web:2.3.0',
        type: 'first-party',
        system: 'shop',
        playbook: 'default',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await action.handler(ctx);

    const written = JSON.parse(
      await fs.readFile(
        join(
          ws,
          'examples/regis-index.d/images/ghcr.io_shop_storefront-web_2.3.0.json',
        ),
        'utf8',
      ),
    );
    expect(written).toEqual({
      imageRef: 'ghcr.io/shop/storefront-web:2.3.0',
      reportUrl:
        'https://reports.example/regis/ghcr.io_shop_storefront-web_2.3.0.json',
      system: 'shop',
      playbook: 'default',
    });
    expect(ctx.output).toHaveBeenCalledWith(
      'fragmentPath',
      'examples/regis-index.d/images/ghcr.io_shop_storefront-web_2.3.0.json',
    );
  });

  it('includes the owner for third-party and writes it', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws2');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'docker.io/bitnami/redis:7.2',
        type: 'third-party',
        owner: 'group:default/team-platform',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await action.handler(ctx);

    const written = JSON.parse(
      await fs.readFile(
        join(
          ws,
          'examples/regis-index.d/images/docker.io_bitnami_redis_7.2.json',
        ),
        'utf8',
      ),
    );
    expect(written.owner).toBe('group:default/team-platform');
  });

  it('refuses a third-party request without an owner', async () => {
    const action = createAddEntryAction();
    const ws = mockDir.resolve('ws3');
    await fs.mkdir(ws, { recursive: true });
    const ctx = makeContext(
      {
        imageRef: 'docker.io/bitnami/redis:7.2',
        type: 'third-party',
        reportBaseUrl: 'https://reports.example/regis',
        indexDirPath: 'examples/regis-index.d',
      },
      ws,
    );

    await expect(action.handler(ctx)).rejects.toThrow(/owner/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @regis/backstage-plugin-regis-scaffolder-backend test src/actions/addEntry.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module './addEntry'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-scaffolder-backend/src/actions/addEntry.ts`:

```ts
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  slugForImageRef,
  validateIndexImageEntry,
  type IndexImageEntry,
} from '@regis/backstage-plugin-regis-common';
import fs from 'fs-extra';

/**
 * `regis:index:add-entry` — builds a single `IndexImageEntry`, validates it, and
 * writes it to `<indexDirPath>/images/<slug>.json` in the scaffolder workspace,
 * ready for `publish:github:pull-request` to open the intake PR.
 *
 * tier/score/digest/snapshotDate are intentionally omitted — the CI scan
 * (Slice C) fills them. The derived reportUrl keeps the entry schema-valid.
 */
export function createAddEntryAction() {
  return createTemplateAction({
    id: 'regis:index:add-entry',
    description:
      'Writes a single Regis index image-entry fragment into the workspace.',
    schema: {
      input: {
        imageRef: z =>
          z.string().describe('Full canonical image reference (identity).'),
        type: z =>
          z
            .enum(['first-party', 'third-party'])
            .describe('first-party (our output) or third-party (supply chain).'),
        owner: z =>
          z
            .string()
            .optional()
            .describe('Backstage owner entity ref. Required for third-party.'),
        system: z => z.string().optional().describe('Backstage system name.'),
        playbook: z =>
          z.string().optional().describe('Playbook id assessed against.'),
        reportBaseUrl: z =>
          z
            .string()
            .describe('Base URL the report.json will be published under.'),
        indexDirPath: z =>
          z
            .string()
            .describe('Path of the index directory within the target repo.'),
      },
      output: {
        fragmentPath: z =>
          z.string().describe('Workspace-relative path of the written fragment.'),
      },
    },
    async handler(ctx) {
      const { imageRef, type, owner, system, playbook, reportBaseUrl, indexDirPath } =
        ctx.input;

      if (type === 'third-party' && !owner) {
        throw new Error(
          'third-party admission requires an owner/sponsor (the provider skips ownerless entities)',
        );
      }

      const slug = slugForImageRef(imageRef);
      const reportUrl = `${reportBaseUrl.replace(/\/$/, '')}/${slug}.json`;

      const entry: IndexImageEntry = {
        imageRef,
        reportUrl,
        ...(owner ? { owner } : {}),
        ...(system ? { system } : {}),
        ...(playbook ? { playbook } : {}),
      };
      validateIndexImageEntry(entry);

      const fragmentPath = `${indexDirPath}/images/${slug}.json`;
      const absPath = resolveSafeChildPath(ctx.workspacePath, fragmentPath);
      await fs.outputFile(absPath, `${JSON.stringify(entry, null, 2)}\n`);

      ctx.logger.info(`regis: wrote intake fragment ${fragmentPath}`);
      ctx.output('fragmentPath', fragmentPath);
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @regis/backstage-plugin-regis-scaffolder-backend test src/actions/addEntry.test.ts --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-scaffolder-backend/src/actions/addEntry.ts plugins/regis-scaffolder-backend/src/actions/addEntry.test.ts
git commit -m "feat(regis-scaffolder-backend): regis:index:add-entry action"
```

---

## Task 11: Register the action via a backend module

**Files:**
- Create: `plugins/regis-scaffolder-backend/src/module.ts`

Registers the action against the scaffolder plugin using `scaffolderActionsExtensionPoint`.

- [ ] **Step 1: Write the module**

Create `plugins/regis-scaffolder-backend/src/module.ts`:

```ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import { createAddEntryAction } from './actions/addEntry';

/** Adds the Regis intake scaffolder action(s) to the scaffolder plugin. */
export const scaffolderModuleRegisIntake = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'regis-intake',
  register(env) {
    env.registerInit({
      deps: { scaffolder: scaffolderActionsExtensionPoint },
      async init({ scaffolder }) {
        scaffolder.addActions(createAddEntryAction());
      },
    });
  },
});
```

- [ ] **Step 2: Verify the export resolves + the package builds**

`src/index.ts` (from Task 9) re-exports `scaffolderModuleRegisIntake as default`. Run the whole package suite to confirm everything compiles and imports resolve:

Run: `yarn workspace @regis/backstage-plugin-regis-scaffolder-backend test --watchAll=false`
Expected: PASS (the action tests; no import/compile errors).

> If `@backstage/plugin-scaffolder-node/alpha` is not a resolvable subpath in this version, import `scaffolderActionsExtensionPoint` from `@backstage/plugin-scaffolder-node` instead (it is also re-exported from the package root in 0.13.x). Verify with:
> `node -e "console.log(Object.keys(require('@backstage/plugin-scaffolder-node')).filter(k => k.includes('ctions')))"`
> Use whichever path exposes `scaffolderActionsExtensionPoint`.

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-scaffolder-backend/src/module.ts
git commit -m "feat(regis-scaffolder-backend): register regis-intake scaffolder module"
```

---

## Task 12: Wire the module into the backend app

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Add the dependency**

In `packages/backend/package.json`, add to `dependencies` (alphabetical order near the other `@regis/*` entries):

```json
"@regis/backstage-plugin-regis-scaffolder-backend": "^0.1.0",
```

- [ ] **Step 2: Register the module**

In `packages/backend/src/index.ts`, just after the existing scaffolder lines (around line 18–21, where `@backstage/plugin-scaffolder-backend` and its github module are added), add:

```ts
// Regis intake scaffolder action (regis:index:add-entry)
backend.add(import('@regis/backstage-plugin-regis-scaffolder-backend'));
```

- [ ] **Step 3: Install + typecheck the backend**

Run from the repo root: `yarn install`
Expected: links the new workspace dependency.

Run: `yarn workspace backend tsc` (or `yarn tsc` at the repo root if that is the project convention)
Expected: no type errors. If `yarn workspace backend tsc` is not defined, run `yarn build:backend` and confirm it compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/package.json packages/backend/src/index.ts yarn.lock
git commit -m "feat(backend): register regis-scaffolder-backend module"
```

---

## Task 13: Intake template + registration

**Files:**
- Create: `examples/intake/template.yaml`
- Modify: `app-config.yaml`

One template with a `type` toggle; `owner` is conditionally required when `type === 'third-party'` via JSON-schema `dependencies`/`oneOf`. Steps: `regis:index:add-entry` → `publish:github:pull-request` → `notification:send` → output the PR link.

- [ ] **Step 1: Create the template**

Create `examples/intake/template.yaml`:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: regis-image-onboarding
  title: Request image onboarding
  description: >-
    Add a container image to the Regis portfolio. Opens a PR adding a single
    index fragment; CI scans the image and the policy gate decides admission.
spec:
  owner: group:default/team-platform
  type: service

  parameters:
    - title: Image
      required:
        - imageRef
        - type
      properties:
        imageRef:
          title: Image reference
          type: string
          description: Full canonical image reference, e.g. ghcr.io/shop/web:2.3.0
          ui:autofocus: true
        type:
          title: Source
          type: string
          enum:
            - first-party
            - third-party
          enumNames:
            - 'First-party (our own image)'
            - 'Third-party (supply-chain admission)'
          default: first-party
        system:
          title: System
          type: string
          description: Backstage system this image belongs to (optional).
        playbook:
          title: Playbook
          type: string
          description: Playbook id to assess against (optional).
      dependencies:
        type:
          oneOf:
            - properties:
                type:
                  enum:
                    - first-party
                owner:
                  title: Owner
                  type: string
                  description: Owner entity ref (optional for first-party).
                  ui:field: OwnerPicker
                  ui:options:
                    catalogFilter:
                      kind: Group
            - properties:
                type:
                  enum:
                    - third-party
                owner:
                  title: Owner / sponsor
                  type: string
                  description: >-
                    Required — third-party images must have an owning team that
                    sponsors their admission.
                  ui:field: OwnerPicker
                  ui:options:
                    catalogFilter:
                      kind: Group
              required:
                - owner

    - title: Index repository
      required:
        - targetRepo
      properties:
        targetRepo:
          title: Index repository
          type: string
          ui:field: RepoUrlPicker
          ui:options:
            allowedHosts:
              - github.com

  steps:
    - id: add-entry
      name: Build index fragment
      action: regis:index:add-entry
      input:
        imageRef: ${{ parameters.imageRef }}
        type: ${{ parameters.type }}
        owner: ${{ parameters.owner }}
        system: ${{ parameters.system }}
        playbook: ${{ parameters.playbook }}
        reportBaseUrl: http://localhost:8080/reports
        indexDirPath: examples/regis-index.d

    - id: publish
      name: Open intake PR
      action: publish:github:pull-request
      input:
        repoUrl: ${{ parameters.targetRepo }}
        branchName: regis-intake-${{ parameters.imageRef }}
        title: 'Onboard ${{ parameters.imageRef }} to the Regis portfolio'
        description: >-
          Intake request for `${{ parameters.imageRef }}`
          (${{ parameters.type }}). Adds one index fragment;
          CI scans and the policy gate decides admission.

    - id: notify
      name: Notify requester
      action: notification:send
      input:
        recipients: entity
        entityRefs:
          - user:default/guest
        title: 'Intake PR opened'
        info: 'A PR to onboard ${{ parameters.imageRef }} has been opened.'
        severity: 'normal'

  output:
    links:
      - title: Intake PR
        url: ${{ steps['publish'].output.remoteUrl }}
```

- [ ] **Step 2: Register the template location**

In `app-config.yaml`, in the `catalog.locations` list, after the existing example-template block (the `../../examples/template/template.yaml` entry), add:

```yaml
    # Regis intake template (Request image onboarding)
    - type: file
      target: ../../examples/intake/template.yaml
      rules:
        - allow: [Template]
```

- [ ] **Step 3: Validate the template YAML parses**

Run: `npx --yes js-yaml examples/intake/template.yaml > /dev/null && echo OK`
Expected: `OK` (no YAML syntax error).

- [ ] **Step 4: Commit**

```bash
git add examples/intake/template.yaml app-config.yaml
git commit -m "feat: Request image onboarding intake template"
```

---

## Task 14: Full-suite verification

- [ ] **Step 1: Run all three plugin suites**

```bash
yarn workspace @regis/backstage-plugin-regis-common test --watchAll=false
yarn workspace @regis/backstage-plugin-regis-backend test --watchAll=false
yarn workspace @regis/backstage-plugin-regis-scaffolder-backend test --watchAll=false
```

Expected: all PASS.

- [ ] **Step 2: Lint the changed packages**

```bash
yarn workspace @regis/backstage-plugin-regis-common lint
yarn workspace @regis/backstage-plugin-regis-backend lint
yarn workspace @regis/backstage-plugin-regis-scaffolder-backend lint
```

Expected: no lint errors.

- [ ] **Step 3: Typecheck the repo**

Run: `yarn tsc` (repo-wide type check; if not defined, `yarn build:all`)
Expected: no type errors.

- [ ] **Step 4: Final commit (if lint/tsc produced fixes)**

```bash
git add -A
git commit -m "chore: lint + typecheck fixes for Slice B intake"
```

---

## Self-Review

**Spec coverage:**
- Fragment index model (`regis-common` validation + slug) → Tasks 1, 2. ✓
- Directory layout `index.json` + `images/<slug>.json` → Task 8. ✓
- `slugForImageRef` shared by action + provider → Task 1 (used in Tasks 8, 10). ✓
- Derived `reportUrl`, scan fields left empty → Task 10 handler. ✓
- `validateIndexImageEntry` reused by action + provider → Tasks 2, 4, 10. ✓
- Provider reads fragments via `readTree` + filesystem for `file://` → Tasks 3, 5, 6, 7. ✓
- Skip-invalid-fragment resilience → Task 4. ✓
- Config `indexUrl` → `indexDirUrl`, inject `urlReader`, scheme selection → Tasks 7, 8. ✓
- Custom action `regis:index:add-entry` in a dedicated plugin → Tasks 9–11. ✓
- Third-party owner enforcement → Task 10. ✓
- Single template with first/third-party toggle, conditional owner, `RepoUrlPicker` default → Task 13. ✓
- Testing strategy (common, scaffolder, backend incl. full-mutation removal) → Tasks 2, 4, 6, 10. ✓

**Out of scope (correctly excluded):** CI scan/policy gate (Slice C), waivers (D), drift (E), audit (F), real index-repo provisioning (Milestone 0/ops), hash-suffixed slugs + duplicate refusal.

**Type consistency:** `IndexFragment { path, content }`, `IndexFragmentSource.list(indexDirUrl)`, `assembleIndex(fragments, logger)`, `RegisEntityProviderOptions { indexDirUrl, fragmentSource, ... }`, `createAddEntryAction()`, `slugForImageRef`, `validateIndexImageEntry`, `IndexEntrySchemaError` — names are used identically across the tasks that define and consume them. `buildEntities`/`BuildOpts.indexUrl` is left unchanged and fed the directory URL by value.

**Open verification flags (resolve during execution, not blockers):**
- Task 11 notes the fallback if `@backstage/plugin-scaffolder-node/alpha` does not expose `scaffolderActionsExtensionPoint` (import from the package root instead).
- Task 9 notes copying `regis-backend/tsconfig.json` verbatim if it differs from the shown skeleton.
- Task 12 notes the repo's actual typecheck command (`yarn tsc` vs `yarn build:backend`).
