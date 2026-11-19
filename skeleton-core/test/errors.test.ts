import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError, NotFoundError, ValidationError } from "../src/index.js";

test("AppError carries code and httpStatus", () => {
  const err = new AppError("boom", "TEAPOT", 418);
  assert.equal(err.message, "boom");
  assert.equal(err.code, "TEAPOT");
  assert.equal(err.httpStatus, 418);
  assert.equal(err.name, "AppError");
  assert.ok(err instanceof Error);
});

test("NotFoundError is a 404 with a readable message", () => {
  const err = new NotFoundError("task 123");
  assert.equal(err.httpStatus, 404);
  assert.equal(err.code, "NOT_FOUND");
  assert.match(err.message, /task 123 not found/);
  assert.equal(err.name, "NotFoundError");
});

test("ValidationError is a 400", () => {
  const err = new ValidationError("title must not be empty");
  assert.equal(err.httpStatus, 400);
  assert.equal(err.code, "VALIDATION");
  assert.match(err.message, /title must not be empty/);
});

test("AppError rejects a status outside 100-599 at construction", () => {
  // Such a status would crash the HTTP error path itself (writeHead
  // throws), hanging the client the error was meant to answer.
  assert.throws(() => new AppError("x", "BAD", 99), /httpStatus/);
  assert.throws(() => new AppError("x", "BAD", 999), /httpStatus/);
  assert.throws(() => new AppError("x", "BAD", 200.5), /httpStatus/);
});
