# Regis Backstage Plugin — Phase 1b: Backend Plugin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@regis/backstage-plugin-regis-backend` — a new-backend-system plugin that resolves an entity's `regis.io/report-url` annotation, fetches + validates + TTL-caches the report, aggregates annotated entities for the catalog page, and serves `GET /report`, `GET /reports`, `GET /health` under Backstage's default auth.

**Architecture:** Two injected seams — `ReportSource` (v1: `HttpReportSource`) and `ReportStore` (v1: `InMemoryTtlStore`) — composed by `ReportService`, which resolves annotations through the catalog service and validates via `@regis/backstage-plugin-regis-common`. A `CatalogAggregator` runs on the scheduler to warm summaries for the catalog page. Phase 2 (Approach C) swaps the store/source impls behind the same interfaces.

**Tech Stack:** TypeScript, Backstage **v1.51** new backend system (`createBackendPlugin`, `coreServices`), `@backstage/plugin-catalog-node` (`catalogServiceRef`), `@backstage/backend-test-utils` (`startTestBackend`), supertest, Jest 30, yarn 4.

> **Prerequisite:** Phase 1a complete (`@regis/backstage-plugin-regis-common` published in the workspace). Work continues in `regis-backstage/` on a branch `feat/phase-1b-backend`.
>
> **Validated conventions (from 1a execution — apply throughout):**
>
> - Run tests via the **root runner**: `CI=true yarn test <pattern>` (NOT `yarn workspace X test`).
> - Every package needs `.eslintrc.js` → `module.exports = require('@backstage/cli/config/eslint-factory')(__dirname);`.
> - `yarn tsc` (root) before `backstage-cli package build`; or `yarn build:all`.
> - Node 22; yarn 4 (`yarn add <pkg>` from the package dir, no `-W`).

---

## File Structure (Phase 1b)

```text
plugins/regis-backend/
  package.json                 # role: backend-plugin, depends on regis-common
  .eslintrc.js
  README.md
  src/
    index.ts                   # export { regisPlugin as default }
    plugin.ts                  # createBackendPlugin + scheduler wiring
    router.ts                  # express routes + error->HTTP mapping
    router.test.ts             # integration via startTestBackend + supertest
    service/
      ReportSource.ts          # interface + HttpReportSource + ReportFetchError
      ReportSource.test.ts
      ReportStore.ts           # interface + InMemoryTtlStore
      ReportStore.test.ts
      ReportService.ts         # orchestration + NoReportError
      ReportService.test.ts
      CatalogAggregator.ts     # scheduler-warmed summaries
      CatalogAggregator.test.ts
      types.ts                 # ReportEnvelope, ReportSummary
```

---

## Task 1: Scaffold the backend plugin package

**Files:**

- Create: `plugins/regis-backend/package.json`, `.eslintrc.js`, `README.md`, `src/index.ts`

- [ ] **Step 1: Write the manifest**

Create `plugins/regis-backend/package.json`:

```json
{
  "name": "@regis/backstage-plugin-regis-backend",
  "version": "0.1.0",
  "description": "Backend plugin serving Regis reports to the Regis Backstage frontend.",
  "license": "Apache-2.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.cjs.js",
    "types": "dist/index.d.ts"
  },
  "backstage": {
    "role": "backend-plugin",
    "pluginId": "regis"
  },
  "scripts": {
    "start": "backstage-cli package start",
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean",
    "prepack": "backstage-cli package prepack",
    "postpack": "backstage-cli package postpack"
  },
  "dependencies": {
    "@backstage/backend-plugin-api": "^1.4.0",
    "@backstage/catalog-client": "^1.9.0",
    "@backstage/catalog-model": "^1.7.0",
    "@backstage/errors": "^1.2.7",
    "@backstage/plugin-catalog-node": "^1.17.0",
    "@regis/backstage-plugin-regis-common": "workspace:^",
    "express": "^4.19.2",
    "express-promise-router": "^4.1.1"
  },
  "devDependencies": {
    "@backstage/backend-test-utils": "^1.7.0",
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0"
  },
  "files": ["dist"]
}
```

> **Watch-point:** version ranges are lower bounds; `yarn install` resolves to what the v1.51 lockfile already pins. If a `@backstage/*` range is unsatisfiable, align it to the version `packages/backend` already depends on.

- [ ] **Step 2: Add eslint config + placeholder index + README**

Create `plugins/regis-backend/.eslintrc.js`:

```js
module.exports = require("@backstage/cli/config/eslint-factory")(__dirname);
```

Create `plugins/regis-backend/src/index.ts`:

```ts
export {};
```

Create `plugins/regis-backend/README.md`:

```markdown
# @regis/backstage-plugin-regis-backend

Backend for the Regis Backstage plugin. Resolves the `regis.io/report-url`
annotation, fetches + validates + caches reports, aggregates annotated entities
for the catalog page, and serves `GET /report`, `GET /reports`, `GET /health`.
```

- [ ] **Step 3: Install and verify**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage
yarn install
```

Expected: `@regis/backstage-plugin-regis-backend` linked; `@regis/backstage-plugin-regis-common` resolves via `workspace:^`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold regis-backend plugin package"
```

---

## Task 2: `ReportSource` + `HttpReportSource` (TDD)

**Files:**

- Create: `plugins/regis-backend/src/service/ReportSource.ts`
- Test: `plugins/regis-backend/src/service/ReportSource.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/ReportSource.test.ts`:

```ts
import { HttpReportSource, ReportFetchError } from "./ReportSource";

describe("HttpReportSource", () => {
  it("returns parsed JSON on 200", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: 1 }),
    });
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch("https://h/r.json")).resolves.toEqual({
      schemaVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://h/r.json",
      expect.any(Object),
    );
  });

  it("throws ReportFetchError on non-200", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch("https://h/r.json")).rejects.toThrow(
      ReportFetchError,
    );
  });

  it("wraps network errors as ReportFetchError", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const source = new HttpReportSource(fetchImpl as unknown as typeof fetch);
    await expect(source.fetch("https://h/r.json")).rejects.toThrow(
      ReportFetchError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test ReportSource
```

Expected: FAIL — `Cannot find module './ReportSource'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/service/ReportSource.ts`:

```ts
/** Fetches the raw (unvalidated) report JSON for a given URL. */
export interface ReportSource {
  fetch(url: string): Promise<unknown>;
}

/** Thrown when a report URL cannot be retrieved. */
export class ReportFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(
      `failed to fetch report from ${url}` +
        (status ? ` (HTTP ${status})` : `: ${String(cause)}`),
    );
    this.name = "ReportFetchError";
  }
}

/** Server-side HTTP fetch — solves CORS and centralises retries/timeouts. */
export class HttpReportSource implements ReportSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetch(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { redirect: "follow" });
    } catch (err) {
      throw new ReportFetchError(url, undefined, err);
    }
    if (!res.ok) {
      throw new ReportFetchError(url, res.status);
    }
    return res.json();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test ReportSource
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/ReportSource.ts plugins/regis-backend/src/service/ReportSource.test.ts
git commit -m "feat: add HttpReportSource with structured fetch errors"
```

---

## Task 3: `ReportStore` + `InMemoryTtlStore` (TDD)

**Files:**

- Create: `plugins/regis-backend/src/service/types.ts`
- Create: `plugins/regis-backend/src/service/ReportStore.ts`
- Test: `plugins/regis-backend/src/service/ReportStore.test.ts`

- [ ] **Step 1: Write the shared types**

Create `plugins/regis-backend/src/service/types.ts`:

```ts
import type { Report } from "@regis/backstage-plugin-regis-common";

/** A report plus retrieval metadata, as served by `GET /report`. */
export interface ReportEnvelope {
  report: Report;
  meta: { fetchedAt: string; source: string; schemaVersion: number };
}

/** Compact per-entity row for the catalog page (`GET /reports`). */
export interface ReportSummary {
  entityRef: string;
  status: "ok" | "error" | "pending";
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `plugins/regis-backend/src/service/ReportStore.test.ts`:

```ts
import { InMemoryTtlStore } from "./ReportStore";
import type { ReportEnvelope } from "./types";

const env = (): ReportEnvelope => ({
  report: { schemaVersion: 1 } as ReportEnvelope["report"],
  meta: { fetchedAt: "2026-06-01T00:00:00Z", source: "http", schemaVersion: 1 },
});

describe("InMemoryTtlStore", () => {
  it("returns a stored value within the TTL", () => {
    let now = 1000;
    const store = new InMemoryTtlStore(5000, () => now);
    store.set("k", env());
    now = 4000;
    expect(store.get("k")).toBeDefined();
  });

  it("expires a value past the TTL", () => {
    let now = 1000;
    const store = new InMemoryTtlStore(5000, () => now);
    store.set("k", env());
    now = 7000;
    expect(store.get("k")).toBeUndefined();
  });

  it("returns undefined for unknown keys", () => {
    const store = new InMemoryTtlStore(5000, () => 0);
    expect(store.get("missing")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
CI=true yarn test ReportStore
```

Expected: FAIL — `Cannot find module './ReportStore'`.

- [ ] **Step 4: Write the implementation**

Create `plugins/regis-backend/src/service/ReportStore.ts`:

```ts
import type { ReportEnvelope } from "./types";

/** Caches report envelopes by key (entityRef). Phase 2 adds a Knex impl. */
export interface ReportStore {
  get(key: string): ReportEnvelope | undefined;
  set(key: string, value: ReportEnvelope): void;
}

interface Entry {
  value: ReportEnvelope;
  expiresAt: number;
}

/** Bounded-TTL in-memory store. `now` is injectable for deterministic tests. */
export class InMemoryTtlStore implements ReportStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): ReportEnvelope | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: ReportEnvelope): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
CI=true yarn test ReportStore
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/service/types.ts plugins/regis-backend/src/service/ReportStore.ts plugins/regis-backend/src/service/ReportStore.test.ts
git commit -m "feat: add InMemoryTtlStore for report caching"
```

---

## Task 4: `ReportService` (TDD)

**Files:**

- Create: `plugins/regis-backend/src/service/ReportService.ts`
- Test: `plugins/regis-backend/src/service/ReportService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/ReportService.test.ts`:

```ts
import { mockServices } from "@backstage/backend-test-utils";
import { UnsupportedSchemaVersionError } from "@regis/backstage-plugin-regis-common";
import { ReportService, NoReportError } from "./ReportService";
import { InMemoryTtlStore } from "./ReportStore";
import type { ReportSource } from "./ReportSource";
import validReport from "../../../regis-common/src/__fixtures__/report.valid.json";
import futureReport from "../../../regis-common/src/__fixtures__/report.future.json";

const entityWith = (url?: string) => ({
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "svc",
    annotations: url ? { "regis.io/report-url": url } : {},
  },
  spec: {},
});

const credentials = mockServices.credentials.user();

function makeService(opts: {
  entity?: ReturnType<typeof entityWith>;
  source: ReportSource;
}) {
  const catalog = {
    getEntityByRef: jest.fn().mockResolvedValue(opts.entity),
  };
  return new ReportService({
    catalog: catalog as any,
    source: opts.source,
    store: new InMemoryTtlStore(60_000, () => 1000),
    logger: mockServices.logger.mock(),
  });
}

describe("ReportService.getReport", () => {
  it("fetches, validates, caches and returns an envelope", async () => {
    const source = { fetch: jest.fn().mockResolvedValue(validReport) };
    const svc = makeService({ entity: entityWith("https://h/r.json"), source });

    const first = await svc.getReport("component:default/svc", credentials);
    expect(first.report.request.repository).toBe("library/nginx");
    expect(first.meta.schemaVersion).toBe(1);

    // second call is served from cache (source not hit again)
    await svc.getReport("component:default/svc", credentials);
    expect(source.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws NoReportError when the annotation is absent", async () => {
    const source = { fetch: jest.fn() };
    const svc = makeService({ entity: entityWith(undefined), source });
    await expect(
      svc.getReport("component:default/svc", credentials),
    ).rejects.toThrow(NoReportError);
    expect(source.fetch).not.toHaveBeenCalled();
  });

  it("propagates UnsupportedSchemaVersionError from the validator", async () => {
    const source = { fetch: jest.fn().mockResolvedValue(futureReport) };
    const svc = makeService({ entity: entityWith("https://h/r.json"), source });
    await expect(
      svc.getReport("component:default/svc", credentials),
    ).rejects.toThrow(UnsupportedSchemaVersionError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test ReportService
```

Expected: FAIL — `Cannot find module './ReportService'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/service/ReportService.ts`:

```ts
import type { LoggerService } from "@backstage/backend-plugin-api";
import type { BackstageCredentials } from "@backstage/backend-plugin-api";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import {
  getRegisReportUrl,
  validateReport,
} from "@regis/backstage-plugin-regis-common";
import type { ReportSource } from "./ReportSource";
import type { ReportStore } from "./ReportStore";
import type { ReportEnvelope } from "./types";

/** Thrown when an entity has no `regis.io/report-url` annotation. */
export class NoReportError extends Error {
  constructor(entityRef: string) {
    super(`no Regis report annotation on ${entityRef}`);
    this.name = "NoReportError";
  }
}

export interface ReportServiceDeps {
  catalog: CatalogService;
  source: ReportSource;
  store: ReportStore;
  logger: LoggerService;
  now?: () => Date;
}

export class ReportService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReportServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async getReport(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<ReportEnvelope> {
    const cached = this.deps.store.get(entityRef);
    if (cached) return cached;

    const entity = await this.deps.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    const url = entity && getRegisReportUrl(entity);
    if (!url) throw new NoReportError(entityRef);

    const raw = await this.deps.source.fetch(url);
    const report = validateReport(raw); // throws Unsupported*/ReportSchemaError
    const envelope: ReportEnvelope = {
      report,
      meta: {
        fetchedAt: this.now().toISOString(),
        source: "http",
        schemaVersion: report.schemaVersion,
      },
    };
    this.deps.store.set(entityRef, envelope);
    return envelope;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test ReportService
```

Expected: PASS (3 tests).

> **Watch-point:** confirm `mockServices.credentials.user()` and `CatalogService.getEntityByRef(ref, { credentials })` signatures against the installed `@backstage/backend-test-utils` / `@backstage/plugin-catalog-node`. If `getEntityByRef` is not on `CatalogService` in your version, use `catalogServiceRef`'s `getEntities`/`getEntityByRef` equivalent or the `CatalogApi` from `@backstage/catalog-client`.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/ReportService.ts plugins/regis-backend/src/service/ReportService.test.ts
git commit -m "feat: add ReportService orchestrating fetch, validate, cache"
```

---

## Task 5: `CatalogAggregator` (TDD)

**Files:**

- Create: `plugins/regis-backend/src/service/CatalogAggregator.ts`
- Test: `plugins/regis-backend/src/service/CatalogAggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis-backend/src/service/CatalogAggregator.test.ts`:

```ts
import { mockServices } from "@backstage/backend-test-utils";
import { CatalogAggregator } from "./CatalogAggregator";

const credentials = mockServices.auth().getOwnServiceCredentials
  ? undefined
  : undefined;

function makeAggregator(refs: string[], getReport: jest.Mock) {
  const catalog = {
    getEntities: jest.fn().mockResolvedValue({
      items: refs.map((name) => ({
        kind: "Component",
        metadata: { name, namespace: "default" },
      })),
    }),
  };
  const auth = mockServices.auth();
  return new CatalogAggregator({
    catalog: catalog as any,
    auth,
    reportService: { getReport } as any,
    logger: mockServices.logger.mock(),
    concurrency: 2,
  });
}

describe("CatalogAggregator", () => {
  it("builds one summary per annotated entity", async () => {
    const getReport = jest.fn().mockResolvedValue({
      report: { tier: "Gold", rules_summary: { score: 90, by_tag: {} } },
      meta: {},
    });
    const agg = makeAggregator(["a", "b"], getReport);
    await agg.refresh();
    const snap = agg.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ status: "ok", tier: "Gold", score: 90 });
  });

  it("is resilient: a failing entity becomes status=error, others ok", async () => {
    const getReport = jest
      .fn()
      .mockResolvedValueOnce({
        report: { tier: "Silver", rules_summary: { score: 70, by_tag: {} } },
        meta: {},
      })
      .mockRejectedValueOnce(new Error("boom"));
    const agg = makeAggregator(["ok", "bad"], getReport);
    await agg.refresh();
    const byStatus = agg
      .getSnapshot()
      .map((s) => s.status)
      .sort();
    expect(byStatus).toEqual(["error", "ok"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test CatalogAggregator
```

Expected: FAIL — `Cannot find module './CatalogAggregator'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis-backend/src/service/CatalogAggregator.ts`:

```ts
import type { AuthService, LoggerService } from "@backstage/backend-plugin-api";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import { CATALOG_FILTER_EXISTS } from "@backstage/catalog-client";
import { stringifyEntityRef } from "@backstage/catalog-model";
import { REGIS_ANNOTATION_REPORT_URL } from "@regis/backstage-plugin-regis-common";
import type { ReportService } from "./ReportService";
import type { ReportSummary } from "./types";

export interface CatalogAggregatorDeps {
  catalog: CatalogService;
  auth: AuthService;
  reportService: ReportService;
  logger: LoggerService;
  concurrency?: number;
}

/** Maps an array through `fn` with a bounded number of in-flight promises. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export class CatalogAggregator {
  private snapshot: ReportSummary[] = [];

  constructor(private readonly deps: CatalogAggregatorDeps) {}

  getSnapshot(): ReportSummary[] {
    return this.snapshot;
  }

  async refresh(): Promise<void> {
    const credentials = await this.deps.auth.getOwnServiceCredentials();
    const { items } = await this.deps.catalog.getEntities(
      {
        filter: {
          [`metadata.annotations.${REGIS_ANNOTATION_REPORT_URL}`]:
            CATALOG_FILTER_EXISTS,
        },
      },
      { credentials },
    );

    this.snapshot = await mapBounded(
      items,
      this.deps.concurrency ?? 8,
      async (entity) => {
        const entityRef = stringifyEntityRef(entity);
        try {
          const { report } = await this.deps.reportService.getReport(
            entityRef,
            credentials,
          );
          const byTagScores: Record<string, number> = {};
          for (const [tag, g] of Object.entries(
            report.rules_summary?.by_tag ?? {},
          )) {
            byTagScores[tag] = (g as { score: number }).score;
          }
          return {
            entityRef,
            status: "ok" as const,
            tier: report.tier ?? null,
            score: report.rules_summary?.score,
            byTag: byTagScores,
          };
        } catch (err) {
          this.deps.logger.warn(
            `regis: failed to aggregate ${entityRef}: ${err}`,
          );
          return {
            entityRef,
            status: "error" as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test CatalogAggregator
```

Expected: PASS (2 tests).

> **Watch-point:** confirm `auth.getOwnServiceCredentials()` and `catalog.getEntities(request, { credentials })` against the installed versions. `mockServices.auth()` from `@backstage/backend-test-utils` provides `getOwnServiceCredentials`.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis-backend/src/service/CatalogAggregator.ts plugins/regis-backend/src/service/CatalogAggregator.test.ts
git commit -m "feat: add CatalogAggregator with bounded concurrency and per-entity resilience"
```

---

## Task 6: Router with error→HTTP mapping

**Files:**

- Create: `plugins/regis-backend/src/router.ts`

- [ ] **Step 1: Write the router**

Create `plugins/regis-backend/src/router.ts`:

```ts
import type {
  HttpAuthService,
  LoggerService,
} from "@backstage/backend-plugin-api";
import { InputError } from "@backstage/errors";
import {
  ReportSchemaError,
  UnsupportedSchemaVersionError,
} from "@regis/backstage-plugin-regis-common";
import express from "express";
import Router from "express-promise-router";
import { ReportFetchError } from "./service/ReportSource";
import { NoReportError, ReportService } from "./service/ReportService";
import type { CatalogAggregator } from "./service/CatalogAggregator";

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  reportService: ReportService;
  aggregator: CatalogAggregator;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, reportService, aggregator } = options;
  const router = Router();
  router.use(express.json());

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/report", async (req, res) => {
    const entityRef = req.query.entityRef;
    if (typeof entityRef !== "string" || !entityRef) {
      throw new InputError('query parameter "entityRef" is required');
    }
    const credentials = await httpAuth.credentials(req);
    const envelope = await reportService.getReport(entityRef, credentials);
    res.json(envelope);
  });

  router.get("/reports", async (req, res) => {
    await httpAuth.credentials(req); // require an authenticated principal
    res.json(aggregator.getSnapshot());
  });

  // Error → HTTP mapping. NoReport=404; version/schema=422 (distinct messages);
  // fetch=502; everything else falls through to the default 500 handler.
  router.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err instanceof NoReportError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof UnsupportedSchemaVersionError) {
        res
          .status(422)
          .json({ error: err.message, kind: "unsupported-version" });
      } else if (err instanceof ReportSchemaError) {
        res.status(422).json({ error: err.message, kind: "invalid-report" });
      } else if (err instanceof ReportFetchError) {
        res.status(502).json({ error: err.message });
      } else {
        next(err);
      }
    },
  );

  return router;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage && yarn tsc
```

Expected: passes (the router compiles; it is exercised in Task 7).

- [ ] **Step 3: Commit**

```bash
git add plugins/regis-backend/src/router.ts
git commit -m "feat: add regis-backend router with error-to-status mapping"
```

---

## Task 7: Plugin wiring + integration test

**Files:**

- Create: `plugins/regis-backend/src/plugin.ts`
- Modify: `plugins/regis-backend/src/index.ts`
- Test: `plugins/regis-backend/src/router.test.ts`

- [ ] **Step 1: Write the plugin**

Create `plugins/regis-backend/src/plugin.ts`:

```ts
import {
  coreServices,
  createBackendPlugin,
} from "@backstage/backend-plugin-api";
import { catalogServiceRef } from "@backstage/plugin-catalog-node";
import { createRouter } from "./router";
import { HttpReportSource } from "./service/ReportSource";
import { InMemoryTtlStore } from "./service/ReportStore";
import { ReportService } from "./service/ReportService";
import { CatalogAggregator } from "./service/CatalogAggregator";

/** The Regis backend plugin (new backend system). */
export const regisPlugin = createBackendPlugin({
  pluginId: "regis",
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
        catalog: catalogServiceRef,
      },
      async init({
        logger,
        httpRouter,
        httpAuth,
        auth,
        scheduler,
        config,
        catalog,
      }) {
        const ttlMs = config.getOptionalNumber("regis.cacheTtlSeconds") ?? 1800;
        const store = new InMemoryTtlStore(ttlMs * 1000);
        const source = new HttpReportSource();
        const reportService = new ReportService({
          catalog,
          source,
          store,
          logger,
        });
        const aggregator = new CatalogAggregator({
          catalog,
          auth,
          reportService,
          logger,
        });

        httpRouter.use(
          await createRouter({ logger, httpAuth, reportService, aggregator }),
        );
        // /health is safe to expose unauthenticated.
        httpRouter.addAuthPolicy({ path: "/health", allow: "unauthenticated" });

        await scheduler.scheduleTask({
          id: "regis-aggregate",
          frequency: { minutes: 30 },
          timeout: { minutes: 5 },
          fn: async () => {
            await aggregator.refresh();
          },
        });
      },
    });
  },
});
```

- [ ] **Step 2: Export the plugin**

Replace `plugins/regis-backend/src/index.ts`:

```ts
export { regisPlugin as default } from "./plugin";
```

- [ ] **Step 3: Write the integration test**

Create `plugins/regis-backend/src/router.test.ts`:

```ts
import { startTestBackend } from "@backstage/backend-test-utils";
import { catalogServiceMock } from "@backstage/plugin-catalog-node/testUtils";
import request from "supertest";
import { regisPlugin } from "./plugin";

const annotatedEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "svc",
    namespace: "default",
    annotations: { "regis.io/report-url": "https://host/report.json" },
  },
  spec: { type: "service", owner: "team", lifecycle: "production" },
};

describe("regis-backend routes", () => {
  it("GET /health returns ok without auth", async () => {
    const { server } = await startTestBackend({
      features: [
        regisPlugin,
        catalogServiceMock.factory({ entities: [annotatedEntity] }),
      ],
    });
    const res = await request(server).get("/api/regis/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /report?entityRef=... 404s when annotation is missing", async () => {
    const bare = {
      ...annotatedEntity,
      metadata: { name: "bare", namespace: "default", annotations: {} },
    };
    const { server } = await startTestBackend({
      features: [regisPlugin, catalogServiceMock.factory({ entities: [bare] })],
    });
    const res = await request(server).get(
      "/api/regis/report?entityRef=component:default/bare",
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run the integration test**

```bash
CI=true yarn test router
```

Expected: PASS (2 tests).

> **Watch-points (verify against v1.51 at run time):**
>
> - `httpRouter.addAuthPolicy({ path, allow: 'unauthenticated' })` is the documented way to open `/health`; confirm the exact shape.
> - `catalogServiceMock.factory({ entities })` lives in `@backstage/plugin-catalog-node/testUtils` — confirm the import path.
> - The default backend wires service auth so the scheduled `aggregator.refresh()` can call the catalog with own-service credentials. If `getEntities` returns 401 in a real run, ensure the catalog plugin is present and service auth is configured.

- [ ] **Step 5: Lint, typecheck, build**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage
yarn tsc
( cd plugins/regis-backend && node ../../node_modules/.bin/backstage-cli package lint )
yarn build:all
```

Expected: lint clean; build emits `plugins/regis-backend/dist`.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis-backend/src/plugin.ts plugins/regis-backend/src/index.ts plugins/regis-backend/src/router.test.ts
git commit -m "feat: wire regis-backend plugin with scheduler and integration tests"
```

---

## Task 8: Changeset

**Files:**

- Create: `.changeset/regis-backend-initial.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/regis-backend-initial.md`:

```markdown
---
"@regis/backstage-plugin-regis-backend": minor
---

Initial release: backend serving Regis reports — annotation resolution,
fetch + validate + TTL cache, catalog aggregation on a scheduler, and the
`/report`, `/reports`, `/health` routes under default auth.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/regis-backend-initial.md
git commit -m "docs: add changeset for regis-backend initial release"
```

---

## Self-Review

**1. Spec coverage (backend slice):** `ReportSource`/`HttpReportSource` (Task 2), `ReportStore`/`InMemoryTtlStore` (Task 3), `ReportService` with annotation resolution + validation + cache + `NoReportError` (Task 4), `CatalogAggregator` bounded-concurrency + per-entity resilience (Task 5), REST API `/report` + `/reports` + `/health` with the two distinct `422`s and `404`/`502` (Task 6), `createBackendPlugin` + scheduler + default-auth + `/health` open (Task 7). All map to spec §Components/§Data flow/§Error handling. ✓

**2. Placeholder scan:** every code step is complete; commands have expected output; watch-points flag version-sensitive APIs (not placeholders — the code is written, the note says "verify"). ✓

**3. Type consistency:** `ReportEnvelope`/`ReportSummary` (types.ts) are used identically across store, service, aggregator, router. `getReport(entityRef, credentials)` signature matches between `ReportService`, its test, the aggregator, and the router. `NoReportError`/`ReportFetchError` are defined before the router imports them. Validator errors (`UnsupportedSchemaVersionError`, `ReportSchemaError`) come from `regis-common` (Phase 1a). ✓

**Watch-points consolidated:** catalog service signatures (`getEntityByRef`/`getEntities` with `{ credentials }`), `httpRouter.addAuthPolicy`, `catalogServiceMock` import path, and service-auth for the scheduled refresh — all to confirm against the installed v1.51 packages, exactly as Phase 1a confirmed `common-library`/eslintrc/tsc-before-build by running them.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-regis-backstage-phase1b-backend.md`. Execute with subagent-driven-development or executing-plans (inline recommended again — the catalog/auth wiring is the version-sensitive part most likely to need real-time adaptation).
