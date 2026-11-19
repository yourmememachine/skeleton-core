// Config: environment variables, validated once at startup, fail fast.

export interface AppConfig {
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  serviceName: string;
  /** Path of the JSON data file the store persists to (env STORE_FILE). */
  storePath: string;
}

export interface LoadConfigOptions {
  /**
   * Validate PORT (default true). Transports that never bind a port —
   * the CLI — pass false so an unrelated PORT in the environment cannot
   * block them; the returned config then carries the default port,
   * unused.
   */
  requirePort?: boolean;
}

const LEVELS = ["debug", "info", "warn", "error"] as const;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  let port = 3000;
  if (options.requirePort !== false) {
    const portRaw = env.PORT ?? "3000";
    // Digits only, checked on the raw string: Number() alone would
    // silently reinterpret "0x10", "1e3", "3000.0" or " 8080 ".
    if (!/^\d+$/.test(portRaw)) {
      throw new Error(`Invalid PORT "${portRaw}": expected an integer 1-65535`);
    }
    port = Number(portRaw);
    if (port < 1 || port > 65535) {
      throw new Error(`Invalid PORT "${portRaw}": expected an integer 1-65535`);
    }
  }
  const levelRaw = (env.LOG_LEVEL ?? "info").trim().toLowerCase();
  if (!(LEVELS as readonly string[]).includes(levelRaw)) {
    throw new Error(`Invalid LOG_LEVEL "${levelRaw}": expected one of ${LEVELS.join(", ")}`);
  }
  const serviceName = (env.SERVICE_NAME ?? "skeleton-app").trim();
  if (serviceName === "") {
    throw new Error(`Invalid SERVICE_NAME: expected a non-empty name`);
  }
  const storePath = (env.STORE_FILE ?? "data/tasks.json").trim();
  if (storePath === "") {
    throw new Error(`Invalid STORE_FILE: expected a non-empty path`);
  }
  return {
    port,
    logLevel: levelRaw as AppConfig["logLevel"],
    serviceName,
    storePath,
  };
}
