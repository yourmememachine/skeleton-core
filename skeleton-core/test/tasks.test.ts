import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JsonStore, NotFoundError, TaskService, ValidationError, type Task } from "../src/index.js";

async function freshService(): Promise<TaskService> {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-tasks-"));
  return new TaskService(new JsonStore<Task>(join(dir, "tasks.json")));
}

test("create defaults to todo and stamps times", async () => {
  const svc = await freshService();
  const task = await svc.create({ title: "  Write the spec  " });
  assert.equal(task.title, "Write the spec"); // trimmed
  assert.equal(task.status, "todo");
  assert.ok(task.id.length > 0);
  assert.equal(task.createdAt, task.updatedAt);
});

test("create rejects bad titles and statuses", async () => {
  const svc = await freshService();
  await assert.rejects(() => svc.create({ title: "" }), ValidationError);
  await assert.rejects(() => svc.create({ title: "   " }), ValidationError);
  await assert.rejects(() => svc.create({ title: 42 }), ValidationError);
  await assert.rejects(() => svc.create({ title: "x".repeat(201) }), ValidationError);
  await assert.rejects(() => svc.create({ title: "ok", status: "blocked" }), ValidationError);
});

test("list filters by status and validates the filter", async () => {
  const svc = await freshService();
  await svc.create({ title: "a" });
  await svc.create({ title: "b", status: "done" });
  assert.equal((await svc.list()).length, 2);
  const done = await svc.list("done");
  assert.equal(done.length, 1);
  assert.equal(done[0]?.title, "b");
  await assert.rejects(() => svc.list("nope"), ValidationError);
});

test("get/update/remove round-trip, missing ids are NotFoundError", async () => {
  const svc = await freshService();
  const task = await svc.create({ title: "round trip" });
  assert.equal((await svc.get(task.id)).title, "round trip");

  const updated = await svc.update(task.id, { status: "done", title: "done trip" });
  assert.equal(updated.status, "done");
  assert.equal(updated.title, "done trip");
  assert.ok(updated.updatedAt >= task.updatedAt);

  await assert.rejects(() => svc.update(task.id, { status: "bogus" }), ValidationError);

  const removed = await svc.remove(task.id);
  assert.equal(removed.id, task.id);
  assert.equal((await svc.list()).length, 0);

  await assert.rejects(() => svc.get(task.id), NotFoundError);
  await assert.rejects(() => svc.update(task.id, {}), NotFoundError);
  await assert.rejects(() => svc.remove(task.id), NotFoundError);
});
