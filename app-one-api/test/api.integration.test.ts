// Integration test: the REAL app-one router, served over real HTTP,
// against a throwaway store file. Exercises transport + service + store
// exactly as production runs them.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createLogger, serve, type Task } from "../../skeleton-core/src/index.js";
import { createTaskRouter } from "../src/app.js";

const mainPath = fileURLToPath(new URL("../src/main.js", import.meta.url));

let server: Server;
let base: string;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-api-"));
  const router = createTaskRouter(join(dir, "tasks.json"), "app-one-api-test");
  const silent = createLogger("error", () => {});
  server = serve(router, 0, silent);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  return { status: res.status, json: text === "" ? null : JSON.parse(text) };
}

test("health endpoint answers", async () => {
  const { status, json } = await call("GET", "/health");
  assert.equal(status, 200);
  assert.equal(json.status, "ok");
  assert.equal(json.service, "app-one-api-test");
});

test("full CRUD cycle with core error mapping", async () => {
  // Create → 201
  const created = await call("POST", "/tasks", { title: "Integration task" });
  assert.equal(created.status, 201);
  const task = created.json as Task;
  assert.equal(task.status, "todo");

  // Validation error → 400 VALIDATION
  const bad = await call("POST", "/tasks", { title: "" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, "VALIDATION");

  // List + filter
  assert.equal((await call("GET", "/tasks")).json.length, 1);
  assert.equal((await call("GET", "/tasks?status=done")).json.length, 0);

  // Get one
  const got = await call("GET", `/tasks/${task.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.json.title, "Integration task");

  // Patch → done
  const patched = await call("PATCH", `/tasks/${task.id}`, { status: "done" });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.status, "done");

  // Patch with a bogus status → 400 VALIDATION (the app layer only
  // shapes the patch; the service still validates the values)
  const badPatch = await call("PATCH", `/tasks/${task.id}`, { status: "bogus" });
  assert.equal(badPatch.status, 400);
  assert.equal(badPatch.json.error, "VALIDATION");

  // Missing id → 404 NOT_FOUND
  const missing = await call("GET", "/tasks/does-not-exist");
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, "NOT_FOUND");

  // Unknown route → 404
  assert.equal((await call("GET", "/nope")).status, 404);

  // Delete → 204, then list is empty
  assert.equal((await call("DELETE", `/tasks/${task.id}`)).status, 204);
  assert.equal((await call("GET", "/tasks")).json.length, 0);
});

test("malformed URL encoding in the path is a 400, not a 500", async () => {
  const { status, json } = await call("GET", "/tasks/%E0%A4%A");
  assert.equal(status, 400);
  assert.equal(json.error, "VALIDATION");
});

test("malformed JSON body is a 400, not a crash", async () => {
  const res = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "VALIDATION");
});

test("the documented contract details: prefixes, filters, patch rules", async () => {
  const created = await call("POST", "/tasks", { title: "Contract task" });
  assert.equal(created.status, 201);
  const task = created.json as Task;
  const prefix = task.id.slice(0, 8);

  // The API addresses tasks by full UUID only — an 8-char prefix is a
  // CLI convenience and must 404 here on every verb.
  assert.equal((await call("GET", `/tasks/${prefix}`)).status, 404);
  assert.equal((await call("PATCH", `/tasks/${prefix}`, { status: "done" })).status, 404);
  assert.equal((await call("DELETE", `/tasks/${prefix}`)).status, 404);

  // DELETE of a missing id is the same NOT_FOUND as GET.
  const delMissing = await call("DELETE", "/tasks/does-not-exist");
  assert.equal(delMissing.status, 404);
  assert.equal(delMissing.json.error, "NOT_FOUND");

  // The status filter validates its value; create validates its input.
  assert.equal((await call("GET", "/tasks?status=bogus")).status, 400);
  assert.equal((await call("POST", "/tasks", { title: "x", status: "bogus" })).status, 400);
  assert.equal((await call("POST", "/tasks", { title: "x".repeat(201) })).status, 400);

  // An empty patch — or a non-object body — is a 400, never a silent
  // 200 that bumps updatedAt (POST of the same body already 400s).
  const emptyPatch = await call("PATCH", `/tasks/${task.id}`, {});
  assert.equal(emptyPatch.status, 400);
  assert.equal(emptyPatch.json.error, "VALIDATION");
  assert.equal((await call("PATCH", `/tasks/${task.id}`, 123)).status, 400);
  const after = await call("GET", `/tasks/${task.id}`);
  assert.equal(after.json.updatedAt, task.updatedAt);

  // Clean up after ourselves.
  assert.equal((await call("DELETE", `/tasks/${task.id}`)).status, 204);
});

test("the real main.ts boots, identifies itself, and exits 0 on SIGTERM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-api-main-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    STORE_FILE: join(dir, "tasks.json"),
    LOG_LEVEL: "error",
  };
  delete env.SERVICE_NAME; // the app must default its own name
  const child = spawn(process.execPath, [mainPath], { env });
  try {
    let health: { status?: string; service?: string } | undefined;
    for (let i = 0; i < 50 && health === undefined; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) health = (await res.json()) as { status?: string; service?: string };
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(health !== undefined, "API main.ts did not start listening");
    assert.equal(health.status, "ok");
    assert.equal(health.service, "app-one-api");
  } finally {
    child.kill("SIGTERM");
  }
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  assert.equal(code, 0); // graceful shutdown, not a crash
});
