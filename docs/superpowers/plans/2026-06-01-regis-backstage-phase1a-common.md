# Regis Backstage Plugin — Phase 1a: Contract Package + Repo Bootstrap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `regis-backstage` monorepo and ship `@regis/backstage-plugin-regis-common` — the isomorphic contract package (generated types, a runtime report validator, and catalog annotation helpers) that Phases 1b/1c build on.

**Architecture:** A new standalone Backstage monorepo (scaffolded with `@backstage/create-app`), separate from the core `regis` repo. The contract package vendors a bundled copy of the core's `report.schema.json`, generates TypeScript types from it, and validates reports at runtime — the only live coupling to the core, guarded against drift in CI.

**Tech Stack:** TypeScript, Backstage CLI (yarn), Jest, Ajv 2020 + ajv-formats, `@apidevtools/json-schema-ref-parser`, `json-schema-to-typescript`, changesets, GitHub Actions.

> **Source spec:** `docs/superpowers/specs/2026-06-01-regis-backstage-plugin-design.md`
>
> **Where this work happens:** in a **new repository `regis-backstage/`**, a sibling of the `regis/` repo (e.g. `~/Documents/Workspaces/trivoallan/regis-backstage`). This plan document lives in the `regis` repo only for traceability. All commands below run inside `regis-backstage/` unless stated otherwise.
>
> **Contract source of truth:** `regis/schemas/report/report.schema.json` (core), which `$ref`s `../playbook/result.schema.json` and nothing else — a 2-file transitive closure.

---

## File Structure (Phase 1a)

```text
regis-backstage/                         # new repo (create-app output)
  package.json                           # root workspaces: packages/*, plugins/*
  tsconfig.json                          # extends @backstage/cli/config/tsconfig.json
  .changeset/config.json
  .github/workflows/ci.yml               # lint + typecheck + test + build + drift guard
  plugins/
    regis-common/
      package.json                       # role: common-library, publishable
      README.md
      scripts/
        sync-contract.ts                 # fetch + bundle schema, regenerate types
      src/
        index.ts                         # public exports
        annotations.ts                   # REGIS_ANNOTATION_REPORT_URL + helpers
        annotations.test.ts
        validate.ts                      # validateReport + errors + SUPPORTED_SCHEMA_VERSION
        validate.test.ts
        types.ts                         # AUTO-GENERATED from the bundled schema
        schema/
          report.schema.json             # AUTO-GENERATED bundled schema (self-contained)
        __fixtures__/
          report.valid.json
          report.invalid.json
          report.future.json
          report.degraded.json
```

Each file has one responsibility: `annotations.ts` (catalog wiring), `validate.ts` (contract enforcement), `types.ts` + `schema/report.schema.json` (generated, never hand-edited), `scripts/sync-contract.ts` (the regeneration tool).

---

## Task 1: Bootstrap the `regis-backstage` repo

**Files:**

- Create: the whole `regis-backstage/` monorepo (via scaffolder)

- [ ] **Step 1: Scaffold the app**

Run from the parent workspace dir (e.g. `~/Documents/Workspaces/trivoallan/`):

```bash
npx @backstage/create-app@latest --path regis-backstage
```

When prompted `Enter a name for the app`, type: `regis-backstage`
Expected: a new `regis-backstage/` dir, `yarn install` runs, an initial git commit is created.

- [ ] **Step 2: Pin the toolchain and license**

Run inside `regis-backstage/`:

```bash
node -v   # confirm Node 20.x or 22.x (Backstage requirement)
```

Edit root `package.json`: ensure `"license": "Apache-2.0"` is present at the root and add a workspace-wide one if missing. Expected: no error.

- [ ] **Step 3: Verify the scaffold builds and tests**

```bash
cd regis-backstage
yarn tsc:full
CI=true yarn test:all
```

Expected: typecheck passes; the scaffolded app's sample tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold regis-backstage app"
```

---

## Task 2: Add changesets

**Files:**

- Create: `.changeset/config.json` (via init)
- Modify: root `package.json`

- [ ] **Step 1: Install and init changesets**

```bash
yarn add -D -W @changesets/cli
yarn changeset init
```

Expected: `.changeset/` dir with `config.json` and `README.md`.

- [ ] **Step 2: Point changesets at the public org scope**

Edit `.changeset/config.json`: set `"access": "public"` and `"baseBranch": "main"`.

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["app", "backend"]
}
```

(`app` and `backend` are the private demo packages — never published.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "build: add changesets for versioned npm publishing"
```

---

## Task 3: Create the `regis-common` package skeleton

**Files:**

- Create: `plugins/regis-common/package.json`
- Create: `plugins/regis-common/src/index.ts`
- Create: `plugins/regis-common/README.md`

- [ ] **Step 1: Write the package manifest**

Create `plugins/regis-common/package.json`:

```json
{
  "name": "@regis/backstage-plugin-regis-common",
  "version": "0.1.0",
  "description": "Shared contract (types, validator, annotations) for the Regis Backstage plugin.",
  "license": "Apache-2.0",
  "private": false,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.cjs.js",
    "module": "dist/index.esm.js",
    "types": "dist/index.d.ts"
  },
  "backstage": {
    "role": "common-library"
  },
  "exports": {
    ".": "./src/index.ts",
    "./package.json": "./package.json"
  },
  "typesVersions": {
    "*": {
      "package.json": ["package.json"]
    }
  },
  "scripts": {
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean",
    "prepack": "backstage-cli package prepack",
    "postpack": "backstage-cli package postpack",
    "generate:contract": "tsx scripts/sync-contract.ts"
  },
  "dependencies": {
    "@backstage/catalog-model": "^1.7.0",
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  },
  "devDependencies": {
    "@apidevtools/json-schema-ref-parser": "^11.7.0",
    "json-schema-to-typescript": "^15.0.3",
    "tsx": "^4.19.2"
  },
  "files": ["dist"]
}
```

- [ ] **Step 2: Write a temporary index so the package compiles**

Create `plugins/regis-common/src/index.ts`:

```ts
export {};
```

Create `plugins/regis-common/README.md`:

```markdown
# @regis/backstage-plugin-regis-common

Shared contract for the Regis Backstage plugin: generated types, a runtime
report validator, and catalog annotation helpers. Consumed by the frontend
(`@regis/backstage-plugin-regis`) and backend
(`@regis/backstage-plugin-regis-backend`) plugins.

Types and `src/schema/report.schema.json` are **generated** from the core
`report.schema.json` by `yarn generate:contract` — do not edit them by hand.
```

- [ ] **Step 3: Install and verify the package is picked up**

```bash
yarn install
yarn workspace @regis/backstage-plugin-regis-common lint
```

Expected: install links the new workspace; lint passes (empty package).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold regis-common contract package"
```

---

## Task 4: Annotation constant + helpers (TDD)

**Files:**

- Create: `plugins/regis-common/src/annotations.ts`
- Test: `plugins/regis-common/src/annotations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-common/src/annotations.test.ts`:

```ts
import { Entity } from "@backstage/catalog-model";
import {
  REGIS_ANNOTATION_REPORT_URL,
  getRegisReportUrl,
  isRegisAvailable,
} from "./annotations";

const entityWith = (annotations?: Record<string, string>): Entity => ({
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: { name: "svc", annotations },
  spec: {},
});

describe("annotations", () => {
  it("reads the report url annotation", () => {
    const e = entityWith({
      [REGIS_ANNOTATION_REPORT_URL]: "https://host/report.json",
    });
    expect(getRegisReportUrl(e)).toBe("https://host/report.json");
    expect(isRegisAvailable(e)).toBe(true);
  });

  it("returns undefined when the annotation is absent", () => {
    const e = entityWith({ other: "v" });
    expect(getRegisReportUrl(e)).toBeUndefined();
    expect(isRegisAvailable(e)).toBe(false);
  });

  it("handles entities with no annotations block", () => {
    expect(isRegisAvailable(entityWith())).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd plugins/regis-common
yarn test --watchAll=false src/annotations.test.ts
```

Expected: FAIL — `Cannot find module './annotations'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-common/src/annotations.ts`:

```ts
import { Entity } from "@backstage/catalog-model";

/** Catalog annotation pointing at an image's Regis `report.json`. */
export const REGIS_ANNOTATION_REPORT_URL = "regis.io/report-url";

/** Returns the report URL annotation for an entity, or undefined. */
export function getRegisReportUrl(entity: Entity): string | undefined {
  return entity.metadata.annotations?.[REGIS_ANNOTATION_REPORT_URL];
}

/** True when an entity carries a Regis report annotation. */
export function isRegisAvailable(entity: Entity): boolean {
  return Boolean(getRegisReportUrl(entity));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test --watchAll=false src/annotations.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add plugins/regis-common/src/annotations.ts plugins/regis-common/src/annotations.test.ts
git commit -m "feat: add Regis catalog annotation helpers"
```

---

## Task 5: Vendor the golden fixtures

**Files:**

- Create: `plugins/regis-common/src/__fixtures__/report.valid.json`
- Create: `plugins/regis-common/src/__fixtures__/report.invalid.json`
- Create: `plugins/regis-common/src/__fixtures__/report.future.json`
- Create: `plugins/regis-common/src/__fixtures__/report.degraded.json`

- [ ] **Step 1: Add the valid fixture** (mirrors the core's `tests/fixtures/report.v1.json`)

Create `plugins/regis-common/src/__fixtures__/report.valid.json`:

```json
{
  "schemaVersion": 1,
  "version": "0.33.0",
  "snapshot_date": "2026-05-31",
  "tier": "Gold",
  "request": {
    "url": "registry-1.docker.io/library/nginx:1.27",
    "registry": "registry-1.docker.io",
    "repository": "library/nginx",
    "tag": "1.27",
    "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "analyzers": ["cve", "oci"],
    "timestamp": "2026-05-31T12:00:00+00:00"
  },
  "results": {
    "oci": {
      "analyzer": "oci",
      "repository": "library/nginx",
      "tag": "1.27",
      "platforms": [{ "architecture": "amd64", "os": "linux" }]
    },
    "cve": {
      "analyzer": "cve",
      "repository": "library/nginx",
      "tag": "1.27",
      "scanner_version": "0.74.1",
      "vulnerability_count": 17,
      "critical_count": 0,
      "high_count": 1,
      "medium_count": 4,
      "low_count": 12,
      "negligible_count": 0,
      "unknown_count": 0,
      "fixed_count": 5,
      "targets": []
    }
  },
  "rules": [
    {
      "slug": "no-critical-cve",
      "description": "No critical CVEs",
      "level": "Gold",
      "tags": ["security"],
      "passed": true,
      "status": "passed",
      "message": "0 critical vulnerabilities found",
      "analyzers": ["cve"]
    }
  ],
  "rules_summary": {
    "score": 100,
    "total": ["no-critical-cve"],
    "passed": ["no-critical-cve"],
    "by_tag": {
      "security": {
        "rules": ["no-critical-cve"],
        "passed_rules": ["no-critical-cve"],
        "score": 100
      }
    }
  }
}
```

- [ ] **Step 2: Add the future-version fixture** (valid shape, unsupported `schemaVersion`)

Create `plugins/regis-common/src/__fixtures__/report.future.json`:

```json
{
  "schemaVersion": 2,
  "version": "0.40.0",
  "snapshot_date": "2026-09-01",
  "tier": "Gold",
  "request": {
    "url": "registry-1.docker.io/library/nginx:1.27",
    "registry": "registry-1.docker.io",
    "repository": "library/nginx",
    "tag": "1.27",
    "digest": null,
    "analyzers": ["cve"],
    "timestamp": "2026-09-01T12:00:00+00:00"
  },
  "results": {}
}
```

- [ ] **Step 3: Add the degraded fixture** (valid v1, only required fields, `tier` null)

Create `plugins/regis-common/src/__fixtures__/report.degraded.json`:

```json
{
  "schemaVersion": 1,
  "version": "0.33.0",
  "tier": null,
  "request": {
    "url": "ghcr.io/acme/api:edge",
    "registry": "ghcr.io",
    "repository": "acme/api",
    "tag": "edge",
    "digest": null,
    "analyzers": ["oci"],
    "timestamp": "2026-05-31T12:00:00+00:00"
  },
  "results": {
    "oci": { "analyzer": "oci", "repository": "acme/api", "tag": "edge" }
  }
}
```

- [ ] **Step 4: Add the invalid fixture** (missing the required `request` block)

Create `plugins/regis-common/src/__fixtures__/report.invalid.json`:

```json
{
  "schemaVersion": 1,
  "version": "0.33.0",
  "results": {}
}
```

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-common/src/__fixtures__
git commit -m "test: add Regis report contract fixtures"
```

---

## Task 6: Contract sync script — bundle schema + generate types

**Files:**

- Create: `plugins/regis-common/scripts/sync-contract.ts`
- Generated: `plugins/regis-common/src/schema/report.schema.json`
- Generated: `plugins/regis-common/src/types.ts`

- [ ] **Step 1: Write the sync script**

Create `plugins/regis-common/scripts/sync-contract.ts`:

```ts
/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { compile } from "json-schema-to-typescript";

// Pin to a released tag of the core repo. Bump deliberately; the CI drift guard
// fails if the committed outputs no longer match this source.
const SCHEMA_SOURCE_URL =
  "https://raw.githubusercontent.com/trivoallan/regis/v0.33.0/regis/schemas/report/report.schema.json";

const SCHEMA_OUT = resolve(__dirname, "../src/schema/report.schema.json");
const TYPES_OUT = resolve(__dirname, "../src/types.ts");

async function main(): Promise<void> {
  // Resolve the one external $ref (../playbook/result.schema.json) so Ajv can
  // compile a self-contained schema without network access at runtime.
  const bundled = await $RefParser.bundle(SCHEMA_SOURCE_URL);

  mkdirSync(dirname(SCHEMA_OUT), { recursive: true });
  writeFileSync(SCHEMA_OUT, `${JSON.stringify(bundled, null, 2)}\n`);

  const ts = await compile(bundled as object, "Report", {
    bannerComment:
      "/* eslint-disable */\n/**\n * AUTO-GENERATED by scripts/sync-contract.ts.\n * Do not edit by hand — run `yarn generate:contract`.\n */",
    additionalProperties: false,
  });
  writeFileSync(TYPES_OUT, ts);

  console.log(`Wrote:\n  ${SCHEMA_OUT}\n  ${TYPES_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the generator**

```bash
cd plugins/regis-common
yarn generate:contract
```

Expected: prints the two written paths; `src/schema/report.schema.json` (self-contained, no `../` refs) and `src/types.ts` (exports `Report` + nested interfaces) now exist.

- [ ] **Step 3: Sanity-check the generated artifacts**

```bash
grep -c '"\$ref": "\.\./' src/schema/report.schema.json   # expect 0 (external refs inlined)
grep -q 'export interface Report' src/types.ts && echo "Report type OK"
```

Expected: `0` and `Report type OK`.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add plugins/regis-common/scripts/sync-contract.ts \
        plugins/regis-common/src/schema/report.schema.json \
        plugins/regis-common/src/types.ts
git commit -m "feat: sync Regis report contract (bundled schema + generated types)"
```

---

## Task 7: Runtime report validator (TDD)

**Files:**

- Create: `plugins/regis-common/src/validate.ts`
- Test: `plugins/regis-common/src/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-common/src/validate.test.ts`:

```ts
import valid from "./__fixtures__/report.valid.json";
import invalid from "./__fixtures__/report.invalid.json";
import future from "./__fixtures__/report.future.json";
import degraded from "./__fixtures__/report.degraded.json";
import {
  validateReport,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
  SUPPORTED_SCHEMA_VERSION,
} from "./validate";

describe("validateReport", () => {
  it("accepts a valid report and returns it typed", () => {
    const r = validateReport(valid);
    expect(r.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(r.request.repository).toBe("library/nginx");
  });

  it("accepts a degraded report (tier null, minimal fields)", () => {
    const r = validateReport(degraded);
    expect(r.tier).toBeNull();
    expect(r.rules).toBeUndefined();
  });

  it("throws ReportSchemaError on a malformed report", () => {
    expect(() => validateReport(invalid)).toThrow(ReportSchemaError);
  });

  it("throws UnsupportedSchemaVersionError on a newer schemaVersion", () => {
    expect(() => validateReport(future)).toThrow(UnsupportedSchemaVersionError);
  });

  it("prefers the version error over schema errors", () => {
    // schemaVersion too new AND missing required fields → version error wins.
    const bad = { schemaVersion: 99 };
    expect(() => validateReport(bad)).toThrow(UnsupportedSchemaVersionError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd plugins/regis-common
yarn test --watchAll=false src/validate.test.ts
```

Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-common/src/validate.ts`:

```ts
import Ajv2020, { ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "./schema/report.schema.json";
import type { Report } from "./types";

/** Highest report `schemaVersion` this package understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

function ajvMessage(errors: ErrorObject[]): string {
  return errors
    .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
    .join("; ");
}

/** Thrown when a report does not match the report schema. */
export class ReportSchemaError extends Error {
  constructor(public readonly errors: ErrorObject[]) {
    super(`report failed schema validation: ${ajvMessage(errors)}`);
    this.name = "ReportSchemaError";
  }
}

/** Thrown when a report's schemaVersion is newer than this package supports. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly schemaVersion: number) {
    super(
      `report uses schemaVersion ${schemaVersion}; this plugin supports up to ` +
        `${SUPPORTED_SCHEMA_VERSION} — upgrade the Regis plugin`,
    );
    this.name = "UnsupportedSchemaVersionError";
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
  if (typeof version === "number" && version > SUPPORTED_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version);
  }
  if (!validateSchema(input)) {
    throw new ReportSchemaError(validateSchema.errors ?? []);
  }
  return input as Report;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test --watchAll=false src/validate.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add plugins/regis-common/src/validate.ts plugins/regis-common/src/validate.test.ts
git commit -m "feat: add runtime report validator with schemaVersion gating"
```

---

## Task 8: Public exports + build verification

**Files:**

- Modify: `plugins/regis-common/src/index.ts`

- [ ] **Step 1: Replace the placeholder index with real exports**

Replace `plugins/regis-common/src/index.ts` with:

```ts
export {
  REGIS_ANNOTATION_REPORT_URL,
  getRegisReportUrl,
  isRegisAvailable,
} from "./annotations";
export {
  validateReport,
  ReportSchemaError,
  UnsupportedSchemaVersionError,
  SUPPORTED_SCHEMA_VERSION,
} from "./validate";
export type { Report } from "./types";
```

- [ ] **Step 2: Typecheck, lint, test, and build the package**

```bash
yarn workspace @regis/backstage-plugin-regis-common lint
CI=true yarn workspace @regis/backstage-plugin-regis-common test
yarn workspace @regis/backstage-plugin-regis-common build
```

Expected: lint clean; all tests PASS; `dist/` produced (cjs + esm + d.ts).

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-common/src/index.ts
git commit -m "feat: export the regis-common public API"
```

---

## Task 9: CI workflow with contract drift guard

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: yarn
      - run: yarn install --immutable
      - name: Typecheck
        run: yarn tsc:full
      - name: Lint
        run: yarn lint:all
      - name: Test
        run: yarn test:all
      - name: Build
        run: yarn build:all
      - name: Contract drift guard
        run: |
          yarn workspace @regis/backstage-plugin-regis-common generate:contract
          git diff --exit-code -- \
            plugins/regis-common/src/schema/report.schema.json \
            plugins/regis-common/src/types.ts
```

- [ ] **Step 2: Verify the drift guard locally**

```bash
yarn workspace @regis/backstage-plugin-regis-common generate:contract
git diff --exit-code -- \
  plugins/regis-common/src/schema/report.schema.json \
  plugins/regis-common/src/types.ts && echo "no drift"
```

Expected: `no drift` (regeneration is byte-identical to what was committed in Task 6).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build pipeline with contract drift guard"
```

---

## Task 10: Release changeset

**Files:**

- Create: `.changeset/regis-common-initial.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/regis-common-initial.md`:

```markdown
---
"@regis/backstage-plugin-regis-common": minor
---

Initial release: shared Regis contract — generated report types, runtime
`validateReport` with `schemaVersion` gating, and catalog annotation helpers.
```

- [ ] **Step 2: Verify changeset status**

```bash
yarn changeset status
```

Expected: lists `@regis/backstage-plugin-regis-common` for a minor bump.

- [ ] **Step 3: Commit**

```bash
git add .changeset/regis-common-initial.md
git commit -m "docs: add changeset for regis-common initial release"
```

---

## Self-Review

**1. Spec coverage (Phase 1a slice):**

- Contract package `regis-common` with types + embedded schema + validator + annotation constants → Tasks 3–8. ✓
- Types generated from `report.schema.json`; runtime validation; `SUPPORTED_SCHEMA_VERSION`; distinct unsupported-version vs schema error → Task 7. ✓ (matches spec's two-`422` distinction, surfaced as two error classes for 1b to map to HTTP).
- Contract sync script + CI drift guard → Tasks 6 & 9. ✓
- changesets for publishing → Tasks 2 & 10. ✓
- Golden fixtures (valid / invalid / future / degraded) → Task 5. ✓
- Deferred to 1b/1c (correctly out of this plan): `ReportService`, `HttpReportSource`, `InMemoryTtlStore`, `CatalogAggregator`, REST API, frontend blueprints, demo app.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**3. Type consistency:** `validateReport`, `ReportSchemaError`, `UnsupportedSchemaVersionError`, `SUPPORTED_SCHEMA_VERSION`, `REGIS_ANNOTATION_REPORT_URL`, `getRegisReportUrl`, `isRegisAvailable`, and `Report` are named identically across `annotations.ts`, `validate.ts`, `index.ts`, tests, and the sync script. The generated `Report` type is produced (Task 6) before it is imported (Tasks 7–8). ✓

**Watch-points for the implementer:**

- Pin Backstage dependency versions emitted by `create-app`; bump `SCHEMA_SOURCE_URL` only deliberately (drift guard enforces it).
- If `create-app` already includes changesets, skip Task 2 Step 1's install and only apply the config in Step 2.
- `ajv/dist/2020` is the JSON-Schema-2020-12 entry point required by the schema's `$schema`; `ajv-formats` supplies the `date-time` format used by `request.timestamp`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-regis-backstage-phase1a-common.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

---

## Execution corrections (validated 2026-06-01, commit `7cd95db` in `regis-backstage`)

Phase 1a was executed inline and **fully verified** (8/8 tests pass, lint clean, build emits cjs/esm/d.ts, contract drift guard byte-identical). The real `create-app` output diverged from this plan's assumptions in the following ways — **all of which also apply to plans 1b and 1c**:

1. **Backstage v1.51.0** (not v1.49): `@backstage/cli@^0.36.2`, TypeScript `~5.8`, Jest `30`, **yarn `4.4.1`** (berry, `nodeLinker: node-modules`). NFS is long-default.
2. **Node `22 || 24`** (Node 20 dropped). CI `setup-node` must use **22** — the Task 9 workflow was written with 20; corrected to 22 in the repo.
3. **changesets add**: yarn 4 has no `-W`. Use `yarn add -D @changesets/cli` from the repo root (Task 2 Step 1).
4. **Per-package scripts can't see root-only bins.** `yarn workspace X test` and `cd pkg && yarn test` fail with `command not found: backstage-cli` (berry does not expose the root `@backstage/cli` bin to a workspace script). **Run tests via the root runner**: `CI=true yarn test <pattern>` (= `backstage-cli repo test <pattern>`). `tsx`-based scripts (e.g. `generate:contract`) DO work per-workspace because `tsx` is a local devDep.
5. **Per-package `.eslintrc.js` is required**: `module.exports = require('@backstage/cli/config/eslint-factory')(__dirname);` — without it, lint parse-errors on TS `import`. (The plan's hand-authored package omitted it; `yarn new` would have generated it.)
6. **Build needs types first**: run `yarn tsc` (root → emits `.d.ts` into `dist-types/`) **before** `backstage-cli package build`, or use `yarn build:all` which sequences both. Task 8's build step must add the `yarn tsc` precondition.
7. **Sync source URL**: there is **no `v0.33.0` tag** and the `trivoallan.github.io` `$id` URLs 404. Pin to a **raw commit SHA**: `https://raw.githubusercontent.com/trivoallan/regis/ec31f8fd497301da8bdee1521768591034a539fd/regis/schemas/report/report.schema.json` (added a `REGIS_SCHEMA_SOURCE` env override). Bump to a tag once the core cuts `v0.33.0`.
8. **`role: common-library` works** with `@backstage/cli@0.36`; the bundled schema (report + result, 25 KB) compiles under `Ajv2020` and codegen is deterministic (drift guard green). `"private": false` is stripped by the formatter — harmless (absence = publishable).

These are folded into the assumptions for plans 1b/1c (scaffold with `yarn new` where practical; test via the root runner; per-package eslintrc; tsc-before-build).
