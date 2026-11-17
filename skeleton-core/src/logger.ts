// Logger: tiny structured JSON logger behind an interface apps can swap.

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof ORDER;

export function createLogger(minLevel: Level = "info", sink: (line: string) => void = console.log): Logger {
  const emit = (level: Level) => (msg: string, meta: Record<string, unknown> = {}) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    sink(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
  };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}
