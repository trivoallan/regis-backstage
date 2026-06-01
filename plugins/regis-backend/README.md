# @regis/backstage-plugin-regis-backend

Backend for the Regis Backstage plugin. Resolves the `regis.io/report-url`
annotation, fetches + validates + caches reports, aggregates annotated entities
for the catalog page, and serves `GET /report`, `GET /reports`, `GET /health`.
