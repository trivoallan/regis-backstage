# regis-backstage

Backstage plugin suite that renders [Regis](https://github.com/trivoallan/regis) container security
posture inside a developer portal, and lets teams onboard an image without leaving it.

Four workspace plugins:

| Plugin | Role |
|---|---|
| `regis` | Frontend. Renders posture for a catalog entity: analyzer sections, rule verdicts, scores. |
| `regis-backend` | Serves Regis reports to that frontend. |
| `regis-common` | The contract both sides share — types, validator, catalog annotations. |
| `regis-scaffolder-backend` | Scaffolder actions for image intake: onboarding an image opens an index PR. |

The split exists so the contract is a dependency rather than a convention: the frontend and the
backend cannot drift on the shape of a report without the build saying so.

## What this is not

This is a plugin suite, not a deployment. It expects a Backstage instance, a catalog whose entities
carry the Regis annotations defined in `regis-common`, and somewhere to read reports from. Wiring
those is yours.

It has not been run outside its own demo intake target
([regis-backstage-demo](https://github.com/trivoallan/regis-backstage-demo)). Treat it as working
code that has not yet met someone else's catalog.

## Layout

```
plugins/regis                    frontend
plugins/regis-backend            report API
plugins/regis-common             shared contract
plugins/regis-scaffolder-backend intake actions
```

Standard Backstage workspace — `yarn install`, then `yarn start` for the local app.
