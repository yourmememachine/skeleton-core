# app-one-api — REST API proof app

A small task API built on `skeleton-core`. All logic (validation,
storage, error mapping) lives in the core; this app only maps routes to
the shared `TaskService`.

## Run

From the repo root:

```bash
npm install && npm run build
PORT=3000 STORE_FILE=data/tasks.json npm run start:api
```

## Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/health` | `{ status: "ok", service }` |
| GET | `/tasks?status=todo\|doing\|done` | List tasks, optional status filter |
| POST | `/tasks` | Create — body `{ "title": "...", "status": "todo" }` → 201 |
| GET | `/tasks/:id` | One task |
| PATCH | `/tasks/:id` | Update `title` and/or `status` |
| DELETE | `/tasks/:id` | Delete → 204 |

Errors are JSON `{ error, message }` with the matching HTTP status
(400 validation, 404 not found). Point `STORE_FILE` at the same file the
CLI uses and both apps share data live.
