// Integration test: app-two-cli as a REAL subprocess, then the cross-app
// proof — app-one's API reads back, over HTTP, the task the CLI created
// in the same store file. Two transports, one core, zero integration code.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
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

async function cli(args: string[], expectFail = false): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cliPath, ...args], {
      env: { ...process.env, STORE_FILE: storeFile, LOG_LEVEL: "error" },
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
