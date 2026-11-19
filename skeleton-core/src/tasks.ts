// Tasks: the shared domain service. Both proof apps (REST API and CLI)
// drive THIS service over the same store file — one model, one set of
// rules, two transports. Validation lives here, never in a transport.

import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "./errors.js";
import type { JsonStore } from "./store.js";

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPatch {
  title?: string;
  status?: TaskStatus;
}

function cleanTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new ValidationError("title must be a string");
  const title = raw.trim();
  if (title.length === 0) throw new ValidationError("title must not be empty");
  if (title.length > 200) throw new ValidationError("title must be at most 200 characters");
  return title;
}

function cleanStatus(raw: unknown): TaskStatus {
  if (!(TASK_STATUSES as readonly unknown[]).includes(raw)) {
    throw new ValidationError(`status must be one of ${TASK_STATUSES.join(", ")}`);
  }
  return raw as TaskStatus;
}

export class TaskService {
  constructor(private readonly store: JsonStore<Task>) {}

  async create(input: { title?: unknown; status?: unknown }): Promise<Task> {
    if (input === null || typeof input !== "object") {
      throw new ValidationError("task input must be an object");
    }
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title: cleanTitle(input.title),
      status: input.status === undefined ? "todo" : cleanStatus(input.status),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.mutate((current) => [...current, task]);
    return task;
  }

  async list(status?: string): Promise<Task[]> {
    const all = await this.store.all();
    if (status === undefined) return [...all];
    const wanted = cleanStatus(status);
    return all.filter((t) => t.status === wanted);
  }

  async get(id: string): Promise<Task> {
    const all = await this.store.all();
    const task = all.find((t) => t.id === id);
    if (!task) throw new NotFoundError(`task ${id}`);
    return task;
  }

  async update(id: string, patch: TaskPatch): Promise<Task> {
    if (patch === null || typeof patch !== "object") {
      throw new ValidationError("patch must be an object");
    }
    let updated: Task | undefined;
    await this.store.mutate((all) => {
      const existing = all.find((t) => t.id === id);
      if (!existing) throw new NotFoundError(`task ${id}`);
      // An empty patch is a client error, not a silent no-op write:
      // without this check it would bump updatedAt and rewrite the
      // file while changing nothing.
      if (patch.title === undefined && patch.status === undefined) {
        throw new ValidationError("patch must include title or status");
      }
      const next: Task = { ...existing };
      if (patch.title !== undefined) next.title = cleanTitle(patch.title);
      if (patch.status !== undefined) next.status = cleanStatus(patch.status);
      next.updatedAt = new Date().toISOString();
      updated = next;
      return all.map((t) => (t.id === id ? next : t));
    });
    if (!updated) throw new NotFoundError(`task ${id}`); // unreachable — mutate threw above
    return updated;
  }

  async remove(id: string): Promise<Task> {
    let removed: Task | undefined;
    await this.store.mutate((all) => {
      const task = all.find((t) => t.id === id);
      if (!task) throw new NotFoundError(`task ${id}`);
      removed = task;
      return all.filter((t) => t.id !== id);
    });
    if (!removed) throw new NotFoundError(`task ${id}`); // unreachable — mutate threw above
    return removed;
  }
}
