// Config: environment variables, validated once at startup, fail fast.

export interface AppConfig {
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  serviceName: string;
  /** Path of the JSON data file the store persists to (env STORE_FILE). */
  storePath: string;
}

const LEVELS = ["debug", "info", "warn", "error"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const portRaw = env.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${portRaw}": expected an integer 1-65535`);
  }
  const levelRaw = (env.LOG_LEVEL ?? "info").toLowerCase();
  if (!(LEVELS as readonly string[]).includes(levelRaw)) {
    throw new Error(`Invalid LOG_LEVEL "${levelRaw}": expected one of ${LEVELS.join(", ")}`);
  }
  return {
    port,
    logLevel: levelRaw as AppConfig["logLevel"],
    serviceName: env.SERVICE_NAME ?? "skeleton-app",
    storePath: env.STORE_FILE ?? "data/tasks.json",
  };
}
