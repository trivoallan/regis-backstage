# Regis Backstage Plugin — Phase 1c: Frontend Plugin + Demo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@regis/backstage-plugin-regis` — a new-frontend-system plugin rendering Regis posture natively (MUI): a `regisApiRef` client, an entity **Regis tab**, an Overview **scorecard card**, and a global **catalog page** — then wire the demo app so it all runs end-to-end.

**Architecture:** A thin `RegisClient` (DiscoveryApi + FetchApi) calls the Phase 1b backend. Three presentational components consume it; all data shapes come from `@regis/backstage-plugin-regis-common`. Surfaces are registered as **new-frontend-system blueprints** (`ApiBlueprint`, `EntityContentBlueprint`, `EntityCardBlueprint`, `PageBlueprint`, `NavItemBlueprint`); entity surfaces declare an annotation **`filter`** so they appear only on entities with a report.

**Tech Stack:** TypeScript, Backstage **v1.51** new frontend system (`createFrontendPlugin`, `@backstage/frontend-plugin-api`, `@backstage/plugin-catalog-react/alpha` blueprints), `@backstage/core-components` (MUI), `@backstage/frontend-test-utils` (`renderInTestApp`, `TestApiProvider`), Jest 30, yarn 4.

> **Prerequisite:** Phases 1a + 1b complete. Work continues in `regis-backstage/` on a branch `feat/phase-1c-frontend`.
>
> **Validated conventions (from 1a):** root test runner `CI=true yarn test <pattern>`; per-package `.eslintrc.js`; `yarn tsc` before build; Node 22; yarn 4.
>
> **NFS caveat (from the design spec):** several catalog entity blueprints are exported from `@backstage/plugin-catalog-react/alpha`, and `createFrontendPlugin`/blueprint `.make()` params have evolved across releases. **The demo app (Task 8) is the canary** — `yarn start` + `yarn build:all` are the authority. Each blueprint task carries a watch-point; verify the exact `.make()` shape against the installed v1.51 packages, exactly as Phase 1a verified `common-library`/eslintrc by running them.

---

## File Structure (Phase 1c)

```text
plugins/regis/
  package.json                 # role: frontend-plugin, depends on regis-common
  .eslintrc.js
  README.md
  src/
    index.ts                   # export { regisPlugin as default } + named extensions
    plugin.tsx                 # createFrontendPlugin + blueprints
    routes.ts                  # rootRouteRef for the catalog page
    api/
      RegisApi.ts              # regisApiRef + RegisApi interface + DTOs
      RegisClient.ts           # DiscoveryApi+FetchApi implementation
      RegisClient.test.ts
    components/
      RegisScorecardCard.tsx   # Overview card
      RegisScorecardCard.test.tsx
      RegisTabContent.tsx      # full report tab
      RegisTabContent.test.tsx
      RegisCatalogPage.tsx     # global table
      RegisCatalogPage.test.tsx
      format.ts                # tier color, score helpers (pure)
      format.test.ts
packages/app/src/App.tsx       # register the plugin (demo)
packages/backend/src/index.ts  # add the backend plugin (demo)
examples/entities.yaml         # a demo Component annotated with report-url
```

---

## Task 1: Scaffold the frontend plugin package

**Files:**

- Create: `plugins/regis/package.json`, `.eslintrc.js`, `README.md`, `src/index.ts`

- [ ] **Step 1: Write the manifest**

Create `plugins/regis/package.json`:

```json
{
  "name": "@regis/backstage-plugin-regis",
  "version": "0.1.0",
  "description": "Frontend plugin rendering Regis container posture in Backstage.",
  "license": "Apache-2.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.cjs.js",
    "module": "dist/index.esm.js",
    "types": "dist/index.d.ts"
  },
  "backstage": {
    "role": "frontend-plugin",
    "pluginId": "regis"
  },
  "sideEffects": false,
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
    "@backstage/catalog-model": "^1.7.0",
    "@backstage/core-components": "^0.17.0",
    "@backstage/core-plugin-api": "^1.10.0",
    "@backstage/frontend-plugin-api": "^0.10.0",
    "@backstage/plugin-catalog-react": "^1.15.0",
    "@regis/backstage-plugin-regis-common": "workspace:^",
    "react-use": "^17.5.0"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@backstage/frontend-test-utils": "^0.3.0",
    "@backstage/test-utils": "^1.7.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0"
  },
  "files": ["dist"]
}
```

> **Watch-point:** treat the `@backstage/*` ranges as lower bounds; on `yarn install` align any unsatisfiable range to what `packages/app` already pins in the v1.51 lockfile.

- [ ] **Step 2: eslint config + placeholder index + README**

Create `plugins/regis/.eslintrc.js`:

```js
module.exports = require("@backstage/cli/config/eslint-factory")(__dirname);
```

Create `plugins/regis/src/index.ts`:

```ts
export {};
```

Create `plugins/regis/README.md`:

```markdown
# @regis/backstage-plugin-regis

Frontend for the Regis Backstage plugin. Adds a "Regis" entity tab, an Overview
scorecard card, and a global catalog page. Entity surfaces appear only on
entities carrying the `regis.io/report-url` annotation. Requires
`@regis/backstage-plugin-regis-backend`.
```

- [ ] **Step 3: Install + commit**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage
yarn install
git add -A && git commit -m "feat: scaffold regis frontend plugin package"
```

---

## Task 2: API ref + DTOs

**Files:**

- Create: `plugins/regis/src/api/RegisApi.ts`

- [ ] **Step 1: Write the API surface**

Create `plugins/regis/src/api/RegisApi.ts`:

```ts
import { createApiRef } from "@backstage/frontend-plugin-api";
import type { Report } from "@regis/backstage-plugin-regis-common";

export interface ReportEnvelope {
  report: Report;
  meta: { fetchedAt: string; source: string; schemaVersion: number };
}

export interface ReportSummary {
  entityRef: string;
  status: "ok" | "error" | "pending";
  tier?: string | null;
  score?: number;
  byTag?: Record<string, number>;
  error?: string;
}

export interface RegisApi {
  getReport(entityRef: string): Promise<ReportEnvelope>;
  listReports(): Promise<ReportSummary[]>;
}

export const regisApiRef = createApiRef<RegisApi>({
  id: "plugin.regis.service",
});
```

> **Watch-point:** in NFS, `createApiRef` is re-exported from `@backstage/frontend-plugin-api`. If your version only exposes it from `@backstage/core-plugin-api`, import it from there — the ref shape is identical.

- [ ] **Step 2: Commit**

```bash
git add plugins/regis/src/api/RegisApi.ts
git commit -m "feat: add regisApiRef and report DTOs"
```

---

## Task 3: `RegisClient` (TDD)

**Files:**

- Create: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/api/RegisClient.test.ts`:

```ts
import { RegisClient } from "./RegisClient";

const discoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue("http://localhost:7007/api/regis"),
};

function clientWith(fetchImpl: jest.Mock) {
  return new RegisClient({
    discoveryApi: discoveryApi as any,
    fetchApi: { fetch: fetchImpl } as any,
  });
}

describe("RegisClient", () => {
  it("GETs /report with an encoded entityRef", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ report: { schemaVersion: 1 }, meta: {} }),
    });
    const client = clientWith(fetchImpl);
    const out = await client.getReport("component:default/svc");
    expect(out.report.schemaVersion).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:7007/api/regis/report?entityRef=component%3Adefault%2Fsvc",
    );
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "bad" }),
    });
    const client = clientWith(fetchImpl);
    await expect(client.getReport("component:default/svc")).rejects.toThrow(
      /422|bad/,
    );
  });

  it("GETs /reports for the catalog page", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ entityRef: "component:default/svc", status: "ok" }],
    });
    const client = clientWith(fetchImpl);
    const rows = await client.listReports();
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test RegisClient
```

Expected: FAIL — `Cannot find module './RegisClient'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/api/RegisClient.ts`:

```ts
import type { DiscoveryApi, FetchApi } from "@backstage/core-plugin-api";
import type { RegisApi, ReportEnvelope, ReportSummary } from "./RegisApi";

export class RegisClient implements RegisApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl("regis");
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchApi.fetch(`${await this.baseUrl()}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `Regis request failed (${res.status}): ${
          (body as { error?: string }).error ?? res.statusText
        }`,
      );
    }
    return res.json() as Promise<T>;
  }

  async getReport(entityRef: string): Promise<ReportEnvelope> {
    return this.getJson<ReportEnvelope>(
      `/report?entityRef=${encodeURIComponent(entityRef)}`,
    );
  }

  async listReports(): Promise<ReportSummary[]> {
    return this.getJson<ReportSummary[]>("/reports");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test RegisClient
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat: add RegisClient backend API client"
```

---

## Task 4: Pure formatting helpers (TDD)

**Files:**

- Create: `plugins/regis/src/components/format.ts`
- Test: `plugins/regis/src/components/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/format.test.ts`:

```ts
import { tierColor, scoreStatus } from "./format";

describe("formatting helpers", () => {
  it("maps tiers to colors", () => {
    expect(tierColor("Gold")).toBe("#d4af37");
    expect(tierColor("Silver")).toBe("#9ca3af");
    expect(tierColor("Bronze")).toBe("#cd7f32");
    expect(tierColor(null)).toBe("#9ca3af");
    expect(tierColor(undefined)).toBe("#9ca3af");
  });

  it("maps scores to a status bucket", () => {
    expect(scoreStatus(100)).toBe("ok");
    expect(scoreStatus(80)).toBe("warning");
    expect(scoreStatus(40)).toBe("error");
    expect(scoreStatus(undefined)).toBe("warning");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test components/format
```

Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/format.ts`:

```ts
export type ScoreStatus = "ok" | "warning" | "error";

/** Tier badge color. Unknown/missing tiers fall back to neutral grey. */
export function tierColor(tier: string | null | undefined): string {
  switch ((tier ?? "").toLowerCase()) {
    case "gold":
      return "#d4af37";
    case "bronze":
      return "#cd7f32";
    case "silver":
      return "#9ca3af";
    default:
      return "#9ca3af";
  }
}

/** Bucket a 0-100 score for status styling. Missing score → warning. */
export function scoreStatus(score: number | undefined): ScoreStatus {
  if (score === undefined) return "warning";
  if (score >= 90) return "ok";
  if (score >= 60) return "warning";
  return "error";
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test components/format
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/format.ts plugins/regis/src/components/format.test.ts
git commit -m "feat: add tier/score formatting helpers"
```

---

## Task 5: `RegisScorecardCard` (TDD)

**Files:**

- Create: `plugins/regis/src/components/RegisScorecardCard.tsx`
- Test: `plugins/regis/src/components/RegisScorecardCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisScorecardCard.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";
import {
  renderInTestApp,
  TestApiProvider,
} from "@backstage/frontend-test-utils";
import { EntityProvider } from "@backstage/plugin-catalog-react";
import { regisApiRef } from "../api/RegisApi";
import { RegisScorecardCard } from "./RegisScorecardCard";

const entity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "svc",
    annotations: { "regis.io/report-url": "https://h/r.json" },
  },
  spec: {},
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe("RegisScorecardCard", () => {
  it("shows tier and score", async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: "Gold",
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: "", source: "http", schemaVersion: 1 },
      }),
    });
    expect(await screen.findByText("Gold")).toBeInTheDocument();
    expect(await screen.findByText(/100/)).toBeInTheDocument();
  });

  it("renders an error panel when the API fails", async () => {
    await renderCard({
      getReport: async () => {
        throw new Error("boom");
      },
    });
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test RegisScorecardCard
```

Expected: FAIL — `Cannot find module './RegisScorecardCard'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/RegisScorecardCard.tsx`:

```tsx
import React from "react";
import useAsync from "react-use/lib/useAsync";
import { useApi } from "@backstage/core-plugin-api";
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from "@backstage/core-components";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef } from "@backstage/catalog-model";
import { Chip, Typography } from "@material-ui/core";
import { regisApiRef } from "../api/RegisApi";
import { tierColor } from "./format";

/** Compact Overview card: tier badge + score + pass/fail counts. */
export function RegisScorecardCard() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);

  const { value, loading, error } = useAsync(() => api.getReport(ref), [ref]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const report = value!.report;
  const score = report.rules_summary?.score;
  const total = report.rules_summary?.total?.length ?? 0;
  const passed = report.rules_summary?.passed?.length ?? 0;

  return (
    <InfoCard title="Regis posture">
      {report.tier && (
        <Chip
          label={report.tier}
          style={{ backgroundColor: tierColor(report.tier), color: "#fff" }}
        />
      )}
      {score !== undefined && <Typography variant="h4">{score}/100</Typography>}
      <Typography variant="body2">
        {passed}/{total} rules passed
      </Typography>
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test RegisScorecardCard
```

Expected: PASS (2 tests).

> **Watch-point:** `@material-ui/core` (MUI v4) is the Backstage component baseline through v1.51; confirm the import (some packages re-export via `@backstage/core-components`). If the app is on MUI v5, import from `@mui/material`.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisScorecardCard.tsx plugins/regis/src/components/RegisScorecardCard.test.tsx
git commit -m "feat: add RegisScorecardCard Overview card"
```

---

## Task 6: `RegisTabContent` (TDD)

**Files:**

- Create: `plugins/regis/src/components/RegisTabContent.tsx`
- Test: `plugins/regis/src/components/RegisTabContent.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisTabContent.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";
import {
  renderInTestApp,
  TestApiProvider,
} from "@backstage/frontend-test-utils";
import { EntityProvider } from "@backstage/plugin-catalog-react";
import { regisApiRef } from "../api/RegisApi";
import { RegisTabContent } from "./RegisTabContent";

const entity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "svc",
    annotations: { "regis.io/report-url": "https://h/r.json" },
  },
  spec: {},
};

const renderTab = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisTabContent />
      </EntityProvider>
    </TestApiProvider>,
  );

describe("RegisTabContent", () => {
  it("groups rules by tag and shows the image reference", async () => {
    await renderTab({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: "Gold",
          request: { repository: "library/nginx", tag: "1.27" },
          rules: [
            {
              slug: "no-critical-cve",
              description: "No critical CVEs",
              tags: ["security"],
              passed: true,
              status: "passed",
              message: "ok",
            },
          ],
          rules_summary: { score: 100, by_tag: {} },
        } as any,
        meta: { fetchedAt: "", source: "http", schemaVersion: 1 },
      }),
    });
    expect(await screen.findByText(/library\/nginx/)).toBeInTheDocument();
    expect(await screen.findByText("No critical CVEs")).toBeInTheDocument();
    expect(await screen.findByText(/security/i)).toBeInTheDocument();
  });

  it("renders an error panel on failure", async () => {
    await renderTab({
      getReport: async () => {
        throw new Error("unreachable");
      },
    });
    expect(await screen.findByText(/unreachable/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test RegisTabContent
```

Expected: FAIL — `Cannot find module './RegisTabContent'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/RegisTabContent.tsx`:

```tsx
import React from "react";
import useAsync from "react-use/lib/useAsync";
import { useApi } from "@backstage/core-plugin-api";
import {
  Content,
  InfoCard,
  Progress,
  ResponseErrorPanel,
  StatusError,
  StatusOK,
} from "@backstage/core-components";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef } from "@backstage/catalog-model";
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@material-ui/core";
import type { Report } from "@regis/backstage-plugin-regis-common";
import { regisApiRef } from "../api/RegisApi";

function groupByTag(rules: NonNullable<Report["rules"]>) {
  const groups: Record<string, typeof rules> = {};
  for (const rule of rules) {
    for (const tag of rule.tags ?? ["untagged"]) {
      (groups[tag] ??= []).push(rule);
    }
  }
  return groups;
}

/** Full report tab: header + rules grouped by tag. */
export function RegisTabContent() {
  const api = useApi(regisApiRef);
  const { entity } = useEntity();
  const ref = stringifyEntityRef(entity);
  const { value, loading, error } = useAsync(() => api.getReport(ref), [ref]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const report = value!.report;
  const groups = groupByTag(report.rules ?? []);

  return (
    <Content>
      <Typography variant="h5">
        {report.request.repository}:{report.request.tag}
        {report.tier ? ` — ${report.tier}` : ""}
      </Typography>
      {Object.entries(groups).map(([tag, rules]) => (
        <InfoCard key={tag} title={tag}>
          <List dense>
            {rules.map((rule) => (
              <ListItem key={rule.slug}>
                <ListItemIcon>
                  {rule.passed ? <StatusOK /> : <StatusError />}
                </ListItemIcon>
                <ListItemText
                  primary={rule.description}
                  secondary={rule.message}
                />
              </ListItem>
            ))}
          </List>
        </InfoCard>
      ))}
    </Content>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test RegisTabContent
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisTabContent.tsx plugins/regis/src/components/RegisTabContent.test.tsx
git commit -m "feat: add RegisTabContent report tab"
```

---

## Task 7: `RegisCatalogPage` (TDD)

**Files:**

- Create: `plugins/regis/src/components/RegisCatalogPage.tsx`
- Test: `plugins/regis/src/components/RegisCatalogPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisCatalogPage.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";
import {
  renderInTestApp,
  TestApiProvider,
} from "@backstage/frontend-test-utils";
import { regisApiRef } from "../api/RegisApi";
import { RegisCatalogPage } from "./RegisCatalogPage";

const renderPage = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <RegisCatalogPage />
    </TestApiProvider>,
  );

describe("RegisCatalogPage", () => {
  it("lists one row per summary", async () => {
    await renderPage({
      listReports: async () => [
        {
          entityRef: "component:default/svc",
          status: "ok",
          tier: "Gold",
          score: 100,
        },
        { entityRef: "component:default/api", status: "error", error: "x" },
      ],
    });
    expect(
      await screen.findByText("component:default/svc"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("component:default/api"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true yarn test RegisCatalogPage
```

Expected: FAIL — `Cannot find module './RegisCatalogPage'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/RegisCatalogPage.tsx`:

```tsx
import React from "react";
import useAsync from "react-use/lib/useAsync";
import { useApi } from "@backstage/core-plugin-api";
import {
  Content,
  Header,
  Page,
  Progress,
  ResponseErrorPanel,
  Table,
  type TableColumn,
} from "@backstage/core-components";
import { regisApiRef, type ReportSummary } from "../api/RegisApi";

const columns: TableColumn<ReportSummary>[] = [
  { title: "Entity", field: "entityRef" },
  { title: "Status", field: "status" },
  { title: "Tier", field: "tier" },
  { title: "Score", field: "score", type: "numeric" },
];

/** Global table of every annotated entity's posture. */
export function RegisCatalogPage() {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(() => api.listReports(), []);

  return (
    <Page themeId="tool">
      <Header title="Regis" subtitle="Container posture across the catalog" />
      <Content>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {value && (
          <Table
            title={`${value.length} images`}
            columns={columns}
            data={value}
            options={{ search: true, paging: true, pageSize: 20 }}
          />
        )}
      </Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true yarn test RegisCatalogPage
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisCatalogPage.tsx plugins/regis/src/components/RegisCatalogPage.test.tsx
git commit -m "feat: add RegisCatalogPage global table"
```

---

## Task 8: Plugin + blueprints (new frontend system)

**Files:**

- Create: `plugins/regis/src/routes.ts`, `plugins/regis/src/plugin.tsx`
- Modify: `plugins/regis/src/index.ts`

- [ ] **Step 1: Route ref**

Create `plugins/regis/src/routes.ts`:

```ts
import { createRouteRef } from "@backstage/frontend-plugin-api";

export const rootRouteRef = createRouteRef();
```

- [ ] **Step 2: Plugin + blueprints**

Create `plugins/regis/src/plugin.tsx`:

```tsx
import React from "react";
import {
  ApiBlueprint,
  PageBlueprint,
  NavItemBlueprint,
  createFrontendPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from "@backstage/frontend-plugin-api";
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from "@backstage/plugin-catalog-react/alpha";
import RatingIcon from "@material-ui/icons/Stars";
import { regisApiRef } from "./api/RegisApi";
import { RegisClient } from "./api/RegisClient";
import { isRegisAvailable } from "@regis/backstage-plugin-regis-common";
import { rootRouteRef } from "./routes";

const regisApi = ApiBlueprint.make({
  params: {
    factory: createApiFactory({
      api: regisApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new RegisClient({ discoveryApi, fetchApi }),
    }),
  },
});

const scorecardCard = EntityCardBlueprint.make({
  name: "scorecard",
  params: {
    filter: (entity: any) => isRegisAvailable(entity),
    loader: async () =>
      import("./components/RegisScorecardCard").then((m) => (
        <m.RegisScorecardCard />
      )),
  },
});

const reportTab = EntityContentBlueprint.make({
  name: "report",
  params: {
    defaultPath: "regis",
    defaultTitle: "Regis",
    filter: (entity: any) => isRegisAvailable(entity),
    loader: async () =>
      import("./components/RegisTabContent").then((m) => <m.RegisTabContent />),
  },
});

const catalogPage = PageBlueprint.make({
  params: {
    defaultPath: "/regis",
    routeRef: rootRouteRef,
    loader: async () =>
      import("./components/RegisCatalogPage").then((m) => (
        <m.RegisCatalogPage />
      )),
  },
});

const navItem = NavItemBlueprint.make({
  params: { title: "Regis", icon: RatingIcon, routeRef: rootRouteRef },
});

export const regisPlugin = createFrontendPlugin({
  pluginId: "regis",
  extensions: [regisApi, scorecardCard, reportTab, catalogPage, navItem],
});
```

- [ ] **Step 3: Export**

Replace `plugins/regis/src/index.ts`:

```ts
export { regisPlugin as default } from "./plugin";
export { regisApiRef } from "./api/RegisApi";
export type { RegisApi, ReportEnvelope, ReportSummary } from "./api/RegisApi";
```

- [ ] **Step 4: Typecheck + build**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage
yarn tsc
yarn build:all
```

Expected: typecheck + build pass.

> **Watch-points (this is the version-sensitive task — verify each against v1.51, the demo app in Task 9 is the authority):**
>
> - `EntityContentBlueprint` / `EntityCardBlueprint` import path is `@backstage/plugin-catalog-react/alpha`.
> - Blueprint `.make()` param names (`defaultPath`, `defaultTitle`, `filter`, `loader`) and whether `loader` returns a JSX element vs a component — confirm against the installed `common-extension-blueprints` docs/types.
> - `createFrontendPlugin` accepts `{ pluginId, extensions }` in current NFS; older alphas used `{ id, extensions }`.
> - If `filter` does not accept a predicate function, use the catalog filter-expression string form (e.g. `hasAnnotation('regis.io/report-url')`).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/routes.ts plugins/regis/src/plugin.tsx plugins/regis/src/index.ts
git commit -m "feat: register regis frontend blueprints (api, card, tab, page, nav)"
```

---

## Task 9: Wire the demo app end-to-end

**Files:**

- Modify: `packages/backend/src/index.ts`
- Modify: `packages/app/src/App.tsx` (or the app's feature list)
- Create: `examples/entities.yaml`
- Modify: `app-config.yaml` (register the example location)

- [ ] **Step 1: Add the backend plugin**

In `packages/backend/src/index.ts`, add alongside the other `backend.add(...)` calls:

```ts
backend.add(import("@regis/backstage-plugin-regis-backend"));
```

Add `"@regis/backstage-plugin-regis-backend": "workspace:^"` to `packages/backend/package.json` dependencies.

- [ ] **Step 2: Add the frontend plugin to the app**

Add `"@regis/backstage-plugin-regis": "workspace:^"` to `packages/app/package.json`. In the NFS app entrypoint (`packages/app/src/App.tsx`), include the plugin in `createApp`'s features:

```ts
import regisPlugin from "@regis/backstage-plugin-regis";

export const app = createApp({
  features: [
    // ...existing features
    regisPlugin,
  ],
});
```

> **Watch-point:** v1.51 apps may use feature discovery (`@backstage/frontend-defaults` auto-detects installed plugins) instead of an explicit `features` array. If so, adding the dependency in Step 1/2 is enough and this explicit registration is redundant — confirm against the generated `App.tsx`.

- [ ] **Step 3: Add a demo entity**

Create `examples/entities.yaml`:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: nginx-demo
  description: Demo image with a Regis report
  annotations:
    regis.io/report-url: https://raw.githubusercontent.com/trivoallan/regis/ec31f8fd497301da8bdee1521768591034a539fd/tests/fixtures/report.v1.json
spec:
  type: service
  owner: guests
  lifecycle: production
```

Register it in `app-config.yaml` under `catalog.locations`:

```yaml
catalog:
  locations:
    - type: file
      target: ../../examples/entities.yaml
      rules:
        - allow: [Component]
```

> **Note:** the demo `report-url` points at the core repo's committed contract fixture (`tests/fixtures/report.v1.json`) at the pinned SHA — a real, fetchable report so the demo works out of the box.

- [ ] **Step 4: Manual smoke test**

```bash
cd /Users/tristan/Documents/Workspaces/trivoallan/regis-backstage
yarn install
yarn start
```

Expected: app boots; open the `nginx-demo` component → a **Regis** tab + an Overview **scorecard** appear; the **Regis** nav item opens the catalog page listing `nginx-demo`. Stop with Ctrl-C.

> If a surface does not appear, the blueprint `.make()` params (Task 8) need adjusting to the installed API — iterate there, rebuild, retry. This is the expected version-reconciliation step.

- [ ] **Step 5: Lint, typecheck, build, test**

```bash
yarn tsc
yarn lint:all
CI=true yarn test regis
yarn build:all
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire regis plugins into the demo app with an example entity"
```

---

## Task 10: Changeset

**Files:**

- Create: `.changeset/regis-frontend-initial.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/regis-frontend-initial.md`:

```markdown
---
"@regis/backstage-plugin-regis": minor
---

Initial release: frontend rendering Regis posture — entity Regis tab, Overview
scorecard card, and a global catalog page, registered as new-frontend-system
extensions and gated by the `regis.io/report-url` annotation.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/regis-frontend-initial.md
git commit -m "docs: add changeset for regis frontend initial release"
```

---

## Self-Review

**1. Spec coverage (frontend slice):** `regisApiRef` + `RegisClient` (Tasks 2-3); scorecard card (Task 5), report tab grouped-by-tag (Task 6), global catalog page (Task 7) — all MUI-native, consuming `regis-common` types; NFS registration with annotation `filter`s (Task 8); demo app wired end-to-end with a real fetchable report (Task 9). Error/loading states use `Progress`/`ResponseErrorPanel` per spec §Error handling. Degraded reports are handled (tier/score rendered conditionally). ✓

**2. Placeholder scan:** every component and test is complete code; commands have expected output. Watch-points flag version-sensitive NFS APIs (the code is written; the note says verify) — the demo app is the runtime authority. ✓

**3. Type consistency:** `regisApiRef`, `RegisApi`, `ReportEnvelope`, `ReportSummary` are defined once in `RegisApi.ts` and imported identically by the client, components, tests, and blueprints. `getReport(entityRef)` / `listReports()` signatures match between `RegisApi`, `RegisClient`, its test, and all three components. `isRegisAvailable` is reused from `regis-common`. `tierColor`/`scoreStatus` are defined (Task 4) before use (Task 5). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-regis-backstage-phase1c-frontend.md`. Execute with subagent-driven-development or executing-plans — **inline strongly recommended here**: Task 8/9 (NFS blueprints + app wiring) is the most version-sensitive work in the whole project and benefits most from running `yarn start`/`yarn build:all` and adapting in real time, exactly as Phase 1a's de-risking played out.
