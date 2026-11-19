// Store: a tiny JSON-file store. One file, one array of records.
// Writes are atomic (write to a temp file, then rename) so a process
// crash mid-write can never corrupt the data file, and every write runs
// under an exclusive lockfile so two processes sharing the file (the
// API and the CLI) serialise instead of losing each other's updates.
// The lockfile carries an ownership token, and a holder only ever
// removes a lock whose token is still its own — so if a lock is ever
// broken as stale and re-acquired by another process, the first
// holder's release cannot delete the new owner's live lock.
// Read-modify-write goes through mutate(): inside the lock the file's
// stamp is re-checked and the contents reloaded if another process
// rewrote them, so a change computed from stale in-memory records can
// never clobber the other writer's newer ones. Reads are cached, keyed
// on the file's (mtime, size) stamp, for the same reason. That is what
// lets two skeleton apps share one data file with no integration code.
//
// Two contracts callers must know:
// - Snapshots, not references. Every array that crosses the store's
//   boundary — out of all()/mutate(), into save() — is a deep copy, so
//   mutating a returned array (or one you just saved) can never corrupt
//   the cache or bypass another layer's validation.
// - Short holds. The lock is held only for one read-modify-write of a
//   small file (milliseconds). A mutate() callback must not do slow
//   work, and must never call save()/clear()/mutate() on the same
//   store — nested writes are rejected immediately instead of
//   deadlocking against the store's own lockfile.
// Deliberately boring beyond that: swap this one module when a real
// database shows up.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
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

interface FileStamp {
  mtimeMs: number;
  size: number;
}

export class JsonStore<T> {
  private records: T[] | null = null;
  private loadedStamp: FileStamp | null = null;
  /**
   * Marks the async context of a mutate() callback. A write entered
   * while this is set is a NESTED write (the callback calling back
   * into its own store) and is rejected; concurrent writes from
   * independent callers carry no mark and simply serialise on the
   * lockfile, as they should.
   */
  private readonly writeContext = new AsyncLocalStorage<boolean>();

  constructor(private readonly filePath: string) {}

  /** Load from disk; reloads if the file changed since the last load. */
  async all(): Promise<T[]> {
    const stamp = await this.stamp();
    if (this.records !== null && sameStamp(stamp, this.loadedStamp)) {
      return structuredClone(this.records);
    }
    let loaded: T[];
    try {
      const raw = await readFile(this.filePath, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Store file ${this.filePath} does not contain valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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
    this.loadedStamp = stamp;
    return structuredClone(loaded);
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
   * from all() *inside* the lock, whose stamp check reloads the file
   * if it changed since this instance last loaded it — so `update`
   * merges onto the freshest data instead of overwriting a concurrent
   * writer's records. Returns the persisted contents.
   */
  async mutate(update: (current: T[]) => T[] | Promise<T[]>): Promise<T[]> {
    return this.withLock(async () => {
      const current = await this.all();
      const next = await this.writeContext.run(true, () => update(current));
      await this.writeAll(next);
      return next;
    });
  }

  /** The atomic write itself: temp file, then rename over the target. */
  private async writeAll(records: T[]): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(records, null, 2) + "\n", "utf8");
    // Stamp the temp file BEFORE the rename and adopt that stamp for
    // the cached copy: a rewrite by another process landing after our
    // rename then has a different stamp, so the cache can never adopt
    // a foreign write's stamp for our own contents.
    const tmpStat = await stat(tmp);
    await rename(tmp, this.filePath);
    this.records = structuredClone(records);
    this.loadedStamp = { mtimeMs: tmpStat.mtimeMs, size: tmpStat.size };
  }

  private async withLock<R>(fn: () => Promise<R>): Promise<R> {
    if (this.writeContext.getStore() === true) {
      throw new Error(
        "JsonStore: nested write — save/clear/mutate cannot be called from inside a mutate callback",
      );
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    const token = await this.acquireLock();
    try {
      return await fn();
    } finally {
      await this.releaseLock(token);
    }
  }

  /**
   * Take the lockfile by creating it exclusively ("wx" fails if it
   * already exists), writing our ownership token into it. Retries with
   * a small jittered backoff; a lock older than LOCK_STALE_MS is
   * treated as abandoned and broken. Returns the token.
   */
  private async acquireLock(): Promise<string> {
    const lockPath = `${this.filePath}.lock`;
    const token = `${process.pid}:${Date.now()}:${randomUUID()}`;
    for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt++) {
      try {
        await writeFile(lockPath, `${token}\n`, { flag: "wx" });
        return token;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      // Someone holds the lock. Break it if it looks abandoned — the
      // holder may have crashed between acquiring and releasing.
      try {
        const held = await stat(lockPath);
        if (Date.now() - held.mtimeMs > LOCK_STALE_MS) {
          // Break by moving the stale lock aside, never by deleting
          // the path outright: rename moves only the lock we actually
          // saw, so a fresh lock another process took at the same path
          // in the meantime is never destroyed under its holder.
          const aside = `${lockPath}.stale-${token}`;
          try {
            await rename(lockPath, aside);
            await rm(aside, { force: true });
          } catch {
            // Another waiter moved it first — either way it is gone.
          }
          continue;
        }
      } catch {
        continue; // the holder released it mid-check — retry at once
      }
      if (attempt === LOCK_ATTEMPTS) break;
      await delay(LOCK_RETRY_MIN_MS + Math.random() * LOCK_RETRY_SPREAD_MS);
    }
    throw new Error(
      `Could not acquire store lock ${lockPath} after ${LOCK_ATTEMPTS} attempts — another process is holding it; if that process crashed, its lock is broken automatically once it is ${LOCK_STALE_MS / 1000}s old, so retrying is safe`,
    );
  }

  /**
   * Remove the lockfile — but only if it still holds OUR token. If our
   * hold ever outlived LOCK_STALE_MS, another process may have broken
   * the lock as stale and taken its own; that lock is theirs to
   * release, and deleting it would let a third writer in mid-hold.
   */
  private async releaseLock(token: string): Promise<void> {
    const lockPath = `${this.filePath}.lock`;
    try {
      const held = await readFile(lockPath, "utf8");
      if (held.trim() === token) await rm(lockPath, { force: true });
    } catch {
      // Lock already gone or unreadable — nothing of ours to remove.
    }
  }

  private async stamp(): Promise<FileStamp | null> {
    try {
      const s = await stat(this.filePath);
      return { mtimeMs: s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  }
}

function sameStamp(a: FileStamp | null, b: FileStamp | null): boolean {
  if (a === null || b === null) return a === b;
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}
