# Demo video script — under 3 minutes, silent screen capture + captions

Record the terminal at a readable font size. Two terminal windows side
by side (left: CLI, right: API/curl), or one window switching — side by
side sells the shared-core point. Captions carry the story; no voiceover
needed. Target length ~2:30.

| Time | Screen | Caption |
|---|---|---|
| 0:00–0:15 | Repo tree; open `.kiro/steering/product.md`, then `.kiro/specs/skeleton-core/` | "Skeleton Core — built spec-first in Kiro: steering, specs, hooks in /.kiro" |
| 0:15–0:35 | `npm install && npm run build && npm test` — show 63/63 pass | "One lean TypeScript core. 63 tests green." |
| 0:35–0:50 | Right window: `PORT=3000 npm run start:api`; `curl localhost:3000/health` | "App one: a REST API on the skeleton" |
| 0:50–1:15 | Left window: `npm run start:cli -- add "Raise the skeleton"`, `add "Wire the second app"`, `list` | "App two: a CLI on the SAME core — same data file" |
| 1:15–1:40 | Right window: `curl localhost:3000/tasks` — the CLI's tasks appear | "No integration code. The API sees the CLI's tasks live." |
| 1:40–2:00 | Left: `done <prefix>` → Right: `curl "localhost:3000/tasks?status=done"` | "Mark it done in the terminal — the API agrees." |
| 2:00–2:15 | Right: `curl -X POST .../tasks -d '{"title":"Added through the API"}'` → Left: `list` shows it | "And back the other way." |
| 2:15–2:30 | Quick scroll of `skeleton-core/src/` file list; end on README | "Config, logging, errors, store, transports — written once. Skeleton Core." |

Notes:
- Use a fresh `STORE_FILE` (e.g. `data/demo.json`) so the recording starts empty.
- Keep each command's output on screen ~2 seconds before moving on.
- Export at 1080p; YouTube upload must be **public** and **under 3:00**.
