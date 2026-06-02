# @regis/backstage-plugin-regis-backend

Backend for the Regis Backstage plugin. Resolves the `regis.io/report-url`
annotation, fetches + validates + caches reports, aggregates annotated entities
for the catalog page, and serves `GET /report`, `GET /reports`, `GET /health`.

## Entity provider (Phase 2)

The backend exposes `catalogModuleRegisEntityProvider`, a catalog module that mints
`Resource` entities from a published **report index**:

- `kind: Resource`, `spec.type: container-image` — one per analyzed image ref. Carries
  posture as queryable labels (`regis.io/tier`, `regis.io/score-band`) and annotation
  pointers (`regis.io/report-url`, `regis.io/image-ref`, `regis.io/image-digest`,
  `regis.io/image-aliases`, `regis.io/score`, `regis.io/playbook`). `dependsOn` the
  playbook Resource.
- `kind: Resource`, `spec.type: regis-playbook` — one per playbook (mapped from the
  regis v0.34.0 `kind: Playbook` envelope).

Aliases (tags sharing a digest) are grouped and cross-linked via `regis.io/image-aliases`.
The provider owns these entities (full mutation): images dropped from the index are removed.

### Configuration

```yaml
regis:
  catalog:
    indexUrl: https://your-host/regis/index.json # required to enable; unset = disabled
    defaultOwner: group:default/guests           # fallback owner for minted Resources
    namespace: default
    refreshMinutes: 30
```

Register it in your backend:

```ts
import { catalogModuleRegisEntityProvider } from '@regis/backstage-plugin-regis-backend';
backend.add(catalogModuleRegisEntityProvider);
```

See `examples/regis-index.json` for the index shape. The model is specified in
`docs/superpowers/specs/2026-06-01-regis-backstage-entity-model-design.md`.
