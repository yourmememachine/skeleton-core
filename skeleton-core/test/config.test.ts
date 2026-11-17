import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/index.js";

test("defaults are sane", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.logLevel, "info");
  assert.equal(cfg.serviceName, "skeleton-app");
  assert.equal(cfg.storePath, "data/tasks.json");
});

test("env overrides are honoured", () => {
  const cfg = loadConfig({ PORT: "8080", LOG_LEVEL: "DEBUG", SERVICE_NAME: "svc", STORE_FILE: "/tmp/x.json" });
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.logLevel, "debug");
  assert.equal(cfg.serviceName, "svc");
  assert.equal(cfg.storePath, "/tmp/x.json");
});

test("invalid PORT fails fast", () => {
  assert.throws(() => loadConfig({ PORT: "abc" }), /Invalid PORT/);
  assert.throws(() => loadConfig({ PORT: "70000" }), /Invalid PORT/);
  assert.throws(() => loadConfig({ PORT: "0" }), /Invalid PORT/);
});

test("invalid LOG_LEVEL fails fast", () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: "chatty" }), /Invalid LOG_LEVEL/);
});
