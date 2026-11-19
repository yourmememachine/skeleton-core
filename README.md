# Skeleton Core — one lean foundation, two working apps

**Kiroween 2026 · Skeleton Crew category.**

Every small service project starts by re-writing the same bones:
config loading, logging, error handling, a data layer, an HTTP layer.
Skeleton Core writes those bones **once**, properly — a lean TypeScript
core you can read in one sitting — and then proves the skeleton carries
real weight by standing **two different applications** on it:

- **`app-one-api/`** — a REST API (routes, JSON, status codes).
- **`app-two-cli/`** — a terminal task manager (commands, flags, exit codes).

Both apps drive the *same* domain service over the *same* data file.
Neither contains any business logic. Point them at one `STORE_FILE` and
they share data live, in both directions, with zero integration code —
that is the whole argument of the skeleton, demonstrated instead of claimed.

## Quickstart

```bash
npm install
npm run build        # tsc → dist/
npm test             # 63 tests: core units + both apps' integration tests

# App 1 — the API (terminal 1)
PORT=3000 npm run start:api
curl localhost:3000/health
curl -X POST localhost:3000/tasks -H 'content-type: application/json' -d '{"title":"Raise the skeleton"}'
curl localhost:3000/tasks

# App 2 — the CLI (terminal 2, same data file)
npm run start:cli -- add "Wire the second app"
npm run start:cli -- list
npm run start:cli -- done <id-prefix>
```

Requires Node 20+. No runtime dependencies — the runtime is pure Node
standard library; the only dev dependencies are TypeScript and
@types/node.

Two notes for a first run: the `start:*` scripts rebuild before they
launch, so allow a few seconds and wait for the API's `listening` /
`app-one-api ready` log lines before curling. And `STORE_FILE` is
resolved relative to the working directory (default `data/tasks.json`)
— run from the repo root, as the scripts above do, or set an absolute
path so both apps point at the same file.

## The core (`skeleton-core/src/`)

| Module | One job |
|---|---|
| `config.ts` | Env config, validated once at startup, fail-fast messages. |
| `logger.ts` | Structured JSON logging behind a swappable interface. |
| `errors.ts` | `AppError` / `NotFoundError` / `ValidationError` — errors as values at boundaries. |
| `store.ts` | JSON-file store: lockfile-serialised atomic writes, mtime-keyed cache so another process's writes are picked up live. |
| `tasks.ts` | The domain service: the task model + all validation, shared by both apps. |
| `http.ts` | Router on `node:http` — patterns with `:params`, JSON in/out, error→status mapping. |
| `cli.ts` | argv parsing, subcommand dispatch, error→exit-code mapping. |
| `shutdown.ts` | Graceful SIGINT/SIGTERM cleanup. |

The design rule that makes it work: **transports translate, the core
decides.** Validation lives in the domain service, never in a route or a
command; transports only convert `AppError`s into HTTP statuses or exit
codes. Add a third transport tomorrow and the core does not change.

## Concurrency: two apps, one file

Sharing one store file between the API and the CLI is safe by design:

- **Writes are serialised by a lockfile.** Every write runs under an
  exclusive `<store>.lock` (created with `wx`, retried with a small
  jittered backoff, and broken if it is more than ~10 s old — a crashed
  writer never wedges the store). Inside the lock the write is still
  the atomic temp-file-then-rename, and read-modify-write operations
  reload first if the file changed, so two processes cannot lose each
  other's updates.
- **Reads never lock.** They use the mtime-keyed cache: another
  process's committed write is picked up on the next read.
- **IDs differ by transport, on purpose.** The API addresses tasks by
  their full UUID (`GET /tasks/<uuid>`); the CLI also accepts the
  8-character prefixes it prints, because humans copy those. Prefix
  resolution is a CLI convenience, not part of the API contract.

## How Kiro was used

This project was built spec-first in Kiro, and the artefacts are in the
repo, in `/.kiro` at the root:

- **Steering** (`.kiro/steering/`) — `product.md` (lean, one-job
  modules, stdlib-first), `tech.md` (strict TypeScript, Node's built-in
  test runner, fail-fast config), `structure.md` (layout + the rule
  that apps import the core only through its index).
- **Specs** (`.kiro/specs/skeleton-core/`) — `requirements.md` →
  `design.md` → `tasks.md`. The core's spec was written before either
  app's wiring; both apps were then generated against the finished,
  tested core rather than alongside it.
- **Hooks** (`.kiro/hooks/`) — three agent hooks used during the build:
  `spec-check-on-save` (flag drift between spec and core code),
  `typecheck-and-test-on-core-change` (a core edit re-runs the full
  suite — the core is shared, so both apps must still pass), and
  `test-on-task-complete` (when the spec's task list is edited, an
  agent runs the full suite and reports the counts before work moves
  on).

The spec-driven flow earned its keep once in a way worth mentioning:
the first live run of both apps together exposed that the store's
in-memory cache hid the other process's writes. The fix — keying the
cache on the file's mtime — went into the spec's design notes and the
store module, with a regression test, instead of becoming a workaround
in one of the apps.

## Layout

```
.kiro/            steering, specs, hooks (required at repo root)
skeleton-core/    the template: src/ + test/
app-one-api/      proof app 1: REST API (src/app.ts router, src/main.ts wiring)
app-two-cli/      proof app 2: CLI
```

## Licence

MIT — see `LICENSE`.
