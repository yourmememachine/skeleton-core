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
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] as string;
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { command, ctx: { args, flags } };
}

/** Stable exit codes: 0 ok, 1 internal, 2 usage/validation, 3 not found. */
export function exitCodeFor(err: unknown): number {
  if (err instanceof ValidationError) return 2;
  if (err instanceof NotFoundError) return 3;
  if (err instanceof AppError) return 1;
  return 1;
}

export class Cli {
  private readonly commands = new Map<string, { usage: string; run: Command }>();

  constructor(private readonly programName: string) {}

  command(name: string, usage: string, run: Command): this {
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
