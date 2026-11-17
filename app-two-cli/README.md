# app-two-cli — CLI proof app

A terminal task manager built on the same `skeleton-core` as
`app-one-api` — same `TaskService`, same store file, same validation.
Only the transport differs.

## Run

From the repo root:

```bash
npm install && npm run build
STORE_FILE=data/tasks.json npm run start:cli -- list
```

## Commands

| Command | What |
|---|---|
| `add <title> [--status todo\|doing\|done] [--json]` | Create a task |
| `list [--status ...] [--json]` | List tasks |
| `get <id>` | Show one task (id or its 8-char prefix) |
| `done <id>` | Mark a task done |
| `remove <id>` | Delete a task |
| `help` | Usage |

Exit codes mirror the core's error contract: 0 ok, 2 validation,
3 not found, 1 other errors. Point `STORE_FILE` at the same file the
API uses and both apps share data live.
