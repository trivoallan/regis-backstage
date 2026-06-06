# Playbook page scorecard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the playbook entity overview the same scorecard-over-detail layout as the image page — a synthesis card (tier ladder + posture rollup) in the top grid and a full-width assessed-images table below — by extracting shared units and splitting the current combined card.

**Architecture:** Reuse the new frontend system's `info`/`content` card grouping. Extract a shared data hook (`useImageReports`) and the image table (`ImagePostureTable`) so the playbook scorecard, the playbook images card, and the existing service card all share one implementation. The two playbook cards both load through `RegisClient`, whose in-flight GET dedup (already shipped) collapses their duplicate fetches.

**Tech Stack:** TypeScript, React, Backstage new frontend system (`@backstage/frontend-plugin-api`, `@backstage/plugin-catalog-react/alpha`), Material UI v4, Jest + `@backstage/frontend-test-utils` + Testing Library.

---

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `plugins/regis/src/components/format.ts` | Formatting/ladder helpers | Modify: add `playbookLadder` |
| `plugins/regis/src/components/format.test.ts` | Helper tests | Modify: add `playbookLadder` cases |
| `plugins/regis/src/components/useImageReports.ts` | Data hook: reports filtered to imageRefs + ladder | Create |
| `plugins/regis/src/components/useImageReports.test.tsx` | Hook test | Create |
| `plugins/regis/src/components/ImagePostureTable.tsx` | Image/Tier/Score table (presentational) | Create |
| `plugins/regis/src/components/ImagePostureTable.test.tsx` | Table test | Create |
| `plugins/regis/src/components/RegisImagePostureCard.tsx` | Combined rollup+table card (service page) | Modify: reuse hook + table |
| `plugins/regis/src/components/TierLadder.tsx` | Playbook tier ladder chips | Create |
| `plugins/regis/src/components/TierLadder.test.tsx` | Ladder test | Create |
| `plugins/regis/src/components/RegisPlaybookScorecard.tsx` | Playbook synthesis card | Create |
| `plugins/regis/src/components/RegisPlaybookScorecard.test.tsx` | Scorecard test | Create |
| `plugins/regis/src/components/RegisRelatedImagesCards.tsx` | Service + playbook image cards | Modify: repurpose `RegisPlaybookImagesCard` full-width |
| `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx` | Related-cards tests | Modify: add empty-state case |
| `plugins/regis/src/plugin.tsx` | Extension wiring | Modify: add `playbookScorecard`, set `playbookImagesCard` to `content` |

**Working directory:** all commands run from the worktree root
`/Users/tristan/Documents/Workspaces/trivoallan/regis-backstage/.claude/worktrees/ecstatic-mendeleev-ed034d`. `node_modules` is already installed in this worktree.

**Test runner:** `node_modules/.bin/backstage-cli repo test --watch=false <path>` (yarn does not put `backstage-cli` on PATH in this repo).

---

## Task 1: Add the `playbookLadder` helper

**Files:**
- Modify: `plugins/regis/src/components/format.ts`
- Test: `plugins/regis/src/components/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `plugins/regis/src/components/format.test.ts`, add `playbookLadder` to the existing import from `./format`:

```ts
import { tierColor, unionLadder, badgeClassColor, scoreBarColor, playbookLadder } from './format';
```

Then append this `describe` block at the end of the file:

```ts
describe('playbookLadder', () => {
  const playbooks: PlaybookLadder[] = [
    { id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] },
    { id: 'pci-dss', tiers: [{ key: 'Pass', label: 'Pass', color: '#2e7d32' }] },
  ];

  it('returns the matching playbook tiers', () => {
    expect(playbookLadder(playbooks, 'pci-dss')).toEqual([
      { key: 'Pass', label: 'Pass', color: '#2e7d32' },
    ]);
  });

  it('returns [] for an unknown id, a missing id, or missing playbooks', () => {
    expect(playbookLadder(playbooks, 'nope')).toEqual([]);
    expect(playbookLadder(playbooks, undefined)).toEqual([]);
    expect(playbookLadder(undefined, 'default')).toEqual([]);
  });
});
```

(`PlaybookLadder` is already imported at the top of this test file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts -t playbookLadder`
Expected: FAIL — `playbookLadder` is not exported.

- [ ] **Step 3: Implement the helper**

In `plugins/regis/src/components/format.ts`, add this function (place it right after the existing `unionLadder` function):

```ts
/** The tiers of the playbook with `id`, or `[]` when the id is unknown/missing. */
export function playbookLadder(
  playbooks: PlaybookLadder[] | undefined,
  id: string | undefined,
): TrendBand[] {
  if (!id) return [];
  return playbooks?.find(p => p.id === id)?.tiers ?? [];
}
```

`PlaybookLadder` and `TrendBand` are already imported at the top of `format.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/format.ts plugins/regis/src/components/format.test.ts
git commit -m "feat(regis): add playbookLadder helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Create the `useImageReports` hook

Extracts the data-loading currently inside `RegisImagePostureCard` so multiple cards share one source.

**Files:**
- Create: `plugins/regis/src/components/useImageReports.ts`
- Test: `plugins/regis/src/components/useImageReports.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/useImageReports.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { useImageReports } from './useImageReports';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
  { entityRef: 'resource:default/other', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/o:1' },
];

const api = {
  listReports: async () => summaries,
  getReport: async () => { throw new Error('not used'); },
  getPlaybooks: async () => ({
    playbooks: [
      { id: 'default', tiers: [{ key: 'Gold', label: 'Gold', color: '#d4af37' }] },
    ],
  }),
  getHistory: async () => { throw new Error('not used'); },
  getPortfolioTrend: async () => { throw new Error('not used'); },
};

function Probe({ imageRefs }: { imageRefs: string[] }) {
  const { rows, ladder, playbooks, loading, error } = useImageReports(imageRefs);
  if (loading) return <span>loading</span>;
  if (error) return <span>error</span>;
  return (
    <span data-testid="out">
      {`rows=${rows.length} ladder=${ladder.length} playbooks=${playbooks?.length ?? 0}`}
    </span>
  );
}

const renderProbe = (imageRefs: string[]) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, api]]}>
      <Probe imageRefs={imageRefs} />
    </TestApiProvider>,
  );

describe('useImageReports', () => {
  it('filters reports to the requested imageRefs and exposes ladder + playbooks', async () => {
    renderProbe(['resource:default/a', 'resource:default/b']);
    expect(await screen.findByTestId('out')).toHaveTextContent(
      'rows=2 ladder=1 playbooks=1',
    );
  });

  it('returns no rows when none of the imageRefs have a report', async () => {
    renderProbe(['resource:default/missing']);
    expect(await screen.findByTestId('out')).toHaveTextContent('rows=0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/useImageReports.test.tsx`
Expected: FAIL — `Cannot find module './useImageReports'`.

- [ ] **Step 3: Implement the hook**

Create `plugins/regis/src/components/useImageReports.ts`:

```ts
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import type { PlaybookLadder, TrendBand } from '@regis/backstage-plugin-regis-common';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { unionLadder } from './format';

/**
 * Loads the catalog-wide report summaries and the published playbook ladders,
 * then narrows the summaries to the given image entityRefs. Shared by every
 * image-posture surface (service card, playbook scorecard, playbook table).
 */
export function useImageReports(imageRefs: string[]): {
  rows: ReportSummary[];
  ladder: TrendBand[];
  playbooks: PlaybookLadder[] | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(regisApiRef);
  const { value, loading, error } = useAsync(
    () => Promise.all([api.listReports(), api.getPlaybooks()]),
    [],
  );
  const [reports, playbooksResp] = value ?? [undefined, undefined];
  const ladder = unionLadder(playbooksResp?.playbooks);
  const wanted = new Set(imageRefs);
  const rows = (reports ?? []).filter(r => wanted.has(r.entityRef));
  return { rows, ladder, playbooks: playbooksResp?.playbooks, loading, error };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/useImageReports.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/useImageReports.ts plugins/regis/src/components/useImageReports.test.tsx
git commit -m "feat(regis): extract useImageReports data hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Extract the `ImagePostureTable` component

**Files:**
- Create: `plugins/regis/src/components/ImagePostureTable.tsx`
- Test: `plugins/regis/src/components/ImagePostureTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/ImagePostureTable.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { type ReportSummary } from '../api/RegisApi';
import { ImagePostureTable } from './ImagePostureTable';

const ladder: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

const rows: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
];

describe('ImagePostureTable', () => {
  it('renders a row per image, worst tier first', async () => {
    await renderInTestApp(<ImagePostureTable rows={rows} ladder={ladder} />, {
      mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
    });
    expect(await screen.findByText('r/a:1')).toBeInTheDocument();
    expect(screen.getByText('r/b:1')).toBeInTheDocument();
    const ordered = screen.getAllByText(/r\/[ab]:1/);
    expect(ordered[0]).toHaveTextContent('r/b:1');
    expect(ordered[1]).toHaveTextContent('r/a:1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImagePostureTable.test.tsx`
Expected: FAIL — `Cannot find module './ImagePostureTable'`.

- [ ] **Step 3: Implement the component**

Create `plugins/regis/src/components/ImagePostureTable.tsx` (this is the `makeColumns` + `Table` block lifted verbatim from `RegisImagePostureCard.tsx`):

```tsx
import { Table, type TableColumn } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { type ReportSummary } from '../api/RegisApi';
import { scoreBarColor, tierColor } from './format';
import { sortSummariesWorstFirst } from './rollup';

function makeColumns(ladder: TrendBand[]): TableColumn<ReportSummary>[] {
  return [
    {
      title: 'Image',
      field: 'imageRef',
      render: row => (
        <EntityRefLink entityRef={row.entityRef}>
          {row.imageRef ?? row.entityRef}
        </EntityRefLink>
      ),
    },
    {
      title: 'Tier',
      field: 'tier',
      render: row =>
        row.tier ? (
          <Chip
            size="small"
            label={row.tier}
            style={{ backgroundColor: tierColor(row.tier, ladder), color: '#fff' }}
          />
        ) : (
          <>—</>
        ),
    },
    {
      title: 'Score',
      field: 'score',
      type: 'numeric',
      render: row => (
        <Box display="flex" alignItems="center" gridGap={8} justifyContent="flex-end">
          <span>{row.score ?? '—'}</span>
          {row.score !== undefined && (
            <div style={{ width: 64, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
              <div style={{ width: `${row.score}%`, height: '100%', background: scoreBarColor(row.score) }} />
            </div>
          )}
        </Box>
      ),
    },
  ];
}

/** Image / Tier / Score table for a set of report summaries, worst tier first. */
export function ImagePostureTable(props: { rows: ReportSummary[]; ladder: TrendBand[] }) {
  const { rows, ladder } = props;
  return (
    <Table
      columns={makeColumns(ladder)}
      data={sortSummariesWorstFirst(rows, ladder)}
      options={{
        search: false,
        toolbar: false,
        padding: 'dense',
        paging: rows.length > 10,
        pageSize: 10,
      }}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/ImagePostureTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/ImagePostureTable.tsx plugins/regis/src/components/ImagePostureTable.test.tsx
git commit -m "feat(regis): extract ImagePostureTable component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refactor `RegisImagePostureCard` to reuse the hook and table

Behavior is unchanged; the card now composes `useImageReports` + `ImagePostureTable`. The existing test must still pass.

**Files:**
- Modify: `plugins/regis/src/components/RegisImagePostureCard.tsx`
- Test (existing, must stay green): `plugins/regis/src/components/RegisImagePostureCard.test.tsx`

- [ ] **Step 1: Replace the component file**

Replace the ENTIRE contents of `plugins/regis/src/components/RegisImagePostureCard.tsx` with:

```tsx
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { ImagePostureTable } from './ImagePostureTable';
import { PostureRollup } from './PostureRollup';
import { RegisEmptyState } from './RegisEmptyState';
import { useImageReports } from './useImageReports';

/** Posture summary of a given set of image entityRefs (used by the service card). */
export function RegisImagePostureCard(props: {
  title: string;
  imageRefs: string[];
  exploreLink?: string;
}) {
  const { title, imageRefs, exploreLink } = props;
  const { rows, ladder, loading, error } = useImageReports(imageRefs);

  if (loading) {
    return (
      <InfoCard title={title}>
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title={title}>
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }
  if (rows.length === 0) {
    return (
      <InfoCard title={title}>
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
  }

  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  return (
    <InfoCard title={title} deepLink={deepLink}>
      <PostureRollup rows={rows} ladder={ladder} />
      <ImagePostureTable rows={rows} ladder={ladder} />
    </InfoCard>
  );
}
```

- [ ] **Step 2: Run the existing test to verify behavior is preserved**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisImagePostureCard.test.tsx`
Expected: PASS — all 5 existing cases (rollup, worst-first sort, deep link present/absent, empty state) still green.

- [ ] **Step 3: Typecheck**

Run: `yarn tsc`
Expected: PASS (confirms no unused imports left behind from the old implementation).

- [ ] **Step 4: Commit**

```bash
git add plugins/regis/src/components/RegisImagePostureCard.tsx
git commit -m "refactor(regis): build RegisImagePostureCard from shared hook + table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Create the `TierLadder` component

**Files:**
- Create: `plugins/regis/src/components/TierLadder.tsx`
- Test: `plugins/regis/src/components/TierLadder.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/TierLadder.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';
import { TierLadder } from './TierLadder';

const tiers: TrendBand[] = [
  { key: 'Gold', label: 'Gold', color: '#d4af37' },
  { key: 'Silver', label: 'Silver', color: '#9ca3af' },
  { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
];

describe('TierLadder', () => {
  it('renders a colored chip per tier', () => {
    render(<TierLadder tiers={tiers} />);
    const chip = screen.getByText('Silver').closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveStyle({ backgroundColor: '#9ca3af' });
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();
  });

  it('renders nothing when there are no tiers', () => {
    const { container } = render(<TierLadder tiers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/TierLadder.test.tsx`
Expected: FAIL — `Cannot find module './TierLadder'`.

- [ ] **Step 3: Implement the component**

Create `plugins/regis/src/components/TierLadder.tsx`:

```tsx
import { Box, Chip } from '@material-ui/core';
import type { TrendBand } from '@regis/backstage-plugin-regis-common';

/** A playbook's tier ladder rendered best→worst as colored chips. */
export function TierLadder(props: { tiers: TrendBand[] }) {
  if (props.tiers.length === 0) return null;
  return (
    <Box display="flex" flexWrap="wrap" alignItems="center" gridGap={6}>
      {props.tiers.map(t => (
        <Chip
          key={t.key}
          size="small"
          label={t.label}
          style={{ backgroundColor: t.color, color: '#fff' }}
        />
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/TierLadder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/TierLadder.tsx plugins/regis/src/components/TierLadder.test.tsx
git commit -m "feat(regis): add TierLadder component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Create the `RegisPlaybookScorecard` synthesis card

**Files:**
- Create: `plugins/regis/src/components/RegisPlaybookScorecard.tsx`
- Test: `plugins/regis/src/components/RegisPlaybookScorecard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `plugins/regis/src/components/RegisPlaybookScorecard.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  EntityProvider,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { regisApiRef, type ReportSummary } from '../api/RegisApi';
import { RegisPlaybookScorecard } from './RegisPlaybookScorecard';

const summaries: ReportSummary[] = [
  { entityRef: 'resource:default/a', status: 'ok', tier: 'Gold', score: 100, imageRef: 'r/a:1' },
  { entityRef: 'resource:default/b', status: 'ok', tier: 'Bronze', score: 60, imageRef: 'r/b:1' },
];

const apiWith = (reports: ReportSummary[]) => ({
  listReports: async () => reports,
  getReport: async () => { throw new Error('not used'); },
  getPlaybooks: async () => ({
    playbooks: [
      {
        id: 'default',
        tiers: [
          { key: 'Gold', label: 'Gold', color: '#d4af37' },
          { key: 'Silver', label: 'Silver', color: '#9ca3af' },
          { key: 'Bronze', label: 'Bronze', color: '#cd7f32' },
        ],
      },
    ],
  }),
  getHistory: async () => { throw new Error('not used'); },
  getPortfolioTrend: async () => { throw new Error('not used'); },
});

const playbookEntity = (refs: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'pb', annotations: { 'regis.io/playbook-id': 'default' } },
  spec: { type: 'regis-playbook' },
  relations: refs.map(targetRef => ({ type: 'dependencyOf', targetRef })),
});

const render = (entity: Entity, reports: ReportSummary[]) =>
  renderInTestApp(
    <TestApiProvider apis={[[regisApiRef, apiWith(reports)]]}>
      <EntityProvider entity={entity}>
        <RegisPlaybookScorecard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('RegisPlaybookScorecard', () => {
  it('shows the playbook ladder, the posture rollup and the assessed count', async () => {
    render(playbookEntity(['resource:default/a', 'resource:default/b']), summaries);
    // ladder chips
    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    // rollup mix (1 Gold, 1 Bronze among assessed images)
    expect(screen.getByText('1 Gold')).toBeInTheDocument();
    expect(screen.getByText('1 Bronze')).toBeInTheDocument();
    // count caption
    expect(screen.getByText('2 assessed images')).toBeInTheDocument();
  });

  it('still shows the ladder but no rollup when no images are assessed', async () => {
    render(playbookEntity([]), summaries);
    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('No assessed images yet')).toBeInTheDocument();
    expect(screen.queryByText(/Worst:/)).not.toBeInTheDocument();
  });

  it('renders an error panel when the API fails', async () => {
    const api = {
      ...apiWith(summaries),
      listReports: async () => { throw new Error('boom'); },
    };
    await renderInTestApp(
      <TestApiProvider apis={[[regisApiRef, api]]}>
        <EntityProvider entity={playbookEntity(['resource:default/a'])}>
          <RegisPlaybookScorecard />
        </EntityProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
    );
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisPlaybookScorecard.test.tsx`
Expected: FAIL — `Cannot find module './RegisPlaybookScorecard'`.

- [ ] **Step 3: Implement the component**

Create `plugins/regis/src/components/RegisPlaybookScorecard.tsx`:

```tsx
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { REGIS_ANNOTATION_PLAYBOOK_ID } from '@regis/backstage-plugin-regis-common';
import { playbookLadder } from './format';
import { imageRefsFromRelations } from './imageRelations';
import { PostureRollup } from './PostureRollup';
import { TierLadder } from './TierLadder';
import { useImageReports } from './useImageReports';

/** Playbook synthesis: the defined tier ladder + a posture rollup of assessed images. */
export function RegisPlaybookScorecard() {
  const { entity } = useEntity();
  const imageRefs = imageRefsFromRelations(entity, 'dependencyOf');
  const { rows, ladder, playbooks, loading, error } = useImageReports(imageRefs);

  if (loading) {
    return (
      <InfoCard title="Playbook posture">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Playbook posture">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  const id = entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK_ID];
  const tiers = playbookLadder(playbooks, id);

  return (
    <InfoCard title="Playbook posture">
      <Box mb={1.5}>
        <TierLadder tiers={tiers} />
      </Box>
      <PostureRollup rows={rows} ladder={ladder} />
      <Typography variant="caption" color="textSecondary">
        {rows.length > 0
          ? `${rows.length} assessed image${rows.length === 1 ? '' : 's'}`
          : 'No assessed images yet'}
      </Typography>
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisPlaybookScorecard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisPlaybookScorecard.tsx plugins/regis/src/components/RegisPlaybookScorecard.test.tsx
git commit -m "feat(regis): add RegisPlaybookScorecard synthesis card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Repurpose `RegisPlaybookImagesCard` as the full-width table card

`RegisServiceImagesCard` is unchanged. `RegisPlaybookImagesCard` now renders the assessed-images table directly (no embedded rollup — that moved to the scorecard).

**Files:**
- Modify: `plugins/regis/src/components/RegisRelatedImagesCards.tsx`
- Test: `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`

- [ ] **Step 1: Add a failing empty-state test**

In `plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`, add this case inside the `describe('RegisPlaybookImagesCard', ...)` block (after the existing cases):

```tsx
  it('shows an empty state when the playbook has no assessed images', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name: 'pb' },
      spec: { type: 'regis-playbook' },
      relations: [{ type: 'dependencyOf', targetRef: 'resource:default/none' }],
    };
    renderWith(entity, <RegisPlaybookImagesCard />);
    expect(await screen.findByText('Assessed images')).toBeInTheDocument();
    expect(await screen.findByText(/No Regis-tracked images/)).toBeInTheDocument();
  });
```

(`resource:default/none` is not in the test's `summaries`, so the card has zero rows.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRelatedImagesCards.test.tsx -t 'empty state'`
Expected: FAIL — the current `RegisPlaybookImagesCard` delegates to `RegisImagePostureCard`, whose empty copy is "No Regis-tracked images." — this case may already pass via delegation. If it PASSES at this step, that is acceptable: proceed to Step 3 (the repurpose must keep it passing). If it FAILS, Step 3 makes it pass.

- [ ] **Step 3: Repurpose the playbook card**

Replace the ENTIRE contents of `plugins/regis/src/components/RegisRelatedImagesCards.tsx` with:

```tsx
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { ImagePostureTable } from './ImagePostureTable';
import { RegisEmptyState } from './RegisEmptyState';
import { RegisImagePostureCard } from './RegisImagePostureCard';
import { imageRefsFromRelations, playbookExploreLink } from './imageRelations';
import { useImageReports } from './useImageReports';

/** Images the current Component depends on. */
export function RegisServiceImagesCard() {
  const { entity } = useEntity();
  return (
    <RegisImagePostureCard
      title="Images of this service"
      imageRefs={imageRefsFromRelations(entity, 'dependsOn')}
    />
  );
}

/** Full-width table of the images assessed against the current playbook. */
export function RegisPlaybookImagesCard() {
  const { entity } = useEntity();
  const imageRefs = imageRefsFromRelations(entity, 'dependencyOf');
  const { rows, ladder, loading, error } = useImageReports(imageRefs);
  const exploreLink = playbookExploreLink(entity);
  const deepLink = exploreLink
    ? { title: 'View in explorer', link: exploreLink }
    : undefined;

  if (loading) {
    return (
      <InfoCard title="Assessed images">
        <Progress />
      </InfoCard>
    );
  }
  if (error) {
    return (
      <InfoCard title="Assessed images">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }
  if (rows.length === 0) {
    return (
      <InfoCard title="Assessed images">
        <RegisEmptyState title="No Regis-tracked images." />
      </InfoCard>
    );
  }

  return (
    <InfoCard title="Assessed images" deepLink={deepLink}>
      <ImagePostureTable rows={rows} ladder={ladder} />
    </InfoCard>
  );
}
```

- [ ] **Step 4: Run the related-cards test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis/src/components/RegisRelatedImagesCards.test.tsx`
Expected: PASS — all cases (service images, playbook images, explorer-link href, service has no link, new empty state).

- [ ] **Step 5: Commit**

```bash
git add plugins/regis/src/components/RegisRelatedImagesCards.tsx plugins/regis/src/components/RegisRelatedImagesCards.test.tsx
git commit -m "feat(regis): make RegisPlaybookImagesCard a full-width table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire the plugin extensions

**Files:**
- Modify: `plugins/regis/src/plugin.tsx`

- [ ] **Step 1: Set the playbook images card to a content card**

In `plugins/regis/src/plugin.tsx`, find the existing `playbookImagesCard` definition:

```tsx
const playbookImagesCard = EntityCardBlueprint.make({
  name: 'playbook-images',
  params: {
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisPlaybookImagesCard />
      )),
  },
});
```

Add `type: 'content',` as the first line of `params`:

```tsx
const playbookImagesCard = EntityCardBlueprint.make({
  name: 'playbook-images',
  params: {
    type: 'content',
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisRelatedImagesCards').then(m => (
        <m.RegisPlaybookImagesCard />
      )),
  },
});
```

- [ ] **Step 2: Add the playbook scorecard extension**

Immediately after the `playbookImagesCard` definition, add:

```tsx
const playbookScorecard = EntityCardBlueprint.make({
  name: 'playbook-scorecard',
  params: {
    filter: isRegisPlaybook,
    loader: () =>
      import('./components/RegisPlaybookScorecard').then(m => (
        <m.RegisPlaybookScorecard />
      )),
  },
});
```

- [ ] **Step 3: Register the new extension**

In the `createFrontendPlugin({ pluginId: 'regis', extensions: [...] })` array, add `playbookScorecard` immediately before `playbookImagesCard`. The array becomes:

```tsx
  extensions: [
    regisApi,
    scorecardCard,
    rulesCard,
    explorerPage,
    serviceImagesCard,
    playbookScorecard,
    playbookImagesCard,
    aliasesCard,
    trajectoryCard,
  ],
```

- [ ] **Step 4: Typecheck**

Run: `yarn tsc`
Expected: PASS.

- [ ] **Step 5: Run the full regis plugin suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/regis/src/plugin.tsx
git commit -m "feat(regis): split the playbook overview into scorecard + full-width table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Full verification

- [ ] **Step 1: Typecheck the repo**

Run: `yarn tsc`
Expected: PASS.

- [ ] **Step 2: Lint the changed files**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: PASS. If formatting fails, run `yarn fix` and re-run.

- [ ] **Step 3: Run the full regis test suite**

Run: `node_modules/.bin/backstage-cli repo test --watch=false plugins/regis plugins/regis-common`
Expected: PASS.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run `yarn start`, open a playbook entity (a `Resource` of type `regis-playbook`). Confirm: a "Playbook posture" card in the top grid showing the tier ladder chips + a posture rollup + the assessed count, and a full-width "Assessed images" table below it. Open a `Component` with image dependencies and confirm its "Images of this service" card is unchanged.

---

## Notes for the implementer

- **DRY:** `RegisPlaybookScorecard`, `RegisPlaybookImagesCard`, and `RegisImagePostureCard` all load through `useImageReports`. On a playbook page the scorecard and the images card mount together; the `RegisClient` in-flight GET dedup (already shipped) collapses their duplicate `listReports`/`getPlaybooks` calls — do not add another caching layer.
- **YAGNI:** the only layout mechanism is the `type: 'content'` field plus the new `info` scorecard. No custom entity page.
- **Scope:** do not change `RegisServiceImagesCard`'s appearance; its card stays the combined rollup+table.
