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
