// skeleton-core — entry point re-exporting the core modules.
// Apps import everything from here; they never reach into internals.

export { loadConfig, type AppConfig } from "./config.js";
export { createLogger, type Logger } from "./logger.js";
export { AppError, NotFoundError, ValidationError } from "./errors.js";
export { JsonStore } from "./store.js";
export { onShutdown, type Cleanup, type ShutdownOptions } from "./shutdown.js";
export {
  TASK_STATUSES,
  TaskService,
  type Task,
  type TaskPatch,
  type TaskStatus,
} from "./tasks.js";
export { Router, Reply, serve } from "./http.js";
export { Cli, parseArgv, exitCodeFor, type CliContext } from "./cli.js";
