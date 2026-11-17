// Shutdown: graceful-exit helper. Register cleanup functions; they run
// once, in registration order, on SIGINT/SIGTERM, then the process exits.

import type { Logger } from "./logger.js";

export function onShutdown(log: Logger, ...cleanups: Array<() => void | Promise<void>>): void {
  let running = false;
  const handle = async (signal: string): Promise<void> => {
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
    process.exit(0);
  };
  process.once("SIGINT", () => void handle("SIGINT"));
  process.once("SIGTERM", () => void handle("SIGTERM"));
}
