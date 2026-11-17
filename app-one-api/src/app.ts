// app-one-api — router factory. Kept separate from main.ts so tests can
// build the exact production router against a throwaway store file.

import {
  JsonStore,
  Reply,
  Router,
  TaskService,
  type Task,
  type TaskPatch,
  type TaskStatus,
} from "../../skeleton-core/src/index.js";

function bodyObject(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/**
 * Shape an untrusted JSON body into a TaskPatch. The casts live here,
 * at the transport boundary, and nowhere else; the values themselves
 * are still validated by the service before anything is stored.
 */
function asTaskPatch(body: unknown): TaskPatch {
  const obj = bodyObject(body);
  const patch: TaskPatch = {};
  if (obj.title !== undefined) patch.title = obj.title as string;
  if (obj.status !== undefined) patch.status = obj.status as TaskStatus;
  return patch;
}

export function createTaskRouter(storePath: string, serviceName: string): Router {
  const tasks = new TaskService(new JsonStore<Task>(storePath));
  return new Router()
    .health(serviceName)
    .get("/tasks", ({ query }) => tasks.list(query.get("status") ?? undefined))
    .post("/tasks", async ({ body }) => new Reply(201, await tasks.create(bodyObject(body))))
    .get("/tasks/:id", ({ params }) => tasks.get(params.id!))
    .patch("/tasks/:id", ({ params, body }) => tasks.update(params.id!, asTaskPatch(body)))
    .delete("/tasks/:id", async ({ params }) => {
      await tasks.remove(params.id!);
      return undefined; // 204 No Content
    });
}
