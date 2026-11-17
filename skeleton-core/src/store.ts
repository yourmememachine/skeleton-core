// Store: a tiny JSON-file store. One file, one array of records.
// Writes are atomic (write to a temp file, then rename) so a crash
// mid-write can never corrupt the data file. Reads are cached, but the
// cache is keyed on the file's mtime: if another process rewrote the
// file (e.g. the CLI while the API is running), the next read reloads
// it. That is what lets two skeleton apps share one data file with no
// integration code. Deliberately boring beyond that: swap this one
// module when a real database shows up.

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

  /** Replace the whole contents and persist atomically. */
  async save(records: T[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(records, null, 2) + "\n", "utf8");
    await rename(tmp, this.filePath);
    this.records = records;
    this.loadedMtimeMs = await this.mtime();
  }

  private async mtime(): Promise<number | null> {
    try {
      return (await stat(this.filePath)).mtimeMs;
    } catch {
      return null;
    }
  }
}
