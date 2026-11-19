# Devpost submission text — paste-ready (Kiroween 2026, Skeleton Crew)

## Project name
Skeleton Core

## Tagline
One lean TypeScript skeleton, two working apps — a REST API and a CLI that share the same core, the same data, and zero integration code.

## Category
Skeleton Crew

## Bonus prizes to select (if offered on the form)
- Best Demo Video (the demo is a tight screen capture of the cross-app flow, with a caption track recorded alongside it)

## Description (features & functionality)

Every small service project starts by re-writing the same bones: config loading, logging, error handling, a data layer, an HTTP layer. Skeleton Core writes those bones once, properly — a lean TypeScript core you can read in one sitting — and proves the skeleton carries real weight by standing two different applications on it.

**The core** (`skeleton-core/`) has one module per job: validated fail-fast config, structured JSON logging, an error contract (`AppError` → HTTP status or CLI exit code), an atomic JSON-file store, the domain service, an HTTP router on `node:http`, a CLI transport, and graceful shutdown. Runtime dependencies: none — pure Node standard library.

**Proof app 1 — `app-one-api`** is a REST API for tasks: health check, list with status filter, create (201), get, patch, delete (204), with validation and not-found errors mapped by the core. It contains no business logic — only route wiring.

**Proof app 2 — `app-two-cli`** is a terminal task manager (`add`, `list`, `get`, `done`, `edit`, `remove`) over the same service, with human output, `--json` output, id-prefix addressing, and exit codes that mirror the core's error contract.

**The demonstration that matters:** point both apps at the same `STORE_FILE` and they share data live, in both directions — add a task in the terminal and it appears in the API; mark it done in the CLI and the API's filtered view changes; post through the API and the CLI lists it. The store's mtime+size-keyed cache is what makes a second process's writes visible with no integration code and no database.

63 automated tests cover the core units and both apps end-to-end, including cross-app integration tests that share data in both directions — API writes read back by the CLI, and CLI writes and removals picked up live by an already-running API server.

**Try it:** `npm install && npm run build && npm test`, then `npm run start:api` in one terminal and `npm run start:cli -- list` in a second terminal. Node 20+.

## How Kiro was used

Skeleton Core was built spec-first in Kiro, and the artefacts are in the repo under `/.kiro`:

- **Steering** — product steering fixed the rules before any code: lean enough to read in one sitting, one job per module, Node standard library first, dependencies only when they remove real complexity. Tech steering set strict TypeScript, Node's built-in test runner, and fail-fast validated config. Structure steering fixed the layout and the rule that apps import the core only through its public index.
- **Specs** — the `skeleton-core` spec was written as requirements → design → tasks before the apps existed. The core was implemented and unit-tested against that spec first; both proof apps were then built against the finished core, which is why each app is only wiring.
- **Hooks** — three agent hooks ran during the build: a spec-check hook that flags drift between the spec and core code on save; a hook that re-runs the full typecheck + test suite whenever a core file changes (the core is shared, so a core change is not done until both apps pass); and a hook that, when the spec's task list is edited, has an agent run the full test suite and report the counts.
- The workflow caught a real bug: the first joint live run showed the store's cache hiding the other app's writes. The fix (mtime-keyed cache) was written into the spec's design and the store module with a regression test — the spec stayed the source of truth instead of the fix becoming an app-level workaround.

## Built with
TypeScript, Node.js (standard library only at runtime), Kiro (steering, specs, hooks)

## Links to provide on the form
- GitHub repo: *(public repo URL — added at push step)*
- Demo video (YouTube, < 3 min): *(added at upload step)*
- Working app: the GitHub repo — the quickstart in the README runs both apps in under a minute; there is no hosted server to keep up, the template *is* the product.
