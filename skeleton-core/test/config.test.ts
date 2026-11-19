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

test("PORT spellings Number() would reinterpret are rejected", () => {
  for (const raw of ["0x10", "1e3", "3000.0", " 8080 ", ""]) {
    assert.throws(() => loadConfig({ PORT: raw }), /Invalid PORT/, `PORT=${JSON.stringify(raw)}`);
  }
});

test("empty SERVICE_NAME / STORE_FILE fail fast; LOG_LEVEL is trimmed", () => {
  assert.throws(() => loadConfig({ SERVICE_NAME: "   " }), /Invalid SERVICE_NAME/);
  assert.throws(() => loadConfig({ STORE_FILE: "" }), /Invalid STORE_FILE/);
  assert.equal(loadConfig({ LOG_LEVEL: " INFO " }).logLevel, "info");
  assert.equal(loadConfig({ SERVICE_NAME: " svc " }).serviceName, "svc");
});

test("requirePort: false skips PORT validation (the CLI binds no port)", () => {
  const cfg = loadConfig({ PORT: "abc" }, { requirePort: false });
  assert.equal(cfg.port, 3000); // default, unused by the caller
  assert.equal(cfg.storePath, "data/tasks.json");
});
