# Simplify the app navigation to image-management surfaces

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** App shell only (`packages/app`). No plugin, backend, or schema changes.

## Summary

The app is a Backstage instance whose reason for existing is the Regis image
plugins, but its sidebar shows the full stock Backstage navigation (APIs, Catalog
Graph, TechDocs, Kubernetes, Notifications, Visualizer, Register Existing…). This
clutter comes from `packages/app/src/modules/nav/Sidebar.tsx`, which renders
`nav.rest()` (every other plugin's nav item) plus a `NotificationsSidebarItem`
and the visualizer. Rewrite that sidebar to show **only the image-management
surfaces**, leaving all plugins/routes loaded so entity-page tabs and direct URLs
keep working.

This is the "nav-only" approach: a navigation simplification, not a removal of
features.

## Goals

- The sidebar shows only: **Portfolio** (the Regis explorer at `/`), **Catalog**,
  **Create** (image intake/scaffolder), **Search** (catalog search modal), and
  **Settings**.
- Everything else is gone from the sidebar.

## Non-goals

- No disabling of plugin pages/routes (`/catalog-graph`, `/api-docs`,
  `/docs`, `/kubernetes`, `/notifications`, `/visualizer` still resolve by URL and
  as entity-page tabs). A later pass can disable them via app-config if wanted.
- No change to entity-page tabs/cards.
- No backend, plugin, or schema changes. `app.packages: all` stays (plugins remain
  available; only the sidebar composition changes).

## Current state (verified)

`packages/app/src/modules/nav/Sidebar.tsx` is a `NavContentBlueprint` that renders:
- the logo, a Search group (the `SidebarSearchModal`),
- a "Menu" group with `nav.take('page:catalog')`, `nav.take('page:scaffolder')`,
  then **`nav.rest({ sortBy: 'title' })`** inside a scroll wrapper — this dumps
  every remaining plugin nav item (api-docs, catalog-graph, techdocs, kubernetes,
  catalog-import, **regis Portfolio**, …),
- a `NotificationsSidebarItem`,
- a Settings group with `nav.take('page:app-visualizer')` and
  `nav.take('page:user-settings')`.

Nav items are addressed by their page extension id (e.g. `page:catalog`).

## Architecture

Modify only `packages/app/src/modules/nav/Sidebar.tsx`. Keep the logo, the Search
modal group, and the overall `Sidebar`/`SidebarGroup` scaffolding. Change the
body to:

- **Menu group** — explicitly take the three image-management pages, in order:
  - `nav.take('page:regis/explorer')` (Portfolio — the home)
  - `nav.take('page:catalog')`
  - `nav.take('page:scaffolder')` (Create)
  - **Remove** `nav.rest(...)` and its `SidebarScrollWrapper`.
- **Settings group** — `nav.take('page:user-settings')` only; **remove**
  `nav.take('page:app-visualizer')`.
- **Remove** the `NotificationsSidebarItem` and its surrounding dividers.
- Drop the now-unused imports (`SidebarScrollWrapper`, `NotificationsSidebarItem`,
  and `app-visualizer`-related, if any).

Other nav modules files (`LogoFull`, `LogoIcon`, `SidebarLogo`, `index.ts`) are
unchanged.

The Portfolio nav key is expected to be `page:regis/explorer` (PageBlueprint
`name: 'explorer'` in plugin `regis`). **Confirm during planning** against
`plugins/regis/src/plugin.tsx`; if the runtime id differs (e.g. `page:regis`),
use that key instead. `nav.take` on a non-existent key would silently render
nothing, so the test below guards it.

## Edge cases

- **Unknown nav key** (wrong Portfolio id) → that item silently doesn't render;
  the App test asserting "Portfolio" is present catches it.
- **`nav.rest()` removed** → any future plugin's nav item won't appear in the
  sidebar unless explicitly `take`-n. That is the intended behavior (curated nav).
- Plugins remain loaded, so `/catalog-graph`, `/docs`, etc. still resolve by URL
  and as entity tabs — only the sidebar entries are gone.

## Testing

`packages/app/src/App.test.tsx` is currently a render smoke test. Extend it (or add
a sibling test) to render the app and, after `waitFor`, assert the simplified nav:

- **Present:** `Portfolio`, `Catalog`, `Create` (and `Settings`).
- **Absent:** at least one removed item — e.g. `Kubernetes` and `APIs` are NOT in
  the document.

This both verifies the curation and catches a wrong Portfolio `nav.take` key
(Portfolio would be absent). Use tolerant queries (`findByText` / `waitFor` +
`queryByText(...).not`). If full-app render makes nav assertions flaky in this
harness, fall back to asserting only the smoke render plus the presence of
`Portfolio`, and document the limitation.

## Out of scope / future

- Disabling the generic plugin pages/routes via `app-config` `extensions`
  (`{ disabled: true }`).
- Pruning generic entity-page tabs (Kubernetes/TechDocs/API) from image entities.
