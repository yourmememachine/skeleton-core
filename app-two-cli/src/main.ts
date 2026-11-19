// app-two-cli — proof application 2: a terminal task manager built on
// the SAME skeleton-core as app-one-api. Same TaskService, same store
// file format, same validation — only the transport differs. Point both
// apps at one STORE_FILE and they share data with no integration code.

import {
  Cli,
  JsonStore,
  TaskService,
  ValidationError,
  createLogger,
  loadConfig,
  type AppConfig,
  type CliContext,
  type Task,
  type TaskPatch,
  type TaskStatus,
} from "../../skeleton-core/src/index.js";

// The CLI binds no port, so PORT is not validated (requirePort: false)
// — a stray PORT in the environment must not block a terminal tool.
// Config errors are startup errors: one line, exit 2, no stack dump.
let config: AppConfig;
try {
  config = loadConfig(process.env, { requirePort: false });
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
const log = createLogger(config.logLevel);
const tasks = new TaskService(new JsonStore<Task>(config.storePath));

function print(task: Task, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(task, null, 2));
  } else {
    const box = task.status === "done" ? "[x]" : task.status === "doing" ? "[~]" : "[ ]";
    console.log(`${box} ${task.id.slice(0, 8)}  ${task.title}  (${task.status})`);
  }
}

function needArg(ctx: CliContext, index: number, what: string): string {
  const value = ctx.args[index];
  if (value === undefined) throw new ValidationError(`missing ${what} — see "help"`);
  return value;
}

/** Commands that act on one task take exactly one positional argument. */
function onlyArg(ctx: CliContext, what: string): string {
  const value = needArg(ctx, 0, what);
  if (ctx.args.length > 1) {
    throw new ValidationError(`unexpected extra arguments: ${ctx.args.slice(1).join(" ")}`);
  }
  return value;
}

/**
 * The --status flag: absent means "no opinion" (undefined), but a
 * flag that is PRESENT without a value is a usage error — silently
 * treating it as absent would create or list with the wrong status.
 */
function statusFlag(ctx: CliContext): string | undefined {
  if (!("status" in ctx.flags)) return undefined;
  const value = ctx.flags.status;
  if (typeof value !== "string") {
    throw new ValidationError("--status requires a value (todo, doing or done)");
  }
  return value;
}

/**
 * Accept full ids or the 8-char prefixes the CLI prints — nothing
 * shorter. A 1-character "prefix" matching the only task in the store
 * would let `done 8` or `remove ""` act on a task the user never
 * actually named.
 */
async function resolveId(prefix: string): Promise<string> {
  if (prefix.length !== 8 && prefix.length !== 36) {
    throw new ValidationError(
      `id must be a full UUID or the 8-character prefix shown by "list", got "${prefix}"`,
    );
  }
  const all = await tasks.list();
  const matches = all.filter((t) => t.id.startsWith(prefix));
  if (matches.length === 1) return (matches[0] as Task).id;
  if (matches.length > 1) {
    throw new ValidationError(
      `id prefix "${prefix}" is ambiguous — it matches ${matches.map((t) => t.id).join(", ")}; use a full id`,
    );
  }
  return prefix; // let the service raise its own NotFoundError
}

const cli = new Cli("tasks")
  .command("add", "add <title> [--status todo|doing|done] [--json] — words join, quoting optional", async (ctx) => {
    if (ctx.args.length === 0) throw new ValidationError(`missing title — see "help"`);
    const task = await tasks.create({ title: ctx.args.join(" "), status: statusFlag(ctx) });
    print(task, ctx.flags.json === true);
    log.debug("task created", { id: task.id });
  })
  .command("list", "list [--status todo|doing|done] [--json]", async (ctx) => {
    const all = await tasks.list(statusFlag(ctx));
    if (ctx.flags.json === true) {
      console.log(JSON.stringify(all, null, 2));
    } else if (all.length === 0) {
      console.log("No tasks.");
    } else {
      for (const task of all) print(task, false);
    }
  })
  .command("get", "get <id> [--json]", async (ctx) => {
    print(await tasks.get(await resolveId(onlyArg(ctx, "id"))), ctx.flags.json === true);
  })
  .command("done", "done <id> [--json] — mark a task done", async (ctx) => {
    const task = await tasks.update(await resolveId(onlyArg(ctx, "id")), { status: "done" });
    print(task, ctx.flags.json === true);
  })
  .command("edit", "edit <id> [--title <title>] [--status todo|doing|done] [--json] — rename or re-status", async (ctx) => {
    const patch: TaskPatch = {};
    if ("title" in ctx.flags) {
      if (typeof ctx.flags.title !== "string") throw new ValidationError("--title requires a value");
      patch.title = ctx.flags.title;
    }
    const status = statusFlag(ctx);
    if (status !== undefined) patch.status = status as TaskStatus;
    // An edit with neither flag reaches the service as an empty patch,
    // which it rejects — the same contract as the API's PATCH.
    const task = await tasks.update(await resolveId(onlyArg(ctx, "id")), patch);
    print(task, ctx.flags.json === true);
  })
  .command("remove", "remove <id> [--json]", async (ctx) => {
    const task = await tasks.remove(await resolveId(onlyArg(ctx, "id")));
    if (ctx.flags.json === true) print(task, true);
    else console.log(`Removed: ${task.id.slice(0, 8)}  ${task.title}`);
  });

process.exitCode = await cli.run(process.argv.slice(2));
