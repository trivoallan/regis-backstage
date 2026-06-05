# Simplify nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the app sidebar to show only the image-management nav items (Portfolio, Catalog, Create, Search, Settings) and drop the rest.

**Architecture:** App-shell-only change to `packages/app/src/modules/nav/Sidebar.tsx` — explicitly `nav.take()` the kept pages, remove `nav.rest()`, the Notifications item, and the Visualizer. Plugins stay loaded (`app.packages: all`), so entity tabs and direct URLs are unaffected.

**Tech Stack:** TypeScript, React, Backstage new frontend system (`NavContentBlueprint`), `@backstage/core-components` Sidebar primitives, Jest + `@testing-library/react`.

**Test runner (this repo):** `node_modules/.bin/backstage-cli repo test --watch=false <path>`.

---

## Reference (verified)

- The Regis explorer (Portfolio) page extension id is **`page:regis`** (the plugin dist exports exactly one page key, `page:regis`; `title: 'Portfolio'`, `path: '/'`). So the nav key is `nav.take('page:regis')`.
- Current `Sidebar.tsx` takes `page:catalog` + `page:scaffolder`, then `nav.rest({ sortBy: 'title' })` inside a `SidebarScrollWrapper` (the clutter), renders a `NotificationsSidebarItem`, and a Settings group with `page:app-visualizer` + `page:user-settings`. It also special-cases the `/catalog-graph` href (default root) — that logic goes away with the catalog-graph item.
- `App.test.tsx` is a render smoke test (sets a minimal `APP_CONFIG`, renders `App.createRoot()`, waits for `baseElement`).

## File structure

- Modify: `packages/app/src/modules/nav/Sidebar.tsx` (the only behavioral change).
- Modify: `packages/app/src/App.test.tsx` (add a nav assertion).

---

## Task 1: Curate the sidebar

**Files:**
- Modify: `packages/app/src/modules/nav/Sidebar.tsx`
- Test: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Write the failing/guard test**

In `packages/app/src/App.test.tsx`, add `screen` to the testing-library import:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
```
Then ADD this test after the existing `'should render'` test (it reuses the same `APP_CONFIG` env setup — copy that `process.env = {...}` block into this test too, or hoist it into a `beforeEach`; simplest is to duplicate the env block at the top of this test):
```tsx
  it('shows a curated, image-management nav', async () => {
    process.env = {
      NODE_ENV: 'test',
      APP_CONFIG: [
        {
          data: {
            app: { title: 'Test' },
            backend: { baseUrl: 'http://localhost:7007' },
            techdocs: { storageUrl: 'http://localhost:7007/api/techdocs/static/docs' },
          },
          context: 'test',
        },
      ] as any,
    };

    render(App.createRoot());

    // The kept image-management items render (this also catches a wrong
    // Portfolio nav key — with nav.rest() removed, a bad key means Portfolio
    // never appears).
    expect(await screen.findByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    // A generic Backstage nav item is NOT shown in the sidebar.
    expect(screen.queryByText('Kubernetes')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails (or guards)**

Run: `node_modules/.bin/backstage-cli repo test --watch=false packages/app/src/App.test.tsx`
Expected: FAIL — with the current sidebar, "Portfolio" renders via `nav.rest()` but so does "Kubernetes" (if the full plugin set loads in the test harness), so the `queryByText('Kubernetes')` assertion fails. If the harness does NOT load the kubernetes plugin (so "Kubernetes" is already absent), this test instead acts as a post-change guard — proceed to implement; the meaningful assertion is then that "Portfolio"/"Catalog" still render after `nav.rest()` is removed.

- [ ] **Step 3: Replace `Sidebar.tsx`**

Replace the entire contents of `packages/app/src/modules/nav/Sidebar.tsx` with:
```tsx
import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';

/**
 * Curated sidebar: only the image-management surfaces. Plugins stay loaded
 * (entity tabs and direct URLs are unaffected) — this just trims the nav.
 */
export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const nav = navItems.withComponent(item => (
        <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
      ));

      nav.take('page:search'); // search is the modal below, not a nav page

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {nav.take('page:regis')}
            {nav.take('page:catalog')}
            {nav.take('page:scaffolder')}
          </SidebarGroup>
          <SidebarSpace />
          <SidebarDivider />
          <SidebarGroup
            label="Settings"
            icon={<UserSettingsSignInAvatar />}
            to="/settings"
          >
            {nav.take('page:user-settings')}
          </SidebarGroup>
        </Sidebar>
      );
    },
  },
});
```
This removes: `SidebarScrollWrapper` + `nav.rest(...)`, the `NotificationsSidebarItem`, the `page:app-visualizer` take, and the `/catalog-graph` default-root special case. Their imports are dropped accordingly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/backstage-cli repo test --watch=false packages/app/src/App.test.tsx`
Expected: PASS — "Portfolio" and "Catalog" render; "Kubernetes" is absent.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/modules/nav/Sidebar.tsx packages/app/src/App.test.tsx
git commit -m "feat(app): curate sidebar to image-management surfaces"
```

---

## Task 2: Full verification

- [ ] **Step 1: App package tests**

Run: `node_modules/.bin/backstage-cli repo test --watch=false packages/app`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `yarn tsc`
Expected: no type errors. In particular, confirm no unused-import errors in `Sidebar.tsx` (the removed `SidebarScrollWrapper` / `NotificationsSidebarItem` imports must be gone).

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/backstage-cli repo lint --since origin/main`
Expected: no errors. Fix any unused-import / import-order issues in `Sidebar.tsx`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(app): lint/typecheck fixes for the curated sidebar"
```
If nothing needed fixing, do NOT create an empty commit.

---

## Manual verification (carry into review)

`yarn start` → the sidebar shows only: Search, Portfolio, Catalog, Create, Settings. APIs / Catalog Graph / Docs / Kubernetes / Notifications / Visualizer / Register Existing are gone from the sidebar, but `/catalog`, an entity's tabs, and direct URLs (e.g. `/catalog-graph`) still work.
