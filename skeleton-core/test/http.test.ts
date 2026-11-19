// Unit tests for the HTTP transport itself — app-one's integration
// test covers it through one router; these pin the transport contract
// (Reply, 204, 404 shape, body cap, params/query, malformed targets)
// at the level where the core is reused.

import assert from "node:assert/strict";
import type { Server } from "node:http";
import { connect } from "node:net";
import { after, before, test } from "node:test";
import { Reply, Router, createLogger, serve } from "../src/index.js";

let server: Server;
let base: string;
let port: number;

before(async () => {
  const router = new Router()
    .health("http-test")
    .get("/echo/:id", ({ params, query }) => ({ id: params.id, q: query.get("q") }))
    .post("/created", () => new Reply(201, { made: true }))
    .get("/nothing", () => undefined)
    .post("/big", ({ body }) => ({ received: body !== undefined }));
  server = serve(router, 0, createLogger("error", () => {}));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  port = address.port;
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("health route and :param + query extraction", async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", service: "http-test" });
  const echo = await fetch(`${base}/echo/abc?q=hello`);
  assert.equal(echo.status, 200);
  assert.deepEqual(await echo.json(), { id: "abc", q: "hello" });
});

test("Reply chooses the status; an undefined result is a 204", async () => {
  const created = await fetch(`${base}/created`, { method: "POST" });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { made: true });
  const nothing = await fetch(`${base}/nothing`);
  assert.equal(nothing.status, 204);
  assert.equal(await nothing.text(), "");
});

test("unknown route is a 404 with the standard error shape", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "NOT_FOUND");
  assert.match(json.message, /No route for GET \/nope/);
});

test("a body over the 1 MB cap is a 413", async () => {
  const res = await fetch(`${base}/big`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pad: "x".repeat(1_000_001) }),
  });
  assert.equal(res.status, 413);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "VALIDATION");
});

test("a malformed request-target gets a 400 response, not a hung socket", async () => {
  // fetch/URL cannot produce this target, so write it raw — this is
  // the request line a hostile or broken client can actually send.
  const raw = await new Promise<string>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write("GET http://[::1/bad HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString("utf8")));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    setTimeout(() => reject(new Error("timed out waiting for a response")), 5000);
  });
  assert.match(raw, /^HTTP\/1\.1 400 /);
  assert.match(raw, /VALIDATION/);
});
