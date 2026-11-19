import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppError,
  Cli,
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

test("exit codes follow the status on a plain AppError too", () => {
  // The HTTP transport maps by status; the CLI must agree for the
  // same error object, whichever class carries it.
  assert.equal(exitCodeFor(new AppError("x", "VALIDATION", 400)), 2);
  assert.equal(exitCodeFor(new AppError("x", "NOT_FOUND", 404)), 3);
});

test("parseArgv understands the --flag=value form", () => {
  const attached = parseArgv(["add", "Title", "--status=doing"]);
  assert.equal(attached.ctx.flags.status, "doing");
  assert.deepEqual(attached.ctx.args, ["Title"]);
  // The token after --flag=value is a positional, never a "value".
  const followed = parseArgv(["add", "--status=doing", "Title"]);
  assert.equal(followed.ctx.flags.status, "doing");
  assert.deepEqual(followed.ctx.args, ["Title"]);
});

test("parseArgv treats -- as the end of flags", () => {
  const { ctx } = parseArgv(["add", "--", "--literal", "plain"]);
  assert.deepEqual(ctx.args, ["--literal", "plain"]);
  assert.deepEqual(ctx.flags, {});
});

test("Cli.run: exit codes for success, help, unknown and failing commands", async () => {
  const printed: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...parts: unknown[]) => printed.push(parts.join(" "));
  console.error = (...parts: unknown[]) => printed.push(parts.join(" "));
  try {
    const cli = new Cli("probe")
      .command("ok", "ok — succeeds", () => {})
      .command("bad", "bad — validation error", () => {
        throw new ValidationError("nope");
      })
      .command("gone", "gone — not found", () => {
        throw new NotFoundError("thing");
      });
    assert.equal(await cli.run(["ok"]), 0);
    assert.equal(await cli.run(["help"]), 0);
    assert.equal(await cli.run(["wat"]), 2);
    assert.equal(await cli.run(["bad"]), 2);
    assert.equal(await cli.run(["gone"]), 3);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  assert.ok(printed.some((l) => l.includes("Usage: probe")));
});

test("Cli refuses reserved and duplicate command names at registration", () => {
  assert.throws(() => new Cli("x").command("help", "h", () => {}), /reserved/);
  assert.throws(() => new Cli("x").command("--help", "h", () => {}), /reserved/);
  const cli = new Cli("x").command("go", "g", () => {});
  assert.throws(() => cli.command("go", "g2", () => {}), /duplicate/);
});
