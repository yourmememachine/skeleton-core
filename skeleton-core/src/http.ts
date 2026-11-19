// HTTP transport: a small router on node:http. Routes are "METHOD /path"
// patterns with :params. Handlers return a value (sent as JSON) or throw
// an AppError (translated to its httpStatus). No framework, no magic.
//
// Routing semantics, deliberately simple — know them before adding
// routes: routes are tried in registration order and the first match
// wins, so register static routes before :param routes that could
// shadow them (and never register the same method+pattern twice — the
// second is unreachable). A path that exists only under another method
// is a 404, not a 405. Path segments are split on "/" with empty
// segments dropped ("/tasks//1" routes like "/tasks/1"); :param values
// are percent-decoded, static segments are matched literally.
// Bodies are always parsed as JSON regardless of Content-Type (an
// empty body becomes {}); GET/DELETE bodies are discarded unread
// beyond draining the stream so the connection stays reusable.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AppError } from "./errors.js";
import type { Logger } from "./logger.js";

export interface RequestContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

/** Return this from a handler to choose the HTTP status (default 200). */
export class Reply {
  constructor(
    readonly status: number,
    readonly value: unknown,
  ) {}
}

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

const MAX_BODY_BYTES = 1_000_000;

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method: method.toUpperCase(), segments: splitPath(pattern), handler });
    return this;
  }
  get(pattern: string, handler: Handler): this { return this.add("GET", pattern, handler); }
  post(pattern: string, handler: Handler): this { return this.add("POST", pattern, handler); }
  patch(pattern: string, handler: Handler): this { return this.add("PATCH", pattern, handler); }
  put(pattern: string, handler: Handler): this { return this.add("PUT", pattern, handler); }
  delete(pattern: string, handler: Handler): this { return this.add("DELETE", pattern, handler); }

  /** Built-in liveness route every skeleton app gets for free. */
  health(serviceName: string): this {
    return this.get("/health", () => ({ status: "ok", service: serviceName }));
  }

  async handle(req: IncomingMessage, res: ServerResponse, log: Logger): Promise<void> {
    // Parse the request-target first, under its own guard: it is
    // client-controlled, and a target the URL parser rejects is a
    // 400 — it must never escape handle() as an unhandled rejection
    // that leaves the client hanging with no response at all.
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      sendJson(res, 400, { error: "VALIDATION", message: "Malformed request URL" });
      log.warn("request failed", { method: req.method ?? "?", path: req.url ?? "?", code: "VALIDATION" });
      return;
    }
    const segments = splitPath(url.pathname);
    const method = (req.method ?? "GET").toUpperCase();
    try {
      for (const route of this.routes) {
        if (route.method !== method) continue;
        const params = matchSegments(route.segments, segments);
        if (params === null) continue;
        let body: unknown;
        if (method === "GET" || method === "DELETE") {
          req.resume(); // drain any body so keep-alive stays usable
          body = undefined;
        } else {
          body = await readJsonBody(req);
        }
        const result = await route.handler({ params, query: url.searchParams, body });
        if (result instanceof Reply) sendJson(res, result.status, result.value);
        else sendJson(res, result === undefined ? 204 : 200, result);
        log.debug("request handled", { method, path: url.pathname });
        return;
      }
      throw new AppError(`No route for ${method} ${url.pathname}`, "NOT_FOUND", 404);
    } catch (err) {
      if (err instanceof AppError) {
        sendJson(res, err.httpStatus, { error: err.code, message: err.message });
        log.warn("request failed", { method, path: url.pathname, code: err.code });
      } else {
        sendJson(res, 500, { error: "INTERNAL", message: "Internal server error" });
        log.error("request crashed", {
          method,
          path: url.pathname,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

export function serve(router: Router, port: number, log: Logger): Server {
  const server = createServer((req, res) => {
    void router.handle(req, res, log);
  });
  // Bind failures (port in use, bad port) arrive here, not as an
  // uncaught exception with a stack dump: log them through the app's
  // own logger. Apps that must exit on a failed bind add their own
  // 'error' listener that calls process.exit.
  server.on("error", (err) => log.error("server error", { error: err.message }));
  server.listen(port, () => log.info("listening", { port }));
  return server;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    const a = actual[i];
    if (p === undefined || a === undefined) return null; // lengths already checked equal
    if (p.startsWith(":")) params[p.slice(1)] = decodeParam(a);
    else if (p !== a) return null;
  }
  return params;
}

/**
 * Decode one path parameter. A malformed % sequence makes
 * decodeURIComponent throw URIError — that is the client's error
 * (400 VALIDATION), not a server crash (500 INTERNAL).
 */
function decodeParam(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new AppError("Malformed URL encoding", "VALIDATION", 400);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new AppError("Request body too large", "VALIDATION", 413);
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError("Request body is not valid JSON", "VALIDATION", 400);
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  const payload = JSON.stringify(value ?? null);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}
