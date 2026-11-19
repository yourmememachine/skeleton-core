// Shutdown: graceful-exit helper. Register cleanup functions; they run
// once, in registration order, on SIGINT/SIGTERM, then the process
// exits 0. Pass { catchErrors: true } to also run the same cleanups —
// and exit 1 — on uncaughtException / unhandledRejection, so a crashed
// process still closes its server and store instead of dying dirty.
// Error handling is opt-in: by default the process keeps Node's
// default crash behaviour.
//
// Call onShutdown exactly ONCE per process: each call installs its own
// listeners and its own run-guard, so two registrations would race
// each other to process.exit and could truncate each other's cleanups.
// A hung cleanup cannot wedge shutdown forever: the chain is raced
// against SHUTDOWN_TIMEOUT_MS and the process exits anyway (a second
// SIGINT also still kills the process, since the once-listeners are
// already consumed by then).

import type { Logger } from "./logger.js";

/** Upper bound on the whole cleanup chain before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

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
    const runCleanups = (async (): Promise<void> => {
      for (const cleanup of cleanups) {
        try {
          await cleanup();
        } catch (err) {
          log.error("cleanup failed", { error: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        log.error("shutdown timed out — exiting anyway", { timeoutMs: SHUTDOWN_TIMEOUT_MS });
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
      timer.unref?.();
    });
    await Promise.race([runCleanups, timedOut]);
    if (timer !== undefined) clearTimeout(timer);
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
