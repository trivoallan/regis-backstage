# Regis demo data

A realistic example dataset for the Regis Backstage plugins, modelling an
e-commerce platform (`System: shop`).

## What's here

| File | What it is |
| --- | --- |
| `org.yaml` | `guests` + four teams (`team-storefront`, `team-search`, `team-payments`, `team-platform`). |
| `regis-catalog.yaml` | The `shop` System, 5 services, 7 `container-image` Resources (incl. a shared `nginx` with a linked alias), and 2 `regis-playbook` Resources. |
| `reports/*.json` | One realistic `report.json` per image — varied tiers (Gold/Silver/Bronze), scores, rules grouped by tag (security / supply-chain / hygiene / observability), and CVE counts. |
| `regis-index.d/` | The published **report index** as fragments (index.json + one images/<slug>.json per image), consumed by the Phase 2 entity provider. |
| `regis-history.json` | Synthetic per-image score/tier **history** (3 monthly snapshots each); fed to the backend via `regis.catalog.historySeedUrl` to populate the **Trajectory** card. |
| `regis-dataset.cjs` | Generator — the single source of truth. Edit this, then run `node examples/regis-dataset.cjs`, not the generated files. |
| `regis-demo.yaml` | A standalone Phase 1 example: a `Component` carrying `regis.io/report-url` directly. |

The dataset is intentionally varied: `payments-gateway` is assessed against the
stricter `pci-dss` playbook; `search` is Bronze (high CVEs, runs as root,
unsigned); `nginx:1.27` is shared by two services and aliased to `nginx:latest`
(same digest → cross-linked via `regis.io/image-aliases`).

## Running the demo

The reports are fetched **server-side** by the backend, so they must be reachable
over HTTP. Serve this folder:

```bash
npx http-server examples -p 8080
```

Report URLs then resolve at `http://localhost:8080/reports/<name>.json` (already
wired into `regis-catalog.yaml` and `regis-index.d`).

Then start the app (from the repo root):

```bash
yarn start
```

What to look at:

- **An image** (catalog → Kind = Resource → e.g. `shop-search-8.12.0`): the Regis
  tab (rules by tag, CVE counts) and scorecard card, plus `dependsOn` the playbook
  and `regis.io/tier` / `regis.io/score-band` labels.
- **A service** (e.g. `checkout-api`): the **"Images of this service"** card
  summarising the posture of the images it depends on.
- **A playbook** (e.g. `regis-playbook-pci-dss`): the **"Assessed images"** card.
- **The `/regis` page**: every image with Image / Kind / Tier / Score / Failing tags.
- **Trajectory** (on an image, e.g. `shop-search-8.12.0`): the score/tier
  sparkline over time — `search` visibly declines Gold → Silver → Bronze.

To also exercise the **entity provider** (Phase 2), set
`regis.catalog.indexDirUrl: file://$PWD/examples/regis-index.d` in `app-config.yaml`
(commented out by default) — it mints the same entities from the index instead of
the static `regis-catalog.yaml`.

To populate the **Trajectory** card with history, also set
`regis.catalog.historySeedUrl: http://localhost:8080/regis-history.json` in
`app-config.yaml`. The backend loads it once on boot (idempotent).

**Note:** the synthetic history seed covers the **canonical** image tags only. Alias
entities (e.g. `nginx:latest`, which shares a digest with `nginx:1.27`) are tracked
as separate image refs, so their Trajectory card stays empty under seed-only data —
browse `nginx:1.27` to see the seeded trajectory. (Alias refs do populate over time
once `regis.catalog.indexUrl` is set and the recorder runs.)
