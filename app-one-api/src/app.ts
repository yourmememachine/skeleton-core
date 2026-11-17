// app-one-api — router factory. Kept separate from main.ts so tests can
// build the exact production router against a throwaway store file.

import {
  JsonStore,
  Reply,
  Router,
  TaskService,
  type Task,
} from "../../skeleton-core/src/index.js";

function bodyObject(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

export function createTaskRouter(storePath: string, serviceName: string): Router {
  const tasks = new TaskService(new JsonStore<Task>(storePath));
  return new Router()
    .health(serviceName)
    .get("/tasks", ({ query }) => tasks.list(query.get("status") ?? undefined))
    .post("/tasks", async ({ body }) => new Reply(201, await tasks.create(bodyObject(body))))
    .get("/tasks/:id", ({ params }) => tasks.get(params.id as string))
    .patch("/tasks/:id", ({ params, body }) => tasks.update(params.id as string, bodyObject(body)))
    .delete("/tasks/:id", async ({ params }) => {
      await tasks.remove(params.id as string);
      return undefined; // 204 No Content
    });
}
