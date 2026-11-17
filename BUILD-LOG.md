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
