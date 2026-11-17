// Integration test: the REAL app-one router, served over real HTTP,
// against a throwaway store file. Exercises transport + service + store
// exactly as production runs them.

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createLogger, serve, type Task } from "../../skeleton-core/src/index.js";
import { createTaskRouter } from "../src/app.js";

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
