# @regis/backstage-plugin-regis-common

Shared contract for the Regis Backstage plugin: generated types, a runtime
report validator, and catalog annotation helpers. Consumed by the frontend
(`@regis/backstage-plugin-regis`) and backend
(`@regis/backstage-plugin-regis-backend`) plugins.

`src/types.ts` and `src/schema/report.schema.json` are **generated** from the
core `report.schema.json` by `yarn generate:contract` — do not edit them by hand.
