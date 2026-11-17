// Shutdown: graceful-exit helper. Register cleanup functions; they run
// once, in registration order, on SIGINT/SIGTERM, then the process
// exits 0. Pass { catchErrors: true } to also run the same cleanups —
// and exit 1 — on uncaughtException / unhandledRejection, so a crashed
// process still closes its server and store instead of dying dirty.
// Error handling is opt-in: by default the process keeps Node's
// default crash behaviour.

import type { Logger } from "./logger.js";

export type Cleanup = () => void | Promise<void>;

export interface ShutdownOptions {
  /** Also run cleanups on uncaughtException / unhandledRejection, then exit 1. */
  catchErrors?: boolean;
}

export function onShutdown(log: Logger, ...args: Array<Cleanup | ShutdownOptions>): void {
  const cleanups: Cleanup[] = [];
  let options: ShutdownOptions = {};
  for (const arg of args) {
    if (typeof arg === "function") cleanups.push(arg);
    else options = arg;
  }

  let running = false;
  const handle = async (signal: string, exitCode: number): Promise<void> => {
    if (running) return;
    running = true;
    log.info("shutting down", { signal });
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (err) {
        log.error("cleanup failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }
    process.exit(exitCode);
  };

  process.once("SIGINT", () => void handle("SIGINT", 0));
  process.once("SIGTERM", () => void handle("SIGTERM", 0));

  if (options.catchErrors === true) {
    process.once("uncaughtException", (err: Error) => {
      log.error("uncaught exception", { error: err.message });
      void handle("uncaughtException", 1);
    });
    process.once("unhandledRejection", (reason: unknown) => {
      log.error("unhandled rejection", {
        error: reason instanceof Error ? reason.message : String(reason),
      });
      void handle("unhandledRejection", 1);
    });
  }
}
