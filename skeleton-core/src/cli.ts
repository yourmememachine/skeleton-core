// CLI transport: argv parsing + subcommand dispatch + exit-code mapping.
// The mirror of the HTTP transport: commands call the same core services,
// and AppErrors become stable exit codes instead of HTTP statuses.

import { AppError, NotFoundError, ValidationError } from "./errors.js";

export interface CliContext {
  /** Positional arguments after the command name. */
  args: string[];
  /** --name value pairs and --boolean flags (value `true`). */
  flags: Record<string, string | boolean>;
}

export type Command = (ctx: CliContext) => Promise<void> | void;

export function parseArgv(argv: string[]): { command: string; ctx: CliContext } {
  const [command = "help", ...rest] = argv;
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let flagsDone = false;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] as string;
    if (!flagsDone && token === "--") {
      flagsDone = true; // everything after "--" is a positional, verbatim
      continue;
    }
    if (!flagsDone && token.startsWith("--")) {
      const name = token.slice(2);
      const eq = name.indexOf("=");
      if (eq >= 0) {
        // --name=value: the value is attached; never consume the
        // following token (it is a positional or another flag).
        flags[name.slice(0, eq)] = name.slice(eq + 1);
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      args.push(token);
    }
  }
  return { command, ctx: { args, flags } };
}

/**
 * Stable exit codes: 0 ok, 1 internal, 2 usage/validation, 3 not found.
 * Mapped from the error's HTTP status so the CLI and HTTP transports
 * agree on the same AppError, whichever class carries it.
 */
export function exitCodeFor(err: unknown): number {
  if (err instanceof ValidationError) return 2;
  if (err instanceof NotFoundError) return 3;
  if (err instanceof AppError) {
    if (err.httpStatus === 400) return 2;
    if (err.httpStatus === 404) return 3;
  }
  return 1;
}

export class Cli {
  private readonly commands = new Map<string, { usage: string; run: Command }>();

  constructor(private readonly programName: string) {}

  command(name: string, usage: string, run: Command): this {
    // "help" is intercepted by run() before the map is consulted, so a
    // command registered under it (or its aliases) would be listed in
    // the usage text yet unreachable; duplicates would silently shadow
    // the first registration. Refuse both, loudly, at startup.
    if (name === "help" || name === "--help" || name === "-h") {
      throw new Error(`"${name}" is reserved for the built-in help command`);
    }
    if (this.commands.has(name)) {
      throw new Error(`duplicate command "${name}"`);
    }
    this.commands.set(name, { usage, run });
    return this;
  }

  usageText(): string {
    const lines = [`Usage: ${this.programName} <command> [args] [--flags]`, "", "Commands:"];
    for (const [name, cmd] of this.commands) lines.push(`  ${name.padEnd(10)} ${cmd.usage}`);
    lines.push(`  ${"help".padEnd(10)} Show this help`);
    return lines.join("\n");
  }

  /** Runs the command; returns the process exit code (never throws). */
  async run(argv: string[]): Promise<number> {
    const { command, ctx } = parseArgv(argv);
    if (command === "help" || command === "--help" || command === "-h") {
      console.log(this.usageText());
      return 0;
    }
    const cmd = this.commands.get(command);
    if (!cmd) {
      console.error(`Unknown command "${command}".\n\n${this.usageText()}`);
      return 2;
    }
    try {
      await cmd.run(ctx);
      return 0;
    } catch (err) {
      if (err instanceof AppError) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return exitCodeFor(err);
    }
  }
}
