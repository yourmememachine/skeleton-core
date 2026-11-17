import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { JsonStore } from "../src/index.js";

async function tempStore(): Promise<{ store: JsonStore<{ id: number }>; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), "skeleton-store-"));
  const file = join(dir, "nested", "records.json");
  return { store: new JsonStore<{ id: number }>(file), file };
}

test("missing file reads as empty", async () => {
  const { store } = await tempStore();
  assert.deepEqual(await store.all(), []);
});

test("save persists and a fresh store reads it back", async () => {
  const { store, file } = await tempStore();
  await store.save([{ id: 1 }, { id: 2 }]);
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  assert.deepEqual(raw, [{ id: 1 }, { id: 2 }]);
  const fresh = new JsonStore<{ id: number }>(file);
  assert.deepEqual(await fresh.all(), [{ id: 1 }, { id: 2 }]);
});

test("an external rewrite is picked up on the next read (mtime reload)", async () => {
  const { store, file } = await tempStore();
  await store.save([{ id: 1 }]);
  assert.deepEqual(await store.all(), [{ id: 1 }]);
  // Simulate another process (the CLI) rewriting the shared file.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeFile(file, JSON.stringify([{ id: 1 }, { id: 2 }]), "utf8");
  assert.deepEqual(await store.all(), [{ id: 1 }, { id: 2 }]);
});

test("a non-array store file is a hard error, not silent data loss", async () => {
  const { store, file } = await tempStore();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify({ nope: true }), "utf8");
  await assert.rejects(() => store.all(), /does not contain a JSON array/);
});

test("the lock serialises two instances writing one file", async () => {
  const { store: a, file } = await tempStore();
  const b = new JsonStore<{ id: number }>(file);
  const order: string[] = [];
  const slow = a.mutate(async (all) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    order.push("a");
    return [...all, { id: 1 }];
  });
  // Give A a head start so it is holding the lock when B asks for it.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const fast = b.save([{ id: 2 }]).then(() => {
    order.push("b");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["a", "b"]);
});

test("a stale lock file is broken, not waited on", async () => {
  const { store, file } = await tempStore();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  await writeFile(lock, "999999\n", "utf8");
  const longAgo = new Date(Date.now() - 60_000); // older than the 10s stale limit
  await utimes(lock, longAgo, longAgo);
  await store.save([{ id: 7 }]); // would throw after 25 attempts if the stale lock were honoured
  assert.deepEqual(await store.all(), [{ id: 7 }]);
  await assert.rejects(() => stat(lock), /ENOENT/); // lock released afterwards
});

test("clear empties the store and persists the empty array", async () => {
  const { store, file } = await tempStore();
  await store.save([{ id: 1 }, { id: 2 }]);
  await store.clear();
  assert.deepEqual(await store.all(), []);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")) as unknown, []);
  assert.deepEqual(await new JsonStore<{ id: number }>(file).all(), []);
});

test("concurrent appends from two instances lose no records", async () => {
  const { file } = await tempStore();
  const a = new JsonStore<{ id: number }>(file);
  const b = new JsonStore<{ id: number }>(file);
  const appends: Array<Promise<unknown>> = [];
  for (let i = 0; i < 10; i++) {
    appends.push(a.mutate((all) => [...all, { id: i }]));
    appends.push(b.mutate((all) => [...all, { id: 100 + i }]));
  }
  await Promise.all(appends);
  const final = await new JsonStore<{ id: number }>(file).all();
  assert.equal(final.length, 20);
  assert.equal(new Set(final.map((r) => r.id)).size, 20);
});
