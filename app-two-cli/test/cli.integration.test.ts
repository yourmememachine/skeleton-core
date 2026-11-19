// Integration test: app-two-cli as a REAL subprocess, then the cross-app
// proof — app-one's API reads back, over HTTP, the task the CLI created
// in the same store file. Two transports, one core, zero integration code.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLogger, serve, type Task } from "../../skeleton-core/src/index.js";
import { createTaskRouter } from "../../app-one-api/src/app.js";

const run = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/main.js", import.meta.url));

let storeFile: string;
let server: Server | undefined;

after(() => {
  if (server) return new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function cli(
  args: string[],
  expectFail = false,
  extraEnv: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cliPath, ...args], {
      env: { ...process.env, STORE_FILE: storeFile, LOG_LEVEL: "error", ...extraEnv },
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    if (!expectFail) throw err;
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code ?? -1 };
  }
}

test("CLI lifecycle, exit codes, and the cross-app shared store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-cli-"));
  storeFile = join(dir, "tasks.json");

  // help works and costs nothing
  const help = await cli(["help"]);
  assert.match(help.stdout, /Usage: tasks/);

  // add two tasks (one via --json so we can capture its full id)
  const added = await cli(["add", "CLI task one", "--json"]);
  const task = JSON.parse(added.stdout) as Task;
  assert.equal(task.title, "CLI task one");
  assert.equal(task.status, "todo");
  await cli(["add", "CLI task two"]);

  // list shows both, using the printed 8-char prefix is enough to act
  const list = await cli(["list"]);
  assert.match(list.stdout, /CLI task one/);
  assert.match(list.stdout, /CLI task two/);

  // done by prefix
  const done = await cli(["done", task.id.slice(0, 8)]);
  assert.match(done.stdout, /\(done\)/);

  // get --json prints the full task, like every task-printing command
  const got = await cli(["get", task.id.slice(0, 8), "--json"]);
  assert.equal((JSON.parse(got.stdout) as Task).id, task.id);

  // validation failure exits 2; unknown id exits 3
  assert.equal((await cli(["add", ""], true)).code, 2);
  assert.equal((await cli(["get", "zzzzzzzz"], true)).code, 3);

  // CROSS-APP PROOF: serve app-one's API on the same store file and
  // read the CLI's data back over HTTP.
  const router = createTaskRouter(storeFile, "app-one-api-test");
  server = serve(router, 0, createLogger("error", () => {}));
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const res = await fetch(`http://127.0.0.1:${address.port}/tasks?status=done`);
  assert.equal(res.status, 200);
  const doneTasks = (await res.json()) as Task[];
  assert.equal(doneTasks.length, 1);
  assert.equal(doneTasks[0]?.id, task.id);
  assert.equal(doneTasks[0]?.title, "CLI task one");

  // remove via CLI with --json (prints the removed task), list is down to one
  const removedOut = await cli(["remove", task.id.slice(0, 8), "--json"]);
  assert.equal((JSON.parse(removedOut.stdout) as Task).id, task.id);
  const after = await cli(["list", "--json"]);
  const remaining = JSON.parse(after.stdout) as Task[];
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.title, "CLI task two");
});

test("CLI contract details: ids, titles, flags, exit codes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-cli-contract-"));
  storeFile = join(dir, "tasks.json");

  // An unquoted multi-word title is joined, never truncated.
  const added = await cli(["add", "Buy", "milk", "today", "--json"]);
  const task = JSON.parse(added.stdout) as Task;
  assert.equal(task.title, "Buy milk today");

  // The --flag=value spelling works like the spaced form.
  const doing = await cli(["add", "Equals form", "--status=doing", "--json"]);
  assert.equal((JSON.parse(doing.stdout) as Task).status, "doing");

  // A valueless --status is a usage error (exit 2), not a silent default.
  assert.equal((await cli(["add", "Nope", "--status"], true)).code, 2);
  assert.equal((await cli(["list", "--status"], true)).code, 2);
  assert.equal((await cli(["add", "Nope", "--status", "bogus"], true)).code, 2);

  // Only full UUIDs and the printed 8-char prefixes address a task:
  // empty and short strings are usage errors, even with one task stored.
  assert.equal((await cli(["get", ""], true)).code, 2);
  assert.equal((await cli(["get", task.id.slice(0, 1)], true)).code, 2);
  assert.equal((await cli(["get", task.id.slice(0, 8), "extra"], true)).code, 2);

  // Full-UUID addressing works for get / done / remove.
  assert.equal((JSON.parse((await cli(["get", task.id, "--json"])).stdout) as Task).id, task.id);
  assert.match((await cli(["done", task.id])).stdout, /\(done\)/);

  // Unknown commands and missing arguments are usage errors (exit 2).
  assert.equal((await cli(["frobnicate"], true)).code, 2);
  assert.equal((await cli(["get"], true)).code, 2);

  // list --status actually filters.
  const doneOnly = JSON.parse((await cli(["list", "--status", "done", "--json"])).stdout) as Task[];
  assert.deepEqual(doneOnly.map((t) => t.title), ["Buy milk today"]);

  // edit renames and re-statuses (the API's PATCH surface, in the CLI);
  // an edit with nothing to change is the same 400-class error as PATCH {}.
  const edited = await cli(["edit", task.id.slice(0, 8), "--title", "Buy oat milk", "--status", "todo", "--json"]);
  const editedTask = JSON.parse(edited.stdout) as Task;
  assert.equal(editedTask.title, "Buy oat milk");
  assert.equal(editedTask.status, "todo");
  assert.equal((await cli(["edit", task.id.slice(0, 8)], true)).code, 2);

  // remove's plain output names the task by the same 8-char prefix.
  const removed = await cli(["remove", task.id]);
  assert.match(removed.stdout, new RegExp(`Removed: ${task.id.slice(0, 8)}`));

  // A stray invalid PORT in the environment cannot block the CLI —
  // it binds no port, so it never validates one.
  const immune = await cli(["list"], false, { PORT: "abc" });
  assert.match(immune.stdout, /Equals form/);
});

test("an ambiguous prefix is a usage error that names the matches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-cli-ambiguous-"));
  storeFile = join(dir, "tasks.json");
  const stamp = "2026-01-01T00:00:00.000Z";
  const crafted: Task[] = [
    { id: "aaaaaaaa-1111-4111-8111-111111111111", title: "First", status: "todo", createdAt: stamp, updatedAt: stamp },
    { id: "aaaaaaaa-2222-4222-8222-222222222222", title: "Second", status: "todo", createdAt: stamp, updatedAt: stamp },
  ];
  await writeFile(storeFile, JSON.stringify(crafted, null, 2) + "\n", "utf8");
  const res = await cli(["get", "aaaaaaaa"], true);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /ambiguous/);
  assert.match(res.stderr, /aaaaaaaa-1111-4111-8111-111111111111/);
  assert.match(res.stderr, /aaaaaaaa-2222-4222-8222-222222222222/);
});

test("cross-app sharing runs in both directions against a live API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-cli-bothways-"));
  storeFile = join(dir, "tasks.json");

  // The API starts FIRST and stays running for the whole test — every
  // CLI write below must be picked up by this already-running server.
  const router = createTaskRouter(storeFile, "app-one-api-test");
  const live = serve(router, 0, createLogger("error", () => {}));
  try {
    await new Promise<void>((resolve) => live.once("listening", resolve));
    const address = live.address();
    assert.ok(address !== null && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    // API → CLI: create over HTTP, see it in the terminal.
    const post = await fetch(`${base}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Born in the API" }),
    });
    assert.equal(post.status, 201);
    const apiTask = (await post.json()) as Task;
    const cliList = JSON.parse((await cli(["list", "--json"])).stdout) as Task[];
    assert.ok(cliList.some((t) => t.id === apiTask.id));

    // CLI → API, live: add in the terminal, read it back over HTTP
    // from the server that was already running.
    await cli(["add", "Born in the CLI"]);
    const getAll = await fetch(`${base}/tasks`);
    const all = (await getAll.json()) as Task[];
    assert.ok(all.some((t) => t.title === "Born in the CLI"));

    // And a CLI remove is picked up live too.
    await cli(["remove", apiTask.id.slice(0, 8)]);
    const afterRemove = (await (await fetch(`${base}/tasks`)).json()) as Task[];
    assert.ok(!afterRemove.some((t) => t.id === apiTask.id));
  } finally {
    await new Promise<void>((resolve) => live.close(() => resolve()));
  }
});
