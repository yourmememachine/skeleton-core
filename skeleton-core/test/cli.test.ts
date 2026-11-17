import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppError,
  NotFoundError,
  ValidationError,
  exitCodeFor,
  parseArgv,
} from "../src/index.js";

test("parseArgv splits command, positionals and flags", () => {
  const { command, ctx } = parseArgv(["add", "Buy milk", "--status", "doing", "--json"]);
  assert.equal(command, "add");
  assert.deepEqual(ctx.args, ["Buy milk"]);
  assert.equal(ctx.flags.status, "doing");
  assert.equal(ctx.flags.json, true);
});

test("parseArgv defaults to the help command", () => {
  assert.equal(parseArgv([]).command, "help");
});

test("exit codes: validation 2, not-found 3, other app errors 1", () => {
  assert.equal(exitCodeFor(new ValidationError("x")), 2);
  assert.equal(exitCodeFor(new NotFoundError("x")), 3);
  assert.equal(exitCodeFor(new AppError("x", "OTHER", 500)), 1);
  assert.equal(exitCodeFor(new Error("plain")), 1);
});
