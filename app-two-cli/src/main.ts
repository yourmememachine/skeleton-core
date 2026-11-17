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
  type Task,
} from "../../skeleton-core/src/index.js";

const config = loadConfig();
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

function needArg(ctx: { args: string[] }, index: number, what: string): string {
  const value = ctx.args[index];
  if (value === undefined) throw new ValidationError(`missing ${what} — see "help"`);
  return value;
}

/** Accept full ids or the 8-char prefixes the CLI prints. */
async function resolveId(prefix: string): Promise<string> {
  const all = await tasks.list();
  const matches = all.filter((t) => t.id.startsWith(prefix));
  if (matches.length === 1) return (matches[0] as Task).id;
  if (matches.length > 1) throw new ValidationError(`id prefix "${prefix}" is ambiguous`);
  return prefix; // let the service raise its own NotFoundError
}

const cli = new Cli("tasks")
  .command("add", "add <title> [--status todo|doing|done]", async (ctx) => {
    const title = needArg(ctx, 0, "title");
    const status = typeof ctx.flags.status === "string" ? ctx.flags.status : undefined;
    const task = await tasks.create({ title, status });
    print(task, ctx.flags.json === true);
    log.debug("task created", { id: task.id });
  })
  .command("list", "list [--status todo|doing|done] [--json]", async (ctx) => {
    const status = typeof ctx.flags.status === "string" ? ctx.flags.status : undefined;
    const all = await tasks.list(status);
    if (ctx.flags.json === true) {
      console.log(JSON.stringify(all, null, 2));
    } else if (all.length === 0) {
      console.log("No tasks.");
    } else {
      for (const task of all) print(task, false);
    }
  })
  .command("get", "get <id>", async (ctx) => {
    print(await tasks.get(await resolveId(needArg(ctx, 0, "id"))), ctx.flags.json === true);
  })
  .command("done", "done <id> — mark a task done", async (ctx) => {
    const task = await tasks.update(await resolveId(needArg(ctx, 0, "id")), { status: "done" });
    print(task, ctx.flags.json === true);
  })
  .command("remove", "remove <id>", async (ctx) => {
    const task = await tasks.remove(await resolveId(needArg(ctx, 0, "id")));
    console.log(`Removed: ${task.title}`);
  });

process.exitCode = await cli.run(process.argv.slice(2));
