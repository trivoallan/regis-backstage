---
'@regis/backstage-plugin-regis-backend': minor
---

Add a provider-free source of authoritative playbook tier ladders: the backend
now reads `regis.playbooks` config (id, title, version, owner, ordered `tiers`)
and feeds it to the ladder resolver when `regis.catalog.indexDirUrl` is unset.
This keeps `GET /playbooks` (and the report viewer's tier rank) authoritative —
instead of falling back to alphabetical discovery — without minting catalog
entities. The published report index still wins when it is wired.
