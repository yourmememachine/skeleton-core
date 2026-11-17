# Structure steering

```
.kiro/                  Specs, steering and hooks — the build's source of truth.
skeleton-core/          The template itself.
  src/                  config, logger, errors, store, tasks (domain), http, cli, shutdown.
  test/                 Unit tests for the core modules (node:test).
app-one-api/            Proof app 1: REST API. src/app.ts builds the router; src/main.ts wires a port.
app-two-cli/            Proof app 2: CLI. src/main.ts wires commands to the same core service.
dist/                   Build output (tsc), mirrors the source layout. Gitignored.
data/                   Default runtime store file location. Gitignored.
```

Rules:
- Apps import the core ONLY through `skeleton-core/src/index.ts` — never internals.
- Business logic lives in the core's domain service, never in a transport or an app.
- Every module keeps one job; a module that grows a second job gets split.
- Tests sit in a `test/` folder beside the `src/` they cover.
