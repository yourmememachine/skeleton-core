# Build log — Kiroween 2026 / Skeleton Crew

Build completed 2026-11-17 (Vancouver). Environment: Node v24.22.1,
npm 10.9.4, TypeScript 5.x (dev-only dependency; runtime is pure Node
standard library).

## Rules check (Devpost, kiroween.devpost.com — read 2026-11-17)

- Skeleton Crew = lean skeleton template + **two distinct applications
  in two separate repo folders** → `app-one-api/`, `app-two-cli/` ✓
- Public GitHub repo, open-source licence file → MIT `LICENSE` ✓ (push itself is Dilip's step)
- `/.kiro` at repo root with specs/hooks/steering, **not gitignored** →
  present; `.gitignore` explicitly documents leaving it in ✓
- New project built inside Oct 30 – Dec 4, 2026 window ✓ (started Nov 17)
- Text description + write-up on Kiro usage → `SUBMISSION.md` + README ✓
- Demo video < 3 min, public YouTube → script ready (`DEMO-SCRIPT.md`); recording/upload is Dilip's step
- Working app → both apps run from the repo quickstart in < 1 minute; no hosted URL (nothing to host — the template is the product; the repo URL goes in that form field, noted in ENTRY-CHECKLIST.md)
- Eligibility: Canada is eligible (only Quebec is excluded among Canadian regions) ✓
- Deadline: **Dec 4, 2026, 2:00 PM PT**, no extensions.

## What was built

Starting point was a partial scaffold (config/logger/errors + TODO app
stubs, no package.json/tsconfig/tests). Finished in this run:

- **Core completed**: `store.ts` (atomic JSON store), `tasks.ts` (domain
  service + all validation), `http.ts` (router on node:http, `Reply`,
  error→status mapping, `/health`), `cli.ts` (argv parsing, dispatch,
  error→exit-code mapping), `shutdown.ts` (graceful SIGINT/SIGTERM).
  `config.ts` gained `storePath` (env `STORE_FILE`).
- **app-one-api**: full task CRUD over HTTP (201/204/400/404 verified),
  router split into `src/app.ts` (testable factory) + `src/main.ts`.
- **app-two-cli**: `add/list/get/done/remove/help`, `--json`, 8-char id
  prefixes, exit codes 0/2/3 verified.
- **.kiro completed**: added `specs/skeleton-core/design.md`,
  `steering/structure.md`, and three real hook definitions
  (`spec-check-on-save.json`, `typecheck-and-test-on-core-change.json`,
  `test-on-task-complete.json`); `tasks.md` checked off against reality.
- **Docs**: README rewritten (quickstart + Kiro write-up), per-app
  READMEs, `SUBMISSION.md` (paste-ready Devpost text), `DEMO-SCRIPT.md`
  (~2:20 captioned capture), `ENTRY-CHECKLIST.md` (Dilip's steps only).

## Bug found by live verification (and fixed)

First joint live run: the CLI marked a task done while the API was
running, and the API's filtered view did not change — the store's
in-memory cache never re-read the file. Fixed in the core (not in an
app): the cache is now keyed on the file's mtime, so an external rewrite
is picked up on the next read. Regression test added
(`store.test.ts`: "an external rewrite is picked up on the next read").
Re-verified live afterwards: CLI writes appear in the API and API writes
appear in the CLI, both directions, processes running simultaneously.

## Verification runs (actual output)

1. `npm test` (build + node --test) — **24 tests, 24 pass, 0 fail**:
   - core units: config (4), errors (3), logger (2), store (4), tasks (4), cli parse/exit codes (3)
   - app-one-api integration (3): health, full CRUD + error mapping over real HTTP, malformed JSON → 400
   - app-two-cli integration (1): subprocess lifecycle, exit codes 2/3, and the cross-app proof — CLI-created data read back through the API over HTTP from the same store file
2. Manual smoke (live processes, one shared `STORE_FILE`):
   - `GET /health` → `{"status":"ok","service":"skeleton-app"}`
   - CLI `add` ×2 → API `GET /tasks` lists both; API `POST` → CLI `list` shows it
   - `POST {"title":""}` → `400 {"error":"VALIDATION",...}`
   - CLI `done <prefix>` → API `GET /tasks?status=done` returns it
3. Clean-tree check: `rm -rf node_modules dist data && npm install && npm test`
   → 3 packages installed, **24/24 pass** — the exact flow a judge runs.

## Not done (by design — Dilip-personal, see ENTRY-CHECKLIST.md)

Devpost registration, Kiro/AWS Builder ID sign-in, GitHub repo creation
+ push, YouTube demo upload. No spending anywhere in this build.

---

## Review fixes — 2026-11-17 (Dilip's code review)

Dilip reviewed the raw source and his fixes were applied the same day,
in his priority order. No new dependencies; runtime is still pure Node
standard library; the layout and the "no framework, no magic" stance
are unchanged.

- **Store file lock** (`store.ts`): every write now runs under an
  exclusive `<store>.lock` (`wx` create, 25 attempts, 20–50 ms jittered
  backoff, locks older than ~10 s treated as stale and broken, released
  in a `finally`). The atomic temp-file-then-rename write and the
  mtime-keyed cache are unchanged. On top of the lock, the store gained
  `mutate()`: a read-modify-write that re-checks the mtime *inside* the
  lock and reloads before merging, so a change computed from stale
  in-memory records cannot clobber the other process's newer writes.
  `TaskService.create/update/remove` now go through `mutate()`.
- **Tighter types**: `TaskService.update` takes a typed `TaskPatch`
  (`title?: string; status?: TaskStatus`) instead of
  `Record<string, unknown>`; the app layer shapes wire bodies into a
  `TaskPatch` via a local `asTaskPatch()` adapter (the only casts left,
  at the transport boundary) and routes use `params.id!` instead of
  `as string`. Validation still lives in the service.
- **Store `clear()`**: empties the records and persists the empty
  array under the same lock — for tests.
- **Shutdown robustness**: `onShutdown` accepts an opt-in
  `{ catchErrors: true }` to also run cleanups (and exit 1) on
  `uncaughtException` / `unhandledRejection`. Default behaviour is
  unchanged.
- **CLI `--json` consistency**: `remove` now prints the removed task
  as JSON under `--json`, and every task-printing command's usage line
  advertises `[--json]`.
- **Docs**: README gained a "Concurrency" section (lock behaviour, and
  full-UUID-in-the-API vs 8-char-prefix-in-the-CLI by design).

Verification: clean-tree run (`rm -rf node_modules dist` →
`npm install` → `npm test`) — **31 tests, 31 pass, 0 fail** (was 24;
+4 store: lock serialisation, stale-lock break, `clear()`, concurrent
two-instance appends lose no records; +1 tasks: two services sharing
one file lose no creates under concurrency; +2 shutdown: opt-in
verified on and off). The API integration test also gained a
bogus-status PATCH → 400 case, and the CLI integration test now covers
`get --json` and `remove --json`.
