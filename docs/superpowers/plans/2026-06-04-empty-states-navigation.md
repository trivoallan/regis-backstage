# Empty states & navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the Regis empty states behind one shared `RegisEmptyState` and add a clear-filters CTA, a scoped detail→explorer link, and a clickable playbook attribution.

**Architecture:** Frontend-only in `plugins/regis`. A small `RegisEmptyState` component standardizes the bare-string empties; navigation reuses Backstage `Link` / `EntityRefLink` and the explorer's existing `state`/`setState`. No backend changes.

**Tech Stack:** TypeScript, React, Material-UI v4, `@backstage/core-components` (`Link`), `@backstage/plugin-catalog-react` (`EntityRefLink`), Jest + `@backstage/frontend-test-utils`.

**Test runner (this repo):** `node_modules/.bin/backstage-cli repo test --watch=false <path>`.

---

## Reference (verified file:line)

- Empty states today:
  - `QuickLookPanel.tsx:64` `<Typography variant="body2">No history.</Typography>`
  - `RegisImagePostureCard.tsx:95` `<InfoCard title={title}>No Regis-tracked images yet.</InfoCard>`
  - `RegisExplorerPage.tsx:~98` `return <Typography>No images match this scope yet.</Typography>;`
  - `RegisTrajectoryCard.tsx:44` `<InfoCard title="Trajectory">No history recorded yet.</InfoCard>`
  - `TrajectoryChart.tsx:15` `<span>Not enough history to plot a trend yet.</span>`
  - `portfolioChart.tsx:11` `<span>No data yet.</span>`
- `REGIS_ANNOTATION_PLAYBOOK = 'regis.io/playbook'` (from `@regis/backstage-plugin-regis-common`) — the playbook **entityRef** on an image entity.
- `RegisTabContent` uses `useReportAndLadder()` (gives `{report, ladder}`); it does NOT currently call `useEntity()`.
- `PostureSummary` renders the playbook name as `<strong>{pb.playbook_name}</strong>` (PostureSummary.tsx ~line 39); `pb = report.playbooks?.[0]`.
- `RegisExplorerPage` has `state` (`{groupBy, filters}`) and `setState`.

## File structure

- Create: `plugins/regis/src/components/RegisEmptyState.tsx` (+ `.test.tsx`).
- Modify: `RegisImagePostureCard.tsx`, `RegisTrajectoryCard.tsx`, `QuickLookPanel.tsx`, `portfolioChart.tsx`, `TrajectoryChart.tsx` (empties) + their tests.
- Modify: `PostureSummary.tsx` (+ test) — playbook link.
- Modify: `RegisTabContent.tsx` (+ test) — playbookRef + view-in-explorer link.
- Modify: `RegisExplorerPage.tsx` (+ test) — empty + clear-filters CTA.

---

## Task 1: `RegisEmptyState` component

**Files:**
- Create: `plugins/regis/src/components/RegisEmptyState.tsx`
- Test: `plugins/regis/src/components/RegisEmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisEmptyState.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { RegisEmptyState } from './RegisEmptyState';

describe('RegisEmptyState', () => {
  it('renders the title', () => {
    render(<RegisEmptyState title="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });
  it('renders the action when provided', () => {
    render(<RegisEmptyState title="Nothing." action={<button type="button">Do it</button>} />);
    expect(screen.getByText('Do it')).toBeInTheDocument();
  });
  it('renders no action node when omitted', () => {
    render(<RegisEmptyState title="Nothing." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisEmptyState.test.tsx`
Expected: FAIL — `Cannot find module './RegisEmptyState'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/regis/src/components/RegisEmptyState.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Box, Typography } from '@material-ui/core';

/** Consistent, lightweight empty state: a muted title + an optional action. */
export function RegisEmptyState(props: { title: string; action?: ReactNode }) {
  return (
    <Box textAlign="center" py={2}>
      <Typography variant="body2" color="textSecondary">
        {props.title}
      </Typography>
      {props.action && <Box mt={1}>{props.action}</Box>}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisEmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisEmptyState.tsx plugins/regis/src/components/RegisEmptyState.test.tsx
git commit -m "feat(frontend): RegisEmptyState (shared empty state)"
```

---

## Task 2: Unify the card/chart empty states

**Files:**
- Modify: `RegisImagePostureCard.tsx`, `RegisTrajectoryCard.tsx`, `QuickLookPanel.tsx`, `portfolioChart.tsx`, `TrajectoryChart.tsx`
- Test: update exact-match assertions where the wording changed.

- [ ] **Step 1: Edit the five components**

In each file, add `import { RegisEmptyState } from './RegisEmptyState';` and replace the bare empty:

1. `RegisImagePostureCard.tsx` — replace
```tsx
    return <InfoCard title={title}>No Regis-tracked images yet.</InfoCard>;
```
with
```tsx
    return (
      <InfoCard title={title}>
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
```

2. `RegisTrajectoryCard.tsx` — replace
```tsx
    return <InfoCard title="Trajectory">No history recorded yet.</InfoCard>;
```
with
```tsx
    return (
      <InfoCard title="Trajectory">
        <RegisEmptyState title="No history recorded." />
      </InfoCard>
    );
```

3. `QuickLookPanel.tsx` — replace
```tsx
  else trajectory = <Typography variant="body2">No history.</Typography>;
```
with
```tsx
  else trajectory = <RegisEmptyState title="No history recorded." />;
```
(Leave the `Typography` import if still used elsewhere in the file; remove it only if it becomes unused.)

4. `portfolioChart.tsx` — replace
```tsx
  if (buckets.length === 0) return <span>No data yet.</span>;
```
with
```tsx
  if (buckets.length === 0) return <RegisEmptyState title="No portfolio data yet." />;
```

5. `TrajectoryChart.tsx` — replace
```tsx
    return <span>Not enough history to plot a trend yet.</span>;
```
with
```tsx
    return <RegisEmptyState title="Not enough history to plot a trend." />;
```

- [ ] **Step 2: Also clarify the quick-look "open page" link label**

In `QuickLookPanel.tsx`, find the `EntityRefLink` that opens the full entity page (around line 78). Ensure its visible text reads `Open image page →`. If it currently renders a different label or the default ref, set its children to `Open image page →` (keep the same `entityRef`/`to` target). Do not add new resolution logic.

- [ ] **Step 3: Update affected tests**

Run `grep -rn "No history recorded yet\|No data yet\|No history\.\|Not enough history to plot a trend yet\|No Regis-tracked images yet" plugins/regis/src/components/*.test.tsx`. For each exact-string assertion found, update it to the new wording:
- `'No history recorded yet.'` → `'No history recorded.'`
- `'No history.'` → `'No history recorded.'`
- `'No data yet.'` → `'No portfolio data yet.'`
- `'Not enough history to plot a trend yet.'` → `'Not enough history to plot a trend.'`
- `'No Regis-tracked images yet.'` → `'No Regis-tracked images.'`
Regex assertions like `/No Regis-tracked images/` or `/Not enough history/` already match the new text — leave them.

- [ ] **Step 4: Run the affected component test suites**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTrajectoryCard.test.tsx plugins/regis/src/components/RegisImagePostureCard.test.tsx plugins/regis/src/components/QuickLookPanel.test.tsx plugins/regis/src/components/TrajectoryChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisImagePostureCard.tsx plugins/regis/src/components/RegisTrajectoryCard.tsx plugins/regis/src/components/QuickLookPanel.tsx plugins/regis/src/components/portfolioChart.tsx plugins/regis/src/components/TrajectoryChart.tsx plugins/regis/src/components/*.test.tsx
git commit -m "feat(frontend): unify card/chart empty states via RegisEmptyState"
```

---

## Task 3: Clickable playbook attribution + detail→explorer link

**Files:**
- Modify: `plugins/regis/src/components/PostureSummary.tsx` (+ test)
- Modify: `plugins/regis/src/components/RegisTabContent.tsx` (+ test)

- [ ] **Step 1: Write the failing test for PostureSummary**

In `plugins/regis/src/components/PostureSummary.test.tsx`, add these two imports at the top of the file (next to the existing imports), since the new test needs the app context for `EntityRefLink`:
```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
```
Then ADD this test inside the `describe('PostureSummary', ...)` block (the existing `report` fixture's `playbooks[0].playbook_name` is `base-image-policy`; keep the existing plain-`render` tests unchanged):
```tsx
  it('links the playbook name to its entity when playbookRef is given', async () => {
    await renderInTestApp(
      <PostureSummary report={report} ladder={ladder} playbookRef="resource:default/regis-playbook-default" />,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    const link = await screen.findByText('base-image-policy');
    expect(link.closest('a')).toHaveAttribute('href', '/catalog/default/resource/regis-playbook-default');
  });
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureSummary.test.tsx`
Expected: FAIL — `PostureSummary` has no `playbookRef` prop, so the name is plain text (no `<a>`).

- [ ] **Step 3: Edit `PostureSummary.tsx`**

1. Add `import { EntityRefLink } from '@backstage/plugin-catalog-react';`.
2. Add `playbookRef?: string` to the props type: `export function PostureSummary(props: { report: Report; ladder: TrendBand[]; playbookRef?: string }) {` and destructure `playbookRef`.
3. Replace the `<strong>{pb.playbook_name}</strong>` with a conditional link:
```tsx
            Evaluated by playbook{' '}
            {playbookRef ? (
              <EntityRefLink entityRef={playbookRef}>{pb.playbook_name}</EntityRefLink>
            ) : (
              <strong>{pb.playbook_name}</strong>
            )}
```

- [ ] **Step 4: Run it, verify PASS**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/PostureSummary.test.tsx`
Expected: PASS (existing tests + the new link test).

- [ ] **Step 5: Write the failing test for RegisTabContent**

READ `plugins/regis/src/components/RegisTabContent.test.tsx`. The entity fixture used there needs the playbook annotation and the report needs a playbook name. Update the entity to include `annotations: { 'regis.io/report-url': '...', 'regis.io/playbook': 'resource:default/regis-playbook-default' }`, ensure the mocked report's `playbooks: [{ playbook_name: 'base-image-policy', playbook_version: '2.3' }]`, and ADD inside the nominal test:
```tsx
    const explore = await screen.findByText('View in explorer');
    expect(explore.closest('a')).toHaveAttribute('href', '/?groupBy=playbook&playbook=base-image-policy');
```

- [ ] **Step 6: Run it, verify FAIL**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTabContent.test.tsx`
Expected: FAIL — no "View in explorer" link yet.

- [ ] **Step 7: Edit `RegisTabContent.tsx`**

Replace the whole file with:
```tsx
import {
  Content,
  Link,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import { REGIS_ANNOTATION_PLAYBOOK } from '@regis/backstage-plugin-regis-common';
import { PostureSummary } from './PostureSummary';
import { RuleTable } from './RuleTable';
import { useReportAndLadder } from './useReportAndLadder';

/** Full Regis report tab: posture summary → rule table, with navigation links. */
export function RegisTabContent() {
  const { entity } = useEntity();
  const { value, loading, error } = useReportAndLadder();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const { report, ladder } = value!;
  const rules = report.rules ?? [];
  const playbookRef = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK];
  const playbookName = report.playbooks?.[0]?.playbook_name;
  const exploreHref = playbookName
    ? `/?groupBy=playbook&playbook=${encodeURIComponent(playbookName)}`
    : undefined;

  return (
    <Content>
      <Box display="flex" flexDirection="column" gridGap={16}>
        {exploreHref && (
          <Box>
            <Link to={exploreHref}>View in explorer</Link>
          </Box>
        )}
        <PostureSummary report={report} ladder={ladder} playbookRef={playbookRef} />
        <RuleTable rules={rules} rulesSummary={report.rules_summary} />
      </Box>
    </Content>
  );
}
```

- [ ] **Step 8: Run it, verify PASS**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisTabContent.test.tsx`
Expected: PASS. (If the test file lacks `mountedRoutes` for `EntityRefLink` from the now-linked playbook name, add `{ mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } }` to its render — import `entityRouteRef` from `@backstage/plugin-catalog-react`.)

- [ ] **Step 9: Commit**

```bash
git add plugins/regis/src/components/PostureSummary.tsx plugins/regis/src/components/PostureSummary.test.tsx plugins/regis/src/components/RegisTabContent.tsx plugins/regis/src/components/RegisTabContent.test.tsx
git commit -m "feat(frontend): clickable playbook attribution + detail→explorer link"
```

---

## Task 4: Explorer empty state + Clear-filters CTA

**Files:**
- Modify: `plugins/regis/src/components/RegisExplorerPage.tsx` (+ test)

- [ ] **Step 1: Write the failing test**

In `plugins/regis/src/components/RegisExplorerPage.test.tsx`, ADD a test (the existing tests show the render helper and `entityRouteRef` usage; an active filter is set via the initial route). Use `renderInTestApp(node, { routeEntries: ['/?groupBy=system&system=shop'], mountedRoutes: {...} })`:

```tsx
  it('offers Clear filters in the empty state when a filter is active', async () => {
    const emptyExplore = jest.fn().mockResolvedValue({
      filters: { system: 'shop' },
      groupBy: 'system',
      trend: { bands: [], buckets: [] },
      groups: [],
      images: [],
      facets: { systems: ['shop'], owners: [], playbooks: [], tiers: ['Gold'] },
    });
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, { ...api, explore: emptyExplore }]]}>
        <RegisExplorerPage />
      </TestApiProvider>,
      {
        routeEntries: ['/?groupBy=system&system=shop'],
        mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
      },
    );
    expect(await screen.findByText('No images match this scope.')).toBeInTheDocument();
    const clear = await screen.findByText('Clear filters');
    fireEvent.click(clear);
    await waitFor(() => expect(screen.queryByText('Clear filters')).not.toBeInTheDocument());
  });
```
(Reuse the existing `api`, `regisApiRef`, `TestApiProvider`, `entityRouteRef`, `fireEvent`, `waitFor` imports already in the file; add any that are missing.)

- [ ] **Step 2: Run it, verify FAIL**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: FAIL — current empty state is plain text with no "Clear filters".

- [ ] **Step 3: Edit `RegisExplorerPage.tsx`**

1. Add imports: `import { Link } from '@backstage/core-components';` and `import { RegisEmptyState } from './RegisEmptyState';`.
2. Replace the empty-state line inside `body()`:
```tsx
    if (data.images.length === 0) {
      return <Typography>No images match this scope yet.</Typography>;
    }
```
with:
```tsx
    if (data.images.length === 0) {
      const hasFilters = Object.keys(state.filters).length > 0;
      return (
        <RegisEmptyState
          title="No images match this scope."
          action={
            hasFilters ? (
              <Link
                component="button"
                onClick={() => setState({ groupBy: state.groupBy, filters: {} })}
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      );
    }
```
(If `Typography` becomes unused in the file after this, remove its import.)

- [ ] **Step 4: Run it, verify PASS**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisExplorerPage.test.tsx`
Expected: PASS — the new test plus the existing empty-state test (update that existing test's assertion from `No images match this scope yet.` to `No images match this scope.` if it matched the old exact string).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisExplorerPage.tsx plugins/regis/src/components/RegisExplorerPage.test.tsx
git commit -m "feat(frontend): explorer empty state + clear-filters CTA"
```

---

## Task 5: Full verification

- [ ] **Step 1: Full plugin suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS — all green.

- [ ] **Step 2: Typecheck**

Run: `yarn tsc`
Expected: no type errors.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: no errors. Fix any unused-import (e.g. a now-unused `Typography`) flagged in the touched files.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(frontend): lint/typecheck fixes for empty states & navigation"
```
