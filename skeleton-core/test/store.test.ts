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

test("release never removes a lock another owner has taken over", async () => {
  const { store, file } = await tempStore();
  const lock = `${file}.lock`;
  const foreign = "424242:0:foreign-owner-token";
  await store.mutate(async (all) => {
    // Mid-hold, a peer judges our lock stale, breaks it, and takes a
    // lock of its own — same path, different ownership token.
    await writeFile(lock, `${foreign}\n`, "utf8");
    return all;
  });
  // Our release must have left the peer's live lock untouched.
  assert.equal((await readFile(lock, "utf8")).trim(), foreign);
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

test("returned arrays are snapshots — mutating them cannot corrupt the store", async () => {
  const { store, file } = await tempStore();
  await store.save([{ id: 1 }]);
  // Mutating what all() returned (array AND element) changes nothing.
  const read = await store.all();
  read.push({ id: 99 });
  (read[0] as { id: number }).id = 42;
  assert.deepEqual(await store.all(), [{ id: 1 }]);
  // Mutating an array after handing it to save() changes nothing.
  const ext = [{ id: 5 }];
  await store.save(ext);
  ext.push({ id: 6 });
  (ext[0] as { id: number }).id = 55;
  assert.deepEqual(await store.all(), [{ id: 5 }]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")) as unknown, [{ id: 5 }]);
});

test("a mutate callback that mutates its input then throws poisons nothing", async () => {
  const { store, file } = await tempStore();
  await store.save([{ id: 1 }]);
  await assert.rejects(
    () =>
      store.mutate((current) => {
        current.push({ id: 777 });
        throw new Error("callback failed");
      }),
    /callback failed/,
  );
  assert.deepEqual(await store.all(), [{ id: 1 }]);
  // And the next successful write does not persist the phantom record.
  await store.mutate((all) => [...all, { id: 2 }]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")) as unknown, [{ id: 1 }, { id: 2 }]);
});

test("a corrupt or empty store file is a clear error naming the file", async () => {
  const { mkdir } = await import("node:fs/promises");
  const bad = await tempStore();
  await mkdir(dirname(bad.file), { recursive: true });
  await writeFile(bad.file, "{not json", "utf8");
  await assert.rejects(() => bad.store.all(), /does not contain valid JSON/);
  const empty = await tempStore();
  await mkdir(dirname(empty.file), { recursive: true });
  await writeFile(empty.file, "", "utf8");
  await assert.rejects(() => empty.store.all(), /does not contain valid JSON/);
});

test("a nested write inside a mutate callback is rejected at once", async () => {
  const { store } = await tempStore();
  await store.save([{ id: 1 }]);
  await assert.rejects(
    () =>
      store.mutate(async (all) => {
        await store.save([{ id: 2 }]);
        return all;
      }),
    /nested write/,
  );
  assert.deepEqual(await store.all(), [{ id: 1 }]);
});

test("a fresh foreign lock is waited out, then given up on — not broken", async () => {
  const { store, file } = await tempStore();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  await writeFile(lock, "123456:0:live-owner\n", "utf8"); // fresh mtime: a live holder
  await assert.rejects(() => store.save([{ id: 1 }]), /Could not acquire store lock/);
  // The live lock must still be there — only stale locks are broken.
  assert.equal((await readFile(lock, "utf8")).trim(), "123456:0:live-owner");
});
