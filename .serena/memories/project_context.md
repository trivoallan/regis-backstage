# Project context

The authoritative project context lives in **`CLAUDE.md` at the repo root** — read it for purpose, tech stack, plugin layout (the four `plugins/regis*` packages), backend wiring, frontend (new frontend system), conventions, and commands. It is kept current and is the single source of truth; do not duplicate it here (avoids drift).

## The one quirk worth pinning
`yarn` does NOT put `backstage-cli` on PATH in this repo. Run tests/lint via the binary directly:
- `node_modules/.bin/backstage-cli repo test --watch=false <package-or-file>`
- `node_modules/.bin/backstage-cli repo lint --since origin/main`
Typecheck: `yarn tsc`. Run app: `yarn start`. Codegen after API edits: `yarn fix`.

For anything else (style guides, schema/version gating, demo-data generator, task-completion steps), see `CLAUDE.md`.
