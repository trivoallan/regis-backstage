# Merge overview and Regis tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the separate "Regis" entity tab into the overview tab for any entity with a Regis report, so the posture synthesis sits in the top card grid and the full rule table renders full width below it.

**Architecture:** Use the new frontend system's `EntityCardBlueprint` `type` field. The enriched `RegisScorecardCard` stays an `info` card (top grid); a new `RegisRulesCard` is a `content` card (full width, below). The category-score bars are extracted into a reusable `CategoryBreakdown`. The `RegisTabContent`/`PostureSummary` pair and the `reportTab` extension are deleted. `RegisClient` gains in-flight request dedup so the two cards now sharing one tab don't double-fetch.

**Tech Stack:** TypeScript, React, Backstage new frontend system (`@backstage/frontend-plugin-api`, `@backstage/plugin-catalog-react/alpha`), Material UI v4, Jest + `@backstage/frontend-test-utils` + Testing Library.

---

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `plugins/regis/src/api/RegisClient.ts` | HTTP client to the regis backend | Modify: add in-flight GET dedup |
| `plugins/regis/src/api/RegisClient.test.ts` | Client tests | Modify: add dedup tests |
| `plugins/regis/src/components/CategoryBreakdown.tsx` | Per-category score bars (presentational) | Create |
| `plugins/regis/src/components/CategoryBreakdown.test.tsx` | CategoryBreakdown tests | Create |
| `plugins/regis/src/components/RegisRulesCard.tsx` | Full-width rule-table card (loads data) | Create |
| `plugins/regis/src/components/RegisRulesCard.test.tsx` | RegisRulesCard tests | Create |
| `plugins/regis/src/components/RegisScorecardCard.tsx` | Overview synthesis card | Modify: add breakdown + clickable playbook + scan date |
| `plugins/regis/src/components/RegisScorecardCard.test.tsx` | Scorecard tests | Modify: assert breakdown + playbook link |
| `plugins/regis/src/plugin.tsx` | Extension wiring | Modify: drop `reportTab`, add `rulesCard` |
| `plugins/regis/src/components/RegisTabContent.tsx` + `.test.tsx` | Old Regis tab | Delete |
| `plugins/regis/src/components/PostureSummary.tsx` + `.test.tsx` | Old tab header card | Delete |

**Working directory:** all commands run from the worktree root
`/Users/tristan/Documents/Workspaces/trivoallan/regis-backstage/.claude/worktrees/ecstatic-mendeleev-ed034d`.

**Test runner:** `node_modules/.bin/backstage-cli repo test --watch=false <path>` (yarn does not put `backstage-cli` on PATH in this repo).

---

## Task 0: Bootstrap the worktree

This worktree has no `node_modules` yet. Install once before running any test.

- [ ] **Step 1: Install dependencies**

Run: `yarn install`
Expected: completes; `node_modules/.bin/backstage-cli` now exists.

- [ ] **Step 2: Confirm the toolchain works**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: PASS (baseline, before any change).

---

## Task 1: In-flight request dedup in RegisClient

**Files:**
- Modify: `plugins/regis/src/api/RegisClient.ts`
- Test: `plugins/regis/src/api/RegisClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these two cases inside the `describe('RegisClient', ...)` block in `plugins/regis/src/api/RegisClient.test.ts`:

```ts
it('dedupes concurrent identical GETs into a single fetch', async () => {
  let resolveFetch!: (v: unknown) => void;
  const fetchImpl = jest
    .fn()
    .mockReturnValue(new Promise(res => (resolveFetch = res)));
  const client = clientWith(fetchImpl);

  const p1 = client.getReport('component:default/svc');
  const p2 = client.getReport('component:default/svc');
  // Let baseUrl()/fetch fire before resolving the pending response.
  await new Promise(r => setTimeout(r, 0));
  resolveFetch({
    ok: true,
    json: async () => ({ report: { schemaVersion: 1 }, meta: {} }),
  });
  const [a, b] = await Promise.all([p1, p2]);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(a.report.schemaVersion).toBe(1);
  expect(b.report.schemaVersion).toBe(1);
});

it('refetches once a prior request has settled', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ report: { schemaVersion: 1 }, meta: {} }),
  });
  const client = clientWith(fetchImpl);

  await client.getReport('component:default/svc');
  await client.getReport('component:default/svc');

  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts -t 'dedupes concurrent'`
Expected: FAIL — `fetchImpl` is called twice (no dedup yet).

- [ ] **Step 3: Implement the dedup**

In `plugins/regis/src/api/RegisClient.ts`, add an `inflight` field and split `getJson` into a dedup wrapper plus a `fetchJson` worker.

Add the field after the existing private fields:

```ts
  private readonly inflight = new Map<string, Promise<unknown>>();
```

Replace the existing `getJson` method:

```ts
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
```

with:

```ts
  private getJson<T>(path: string): Promise<T> {
    const cached = this.inflight.get(path);
    if (cached) return cached as Promise<T>;
    const promise = this.fetchJson<T>(path);
    this.inflight.set(path, promise);
    const clear = () => this.inflight.delete(path);
    promise.then(clear, clear);
    return promise;
  }

  private async fetchJson<T>(path: string): Promise<T> {
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
```

Note: `getJson` must set the `inflight` entry synchronously (no `await` before `this.inflight.set`), so two same-tick callers share one promise. `promise.then(clear, clear)` clears the entry on both fulfilment and rejection without swallowing the rejection seen by callers.

- [ ] **Step 4: Run the full client test file to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/api/RegisClient.test.ts`
Expected: PASS — all cases, including the two new ones and the existing single-call tests.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/api/RegisClient.ts plugins/regis/src/api/RegisClient.test.ts
git commit -m "feat(regis): dedupe in-flight GETs in RegisClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Extract the CategoryBreakdown component

**Files:**
- Create: `plugins/regis/src/components/CategoryBreakdown.tsx`
- Test: `plugins/regis/src/components/CategoryBreakdown.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/CategoryBreakdown.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CategoryBreakdown } from './CategoryBreakdown';

const rulesSummary = {
  score: 73,
  by_tag: {
    security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
    hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
  },
} as any;

describe('CategoryBreakdown', () => {
  it('renders a labelled bar per category with its score', () => {
    render(<CategoryBreakdown rulesSummary={rulesSummary} />);
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('hygiene')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('renders nothing when there are no categories', () => {
    const { container } = render(<CategoryBreakdown rulesSummary={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/CategoryBreakdown.test.tsx`
Expected: FAIL — `Cannot find module './CategoryBreakdown'`.

- [ ] **Step 3: Implement the component**

Create `plugins/regis/src/components/CategoryBreakdown.tsx`:

```tsx
import { Box, Typography } from '@material-ui/core';
import { categoryScores, type RulesSummary } from './posture';
import { scoreBarColor } from './format';

/** Per-category (per-tag) score bars, worst category first. */
export function CategoryBreakdown(props: { rulesSummary?: RulesSummary }) {
  const cats = categoryScores(props.rulesSummary);
  if (cats.length === 0) return null;

  return (
    <Box display="grid" gridTemplateColumns="1fr 1fr" gridGap="10px 24px">
      {cats.map(c => (
        <Box key={c.tag}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption">{c.tag}</Typography>
            <Typography variant="caption">{c.score}%</Typography>
          </Box>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: '#eee',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${c.score}%`,
                height: '100%',
                background: scoreBarColor(c.score),
              }}
            />
          </div>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/CategoryBreakdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/CategoryBreakdown.tsx plugins/regis/src/components/CategoryBreakdown.test.tsx
git commit -m "feat(regis): extract CategoryBreakdown score bars

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Create the full-width RegisRulesCard

**Files:**
- Create: `plugins/regis/src/components/RegisRulesCard.tsx`
- Test: `plugins/regis/src/components/RegisRulesCard.test.tsx`

This card carries the data-loading the old `RegisTabContent` did, minus the `PostureSummary` header.

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisRulesCard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { regisApiRef } from '../api/RegisApi';
import { RegisRulesCard } from './RegisRulesCard';

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'img',
    annotations: { 'regis.io/report-url': 'https://h/r.json' },
  },
  spec: {},
};

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisRulesCard />
      </EntityProvider>
    </TestApiProvider>,
  );

describe('RegisRulesCard', () => {
  it('renders the rule table and an explorer link when a playbook is present', async () => {
    await renderCard({
      getReport: async () => ({
        report: {
          schemaVersion: 1,
          tier: 'Silver',
          playbooks: [{ playbook_name: 'base-image-policy' }],
          rules: [
            {
              slug: 'g2',
              description: 'no-root-user',
              level: 'critical',
              passed: false,
              status: 'failed',
              message: 'runs as root',
            },
          ],
          rules_summary: { score: 50, by_tag: {} },
        } as any,
        meta: { fetchedAt: '', source: 'http', schemaVersion: 1 },
      }),
      getPlaybooks: async () => ({ playbooks: [] }),
    });

    expect(await screen.findByText('no-root-user')).toBeInTheDocument();
    const link = await screen.findByText('View in explorer');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      '/?groupBy=playbook&playbook=base-image-policy',
    );
  });

  it('renders an error panel when the API fails', async () => {
    await renderCard({
      getReport: async () => {
        throw new Error('boom');
      },
      getPlaybooks: async () => ({ playbooks: [] }),
    });
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRulesCard.test.tsx`
Expected: FAIL — `Cannot find module './RegisRulesCard'`.

- [ ] **Step 3: Implement the component**

Create `plugins/regis/src/components/RegisRulesCard.tsx`:

```tsx
import { Link, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { RuleTable } from './RuleTable';
import { useReportAndLadder } from './useReportAndLadder';

/** Full-width Regis rule table with a link into the portfolio explorer. */
export function RegisRulesCard() {
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report } = value!;
  const rules = report.rules ?? [];
  const playbookName = report.playbooks?.[0]?.playbook_name;
  const exploreHref = playbookName
    ? `/?groupBy=playbook&playbook=${encodeURIComponent(playbookName)}`
    : undefined;

  return (
    <Box display="flex" flexDirection="column" gridGap={16}>
      {exploreHref && (
        <Box>
          <Link to={exploreHref}>View in explorer</Link>
        </Box>
      )}
      <RuleTable rules={rules} rulesSummary={report.rules_summary} />
    </Box>
  );
}
```

Note: no `<Content>` wrapper — a `content`-type entity card already supplies the surrounding layout; `RuleTable` renders its own surface.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRulesCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisRulesCard.tsx plugins/regis/src/components/RegisRulesCard.test.tsx
git commit -m "feat(regis): add full-width RegisRulesCard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Enrich RegisScorecardCard

Add the category breakdown, clickable playbook attribution, and scan date to the overview synthesis card.

**Files:**
- Modify: `plugins/regis/src/components/RegisScorecardCard.tsx`
- Test: `plugins/regis/src/components/RegisScorecardCard.test.tsx`

- [ ] **Step 1: Update the test to assert the new content**

Edit `plugins/regis/src/components/RegisScorecardCard.test.tsx`. Give the entity a playbook annotation and `by_tag` data, and assert the breakdown and a linked playbook.

Replace the `entity` constant:

```ts
const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: 'img',
    annotations: {
      'regis.io/report-url': 'https://h/r.json',
      'regis.io/playbook': 'resource:default/regis-playbook-default',
    },
  },
  spec: {},
};
```

Wrap the render with the entity route so `EntityRefLink` resolves. Replace the `renderCard` helper:

```ts
import { entityRouteRef } from '@backstage/plugin-catalog-react';

const renderCard = (api: Partial<typeof regisApiRef.T>) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <EntityProvider entity={entity}>
        <RegisScorecardCard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );
```

(Keep the existing `import { EntityProvider } from '@backstage/plugin-catalog-react';` — merge `entityRouteRef` into that same import.)

In the first test case, replace the `rules_summary` line so it carries categories:

```ts
          rules_summary: {
            score: 73,
            by_tag: {
              security: { rules: ['a', 'b'], passed_rules: ['a'], score: 65 },
              hygiene: { rules: ['c'], passed_rules: ['c'], score: 92 },
            },
          },
```

Replace the `via base-image-policy` assertion line with assertions for the breakdown and the linked playbook (the name is now a link, no longer plain "via …" text):

```ts
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    const playbookLink = await screen.findByText('base-image-policy');
    expect(playbookLink.closest('a')).toHaveAttribute(
      'href',
      '/catalog/default/resource/regis-playbook-default',
    );
```

Leave the other assertions (`73`, `Silver` chip color, badges, `1 passed`, no next-tier claims) unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisScorecardCard.test.tsx`
Expected: FAIL — no `security`/`65%` breakdown rendered and the playbook is plain text, not a link.

- [ ] **Step 3: Implement the enrichment**

Edit `plugins/regis/src/components/RegisScorecardCard.tsx`. Update the imports at the top of the file:

```tsx
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { EntityRefLink, useEntity } from '@backstage/plugin-catalog-react';
import { Box, Chip, Typography } from '@material-ui/core';
import { REGIS_ANNOTATION_PLAYBOOK } from '@regis/backstage-plugin-regis-common';
import { CategoryBreakdown } from './CategoryBreakdown';
import { badgeClassColor, tierColor } from './format';
import { countByStatus } from './posture';
import { useReportAndLadder } from './useReportAndLadder';
```

Keep the `Gauge` helper exactly as it is. Replace the `RegisScorecardCard` function body:

```tsx
/** Overview posture card: score gauge + tier + breakdown + badges + counts. */
export function RegisScorecardCard() {
  const { entity } = useEntity();
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report, ladder } = value!;
  const rules = report.rules ?? [];
  const score = report.rules_summary?.score ?? 0;
  const counts = countByStatus(rules);
  const pb = report.playbooks?.[0];
  const playbookName = pb?.playbook_name;
  const playbookRef =
    entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK];
  const scanned = report.request?.timestamp?.slice(0, 10);

  return (
    <InfoCard title="Regis posture">
      <Box display="flex" gridGap={18} alignItems="center" mb={1.5}>
        <Gauge score={score} color={tierColor(report.tier, ladder)} />
        <Box>
          {report.tier && (
            <Chip
              size="small"
              label={report.tier}
              style={{ backgroundColor: tierColor(report.tier, ladder), color: '#fff' }}
            />
          )}
          <Typography variant="body2" component="div">
            {counts.passed} passed · {counts.failed} failed · {counts.incomplete} incomplete
          </Typography>
        </Box>
      </Box>
      {(report.badges?.length ?? 0) > 0 && (
        <Box display="flex" flexWrap="wrap" gridGap={6} mb={1}>
          {report.badges!.map(b => (
            <Chip
              key={b.slug ?? b.scope}
              size="small"
              label={`${b.scope}${b.value ? ` · ${b.value}` : ''}`}
              style={{ backgroundColor: badgeClassColor(b.class), color: '#fff' }}
            />
          ))}
        </Box>
      )}
      <Box mb={1}>
        <CategoryBreakdown rulesSummary={report.rules_summary} />
      </Box>
      {playbookName && (
        <Typography variant="caption" color="textSecondary" component="div">
          via{' '}
          {playbookRef ? (
            <EntityRefLink entityRef={playbookRef}>{playbookName}</EntityRefLink>
          ) : (
            <strong>{playbookName}</strong>
          )}
          {pb?.playbook_version ? ` v${pb.playbook_version}` : ''}
          {scanned ? ` · scanned ${scanned}` : ''}
        </Typography>
      )}
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisScorecardCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisScorecardCard.tsx plugins/regis/src/components/RegisScorecardCard.test.tsx
git commit -m "feat(regis): fold posture breakdown into the scorecard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the overview, drop the Regis tab and dead files

Remove the `reportTab` extension, register `rulesCard` as a `content` card, and delete `RegisTabContent` and `PostureSummary` (only `RegisTabContent` consumed `PostureSummary`; only `plugin.tsx` consumed `RegisTabContent`).

**Files:**
- Modify: `plugins/regis/src/plugin.tsx`
- Delete: `plugins/regis/src/components/RegisTabContent.tsx`, `plugins/regis/src/components/RegisTabContent.test.tsx`, `plugins/regis/src/components/PostureSummary.tsx`, `plugins/regis/src/components/PostureSummary.test.tsx`

- [ ] **Step 1: Update plugin.tsx imports**

In `plugins/regis/src/plugin.tsx`, change the alpha catalog-react import to drop `EntityContentBlueprint` (now unused):

```tsx
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
```

- [ ] **Step 2: Replace the reportTab extension with rulesCard**

Delete the whole `reportTab` block:

```tsx
const reportTab = EntityContentBlueprint.make({
  name: 'report',
  params: {
    path: 'regis',
    title: 'Regis',
    filter: isRegisAvailable,
    loader: () =>
      import('./components/RegisTabContent').then(m => <m.RegisTabContent />),
  },
});
```

and replace it with:

```tsx
const rulesCard = EntityCardBlueprint.make({
  name: 'rules',
  params: {
    type: 'content',
    filter: isRegisAvailable,
    loader: () =>
      import('./components/RegisRulesCard').then(m => <m.RegisRulesCard />),
  },
});
```

- [ ] **Step 3: Update the extensions array**

In the `createFrontendPlugin({ pluginId: 'regis', extensions: [...] })` array, remove `reportTab` and add `rulesCard`. The array becomes:

```tsx
  extensions: [
    regisApi,
    scorecardCard,
    rulesCard,
    explorerPage,
    serviceImagesCard,
    playbookImagesCard,
    aliasesCard,
    trajectoryCard,
  ],
```

- [ ] **Step 4: Delete the dead files**

Run:

```bash
git rm plugins/regis/src/components/RegisTabContent.tsx \
       plugins/regis/src/components/RegisTabContent.test.tsx \
       plugins/regis/src/components/PostureSummary.tsx \
       plugins/regis/src/components/PostureSummary.test.tsx
```

- [ ] **Step 5: Typecheck**

Run: `yarn tsc`
Expected: PASS, no unused-import or missing-module errors (confirms `EntityContentBlueprint` removal and deletions are clean).

- [ ] **Step 6: Run the regis plugin test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS — no test references the deleted `RegisTabContent`/`PostureSummary` modules.

- [ ] **Step 7: Commit**

```bash
git add plugins/regis/src/plugin.tsx
git commit -m "feat(regis): merge Regis tab into the overview as a content card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full verification

- [ ] **Step 1: Typecheck the repo**

Run: `yarn tsc`
Expected: PASS.

- [ ] **Step 2: Lint the changed files**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: PASS (no errors). Fix any formatting with `yarn fix` if needed, then re-run.

- [ ] **Step 3: Run the full regis test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run: `yarn start`, open a `container-image` entity. Confirm: a single overview tab (no "Regis" tab), the scorecard shows the per-category bars and a clickable playbook link, and the rule table spans full width below the card grid.

---

## Notes for the implementer

- **DRY:** `RegisRulesCard` and the enriched `RegisScorecardCard` both consume `useReportAndLadder`; the Task 1 dedup is what keeps that from doubling network calls. Do not add a second caching layer.
- **YAGNI:** Do not build a custom entity-page layout. The `type: 'content'` field is the entire layout mechanism.
- **Deep links:** the entity `.../regis` sub-route no longer exists; this is intended.
