import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "../src/index.js";

test("emits structured JSON lines with level and meta", () => {
  const lines: string[] = [];
  const log = createLogger("debug", (l) => lines.push(l));
  log.info("hello", { answer: 42 });
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0] as string) as Record<string, unknown>;
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "hello");
  assert.equal(parsed.answer, 42);
  assert.equal(typeof parsed.ts, "string");
});

test("filters below the minimum level", () => {
  const lines: string[] = [];
  const log = createLogger("warn", (l) => lines.push(l));
  log.debug("no");
  log.info("no");
  log.warn("yes");
  log.error("yes");
  assert.equal(lines.length, 2);
});

test("caller meta cannot overwrite the reserved fields", () => {
  const lines: string[] = [];
  const log = createLogger("info", (l) => lines.push(l));
  log.info("real", { level: "error", msg: "forged", ts: "1970-01-01" });
  const parsed = JSON.parse(lines[0] as string) as Record<string, unknown>;
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "real");
  assert.notEqual(parsed.ts, "1970-01-01");
});

test("unserialisable meta degrades instead of throwing; Errors keep their message", () => {
  const lines: string[] = [];
  const log = createLogger("info", (l) => lines.push(l));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  log.info("circ", circular); // must not throw
  assert.equal(lines.length, 1);
  assert.equal((JSON.parse(lines[0] as string) as Record<string, unknown>).msg, "circ");
  log.error("failed", { err: new Error("the real cause") });
  const parsed = JSON.parse(lines[1] as string) as { err: { message: string } };
  assert.equal(parsed.err.message, "the real cause");
});

test("an unknown minimum level is rejected, not silently ignored", () => {
  assert.throws(() => createLogger("bogus" as "info"), /Unknown log level/);
});
