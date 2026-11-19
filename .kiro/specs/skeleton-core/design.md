# Design — skeleton-core

## Idea in one paragraph

One small core (`skeleton-core/`) owns everything a small service needs
regardless of how it is driven: configuration, logging, errors, storage,
and the domain service. A *transport* — HTTP or CLI — is a thin adapter
that translates the outside world (requests / argv) into service calls
and translates `AppError`s back out (HTTP statuses / exit codes). Two
proof apps (`app-one-api`, `app-two-cli`) contain no business logic;
each is only wiring. If a third transport (queue worker, TUI) ever
appears, it should need zero changes to the core.

## Modules (one job each)

| Module | Job |
|---|---|
| `config.ts` | Read env once, validate, fail fast with a readable message. |
| `logger.ts` | Structured JSON logs behind a swappable `Logger` interface. |
| `errors.ts` | `AppError` + `NotFoundError` (404) + `ValidationError` (400). Errors are values at module boundaries. |
| `store.ts` | JSON-file store. Atomic writes (tmp + rename); mtime+size-keyed cache so a second process's writes are picked up on the next read; a token-verified lockfile serialises writers across processes, and callers receive snapshots, never live references — this is what lets the two apps share one data file with no integration code. |
| `tasks.ts` | The domain service (`TaskService`): the task model and ALL validation. Transports never validate. |
| `http.ts` | Router on `node:http`: `METHOD /path/:param` patterns, JSON in/out, `Reply` for non-200 statuses, `AppError` → status mapping, `/health` helper. |
| `cli.ts` | argv parsing, subcommand dispatch, `AppError` → exit-code mapping (validation 2, not-found 3, other 1). |
| `shutdown.ts` | Run registered cleanups once on SIGINT/SIGTERM. |

## Data model

`Task { id (uuid), title (1–200 chars, trimmed), status: todo|doing|done, createdAt, updatedAt }`,
persisted as a JSON array in one file (`STORE_FILE`, default `data/tasks.json`).

## Error contract

- Domain code throws `AppError` subclasses only.
- HTTP transport: status from `error.httpStatus`, body `{ error: code, message }`.
- CLI transport: exit code from the error's HTTP status (400 → 2, 404 → 3, else 1) — the same mapping the HTTP transport applies, so the two transports agree on an error; message to stderr.
- Unknown errors: HTTP 500 `{ error: "INTERNAL" }` / CLI exit 1 — internals are logged, never leaked.

## Deliberate non-goals

No framework, no database, no auth, no pagination. Each is a one-module
swap later (store, or a middleware in the router) — the skeleton's job
is to make those swaps obvious, not to pre-build them.
