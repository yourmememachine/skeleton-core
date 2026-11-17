import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
