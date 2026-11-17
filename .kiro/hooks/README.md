# Hooks used in this build

Kiro agent hooks — each is a JSON definition in this folder, active when
the project is open in Kiro.

- **`spec-check-on-save.json`** — when a file under `skeleton-core/src`
  changes, an agent pass compares it against
  `.kiro/specs/skeleton-core/requirements.md` + `design.md` and flags
  drift between spec and code.
- **`typecheck-and-test-on-core-change.json`** — when a core source file
  changes, runs `npm test` (full typecheck + suite). The core is shared
  by both apps, so a core change is not "done" until both apps still
  pass against it.
- **`test-on-task-complete.json`** — when a task in
  `.kiro/specs/skeleton-core/tasks.md` is checked off, runs the affected
  module's tests and reports the result before the next task starts.
