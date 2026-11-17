import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger, onShutdown } from "../src/index.js";

const silent = createLogger("error", () => {});

test("error handlers are NOT registered by default", () => {
  const exc = process.listenerCount("uncaughtException");
  const rej = process.listenerCount("unhandledRejection");
  onShutdown(silent, () => {});
  assert.equal(process.listenerCount("uncaughtException"), exc);
  assert.equal(process.listenerCount("unhandledRejection"), rej);
});

test("catchErrors: true registers uncaughtException and unhandledRejection handlers", () => {
  const exc = process.listenerCount("uncaughtException");
  const rej = process.listenerCount("unhandledRejection");
  onShutdown(silent, () => {}, { catchErrors: true });
  assert.equal(process.listenerCount("uncaughtException"), exc + 1);
  assert.equal(process.listenerCount("unhandledRejection"), rej + 1);
});
