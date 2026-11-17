// Store: a tiny JSON-file store. One file, one array of records.
// Writes are atomic (write to a temp file, then rename) so a crash
// mid-write can never corrupt the data file, and every write runs
// under an exclusive lockfile so two processes sharing the file (the
// API and the CLI) serialise instead of losing each other's updates.
// Read-modify-write goes through mutate(): inside the lock the file's
// mtime is re-checked and the contents reloaded if another process
// rewrote them, so a change computed from stale in-memory records can
// never clobber the other writer's newer ones. Reads are cached, keyed
// on the file's mtime, for the same reason. That is what lets two
// skeleton apps share one data file with no integration code.
// Deliberately boring beyond that: swap this one module when a real
// database shows up.

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** A lock older than this is treated as abandoned (its holder crashed). */
const LOCK_STALE_MS = 10_000;
/** How many times a writer retries the lock before giving up. */
const LOCK_ATTEMPTS = 25;
/** Backoff between lock attempts: 20–50 ms, jittered. */
const LOCK_RETRY_MIN_MS = 20;
const LOCK_RETRY_SPREAD_MS = 30;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class JsonStore<T> {
  private records: T[] | null = null;
  private loadedMtimeMs: number | null = null;

  constructor(private readonly filePath: string) {}

  /** Load from disk; reloads if the file changed since the last load. */
  async all(): Promise<T[]> {
    const mtimeMs = await this.mtime();
    if (this.records !== null && mtimeMs === this.loadedMtimeMs) return this.records;
    let loaded: T[];
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error(`Store file ${this.filePath} does not contain a JSON array`);
      }
      loaded = parsed as T[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        loaded = [];
      } else {
        throw err;
      }
    }
    this.records = loaded;
    this.loadedMtimeMs = mtimeMs;
    return loaded;
  }

  /** Replace the whole contents and persist atomically, under the lock. */
  async save(records: T[]): Promise<void> {
    await this.withLock(() => this.writeAll(records));
  }

  /** Empty the store and persist the empty array, under the lock. */
  async clear(): Promise<void> {
    await this.withLock(() => this.writeAll([]));
  }

  /**
   * Read-modify-write as one locked step. The current contents come
   * from all() *inside* the lock, whose mtime check reloads the file
   * if it changed since this instance last loaded it — so `update`
   * merges onto the freshest data instead of overwriting a concurrent
   * writer's records. Returns the persisted contents.
   */
  async mutate(update: (current: T[]) => T[] | Promise<T[]>): Promise<T[]> {
    return this.withLock(async () => {
      const next = await update(await this.all());
      await this.writeAll(next);
      return next;
    });
  }

  /** The atomic write itself: temp file, then rename over the target. */
  private async writeAll(records: T[]): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(records, null, 2) + "\n", "utf8");
    await rename(tmp, this.filePath);
    this.records = records;
    this.loadedMtimeMs = await this.mtime();
  }

  private async withLock<R>(fn: () => Promise<R>): Promise<R> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await this.acquireLock();
    try {
      return await fn();
    } finally {
      await rm(`${this.filePath}.lock`, { force: true });
    }
  }

  /**
   * Take the lockfile by creating it exclusively ("wx" fails if it
   * already exists). Retries with a small jittered backoff; a lock
   * older than LOCK_STALE_MS is treated as abandoned and broken.
   */
  private async acquireLock(): Promise<void> {
    const lockPath = `${this.filePath}.lock`;
    for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt++) {
      try {
        await writeFile(lockPath, `${process.pid}\n`, { flag: "wx" });
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      // Someone holds the lock. Break it if it looks abandoned — the
      // holder may have crashed between acquiring and releasing.
      try {
        const held = await stat(lockPath);
        if (Date.now() - held.mtimeMs > LOCK_STALE_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        continue; // the holder released it mid-check — retry at once
      }
      if (attempt === LOCK_ATTEMPTS) break;
      await delay(LOCK_RETRY_MIN_MS + Math.random() * LOCK_RETRY_SPREAD_MS);
    }
    throw new Error(`Could not acquire store lock ${lockPath} after ${LOCK_ATTEMPTS} attempts`);
  }

  private async mtime(): Promise<number | null> {
    try {
      return (await stat(this.filePath)).mtimeMs;
    } catch {
      return null;
    }
  }
}
